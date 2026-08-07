import type Stripe from "stripe";
import type { PaidSessionType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { stripe } from "../config/stripe.js";
import { logger } from "../lib/logger.js";
import { sendEmail } from "../lib/resend.js";
import { env } from "../config/env.js";
import { PAID_SESSION_CATALOG, computeSessionTotalCents, isValidHeadcount } from "../data/paid-sessions.js";
import { isClassScheduleBlocked } from "../data/booking-rules.js";
import { createCalendarEvent } from "../lib/google-calendar.js";
import { appendSheetRow } from "../lib/google-sheets.js";
import { sendSMS } from "../lib/twilio.js";
import type { CreateSessionBookingInput } from "../routes/schemas/session-booking.schemas.js";
import type { SessionBooking } from "@prisma/client";

// ============================================================
// createSessionBooking — validate, price, create Stripe Checkout
// ============================================================

export async function createSessionBooking(
  input: CreateSessionBookingInput
): Promise<{ url: string }> {
  const sessionType = input.sessionType as PaidSessionType;
  const config = PAID_SESSION_CATALOG[sessionType];

  if (!isValidHeadcount(sessionType, input.headcount)) {
    const err = new Error(
      `${config.label} requires between ${config.minHeadcount} and ${config.maxHeadcount} people`
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  if (isClassScheduleBlocked(input.scheduledDate, input.scheduledTime)) {
    const err = new Error("That time isn't available — please pick another.") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  // Re-check the slot hasn't been taken between the client loading the
  // calendar and submitting — the same race any booking system has to guard.
  const conflict = await prisma.sessionBooking.findFirst({
    where: {
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      OR: [
        { status: "PAID" },
        { status: "PENDING_PAYMENT", createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
      ],
    },
  });
  if (conflict) {
    const err = new Error("That time slot was just booked — please pick another.") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
  const leadConflict = await prisma.lead.findFirst({
    where: {
      type: "CONSULTATION",
      status: { in: ["NEW", "CONFIRMED"] },
      preferredDate: input.scheduledDate,
      preferredTime: input.scheduledTime,
    },
  });
  if (leadConflict) {
    const err = new Error("That time slot was just booked — please pick another.") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  const totalAmountCents = computeSessionTotalCents(sessionType, input.headcount);

  const booking = await prisma.sessionBooking.create({
    data: {
      sessionType,
      headcount: input.headcount,
      totalAmountCents,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      email: input.email,
      phone: input.phone ?? null,
      meetingPreference: input.meetingPreference,
      coachingContext: input.coachingContext ?? null,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      status: "PENDING_PAYMENT",
    },
  });

  const headcountLabel = config.maxHeadcount > 1 ? ` (${input.headcount} ${input.headcount === 1 ? "person" : "people"})` : "";

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: totalAmountCents,
          product_data: {
            name: `${config.label}${headcountLabel}`,
            description: `${input.scheduledDate} at ${input.scheduledTime} — Vintus Performance`,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: input.email,
    success_url: `${input.successUrl}?booking_id=${booking.id}`,
    cancel_url: input.cancelUrl,
    metadata: { sessionBookingId: booking.id },
  });

  await prisma.sessionBooking.update({
    where: { id: booking.id },
    data: { stripeCheckoutSessionId: stripeSession.id },
  });

  logger.info(
    { bookingId: booking.id, sessionType, headcount: input.headcount, totalAmountCents },
    "Session booking created, Stripe Checkout session started"
  );

  return { url: stripeSession.url! };
}

// ============================================================
// handlePaidSessionCompleted — called from the Stripe webhook
// ============================================================

export async function handlePaidSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.sessionBookingId;
  if (!bookingId) return;

  const booking = await prisma.sessionBooking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    logger.warn({ bookingId }, "Paid session checkout completed but booking not found");
    return;
  }

  // Idempotency — Stripe can deliver the same webhook event more than once.
  if (booking.status === "PAID") return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  await prisma.sessionBooking.update({
    where: { id: bookingId },
    data: { status: "PAID", stripePaymentIntentId: paymentIntentId, confirmationSentAt: new Date() },
  });

  const config = PAID_SESSION_CATALOG[booking.sessionType];

  const meetLink = await createCalendarEvent({
    summary: `${config.label} — ${booking.firstName}${booking.lastName ? " " + booking.lastName : ""}`,
    description: [
      `Client: ${booking.firstName}${booking.lastName ? " " + booking.lastName : ""} (${booking.email})`,
      booking.phone ? `Phone: ${booking.phone}` : "",
      `Meeting via: ${booking.meetingPreference}`,
      booking.coachingContext ? `What they want help with: ${booking.coachingContext}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    scheduledDate: booking.scheduledDate,
    scheduledTime: booking.scheduledTime,
    durationMinutes: config.durationMinutes,
    attendeeEmail: booking.email,
  });

  if (meetLink) {
    await prisma.sessionBooking.update({ where: { id: bookingId }, data: { meetLink } });
  }

  appendSheetRow("Sheet1", [
    new Date().toISOString(),
    booking.firstName,
    booking.lastName ?? "",
    booking.email,
    booking.phone ?? "",
    "", // Primary Goal — n/a for a paid session
    "", // Training Days — n/a
    "", // Experience — n/a
    "", // Challenge — n/a
    config.label, // Source
    booking.meetingPreference, // Intent
    "PAID", // Booking Status — booking var predates the status update above
    `${booking.scheduledDate} ${booking.scheduledTime}`, // Booked Time
    [booking.coachingContext, meetLink ? `Meet: ${meetLink}` : ""].filter(Boolean).join(" | "),
  ]);

  // Client confirmation — meeting details + how to reach Anthony directly.
  const contactLines = [`<br><strong>Email:</strong> ${env.COACH_EMAIL}`];
  if (env.COACH_PHONE) contactLines.push(`<br><strong>Phone:</strong> ${env.COACH_PHONE}`);

  const clientBody = [
    `Hi ${booking.firstName},`,
    `<br><br>You're confirmed for your <strong>${config.label}</strong> on <strong>${booking.scheduledDate}</strong> at <strong>${booking.scheduledTime}</strong> (America/New_York).`,
    `<br><br><strong>How we'll connect:</strong> ${booking.meetingPreference}`,
    meetLink ? `<br><strong>Google Meet link:</strong> <a href="${meetLink}">${meetLink}</a>` : "",
    ...contactLines,
    `<br><br>Reach out any time before the session with questions — looking forward to it.`,
  ].join("");

  sendEmail(booking.email, "You're Confirmed — Vintus Performance", clientBody).catch((err) =>
    logger.error({ err, bookingId }, "Failed to send paid-session client confirmation")
  );

  // Admin notification — what Anthony needs to prep for the session.
  const adminBody = [
    `Paid session booked and paid: <strong>${config.label}</strong> — ${booking.headcount} ${booking.headcount === 1 ? "person" : "people"}.`,
    `<br><br><strong>Client:</strong> ${booking.firstName}${booking.lastName ? " " + booking.lastName : ""}`,
    `<br><strong>Email:</strong> ${booking.email}`,
    booking.phone ? `<br><strong>Phone:</strong> ${booking.phone}` : "",
    `<br><strong>When:</strong> ${booking.scheduledDate} at ${booking.scheduledTime}`,
    `<br><strong>Meeting via:</strong> ${booking.meetingPreference}`,
    meetLink ? `<br><strong>Google Meet:</strong> <a href="${meetLink}">${meetLink}</a>` : "",
    booking.coachingContext ? `<br><br><strong>What they want help with:</strong><br>${booking.coachingContext}` : "",
    `<br><br><strong>Charged:</strong> $${(booking.totalAmountCents / 100).toFixed(2)}`,
  ].join("");

  sendEmail(env.COACH_EMAIL, `Paid Session Booked — ${booking.firstName}`, adminBody).catch((err) =>
    logger.error({ err, bookingId }, "Failed to send paid-session admin notification")
  );

  if (env.COACH_PHONE) {
    const smsBody = `Vintus: Booked — ${config.label} with ${booking.firstName}${booking.lastName ? " " + booking.lastName : ""} on ${booking.scheduledDate} at ${booking.scheduledTime}.${meetLink ? ` ${meetLink}` : ""}`;
    sendSMS(env.COACH_PHONE, smsBody).catch((err) =>
      logger.error({ err, bookingId }, "Failed to send paid-session admin SMS")
    );
  }

  logger.info({ bookingId, sessionType: booking.sessionType }, "Paid session marked PAID, emails queued");
}

// ============================================================
// Weekly Coaching Call — free, included with active Private Coaching.
// Confirmed immediately (no Stripe checkout), capped at one upcoming
// call at a time so the concierge relationship stays personal rather
// than clients stacking multiple weeks of calls at once.
// ============================================================

const WEEKLY_CALL_DURATION_MINUTES = PAID_SESSION_CATALOG.PC_WEEKLY_CALL.durationMinutes;

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** The client's next upcoming (not yet passed, not canceled) weekly call, if any. */
export async function getUpcomingWeeklyCall(userId: string): Promise<SessionBooking | null> {
  return prisma.sessionBooking.findFirst({
    where: {
      userId,
      sessionType: "PC_WEEKLY_CALL",
      status: "PAID",
      scheduledDate: { gte: todayDateStr() },
    },
    orderBy: [{ scheduledDate: "asc" }, { scheduledTime: "asc" }],
  });
}

async function requireActivePrivateCoachingClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true, athleteProfile: true },
  });

  if (!user?.subscription || user.subscription.planTier !== "PRIVATE_COACHING" || user.subscription.status !== "ACTIVE") {
    const err = new Error("Weekly coaching calls are included with an active Private Coaching membership.") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
  if (!user.athleteProfile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  return { user, profile: user.athleteProfile };
}

export async function bookWeeklyCoachingCall(
  userId: string,
  scheduledDate: string,
  scheduledTime: string
): Promise<SessionBooking> {
  const { user, profile } = await requireActivePrivateCoachingClient(userId);

  const existing = await getUpcomingWeeklyCall(userId);
  if (existing) {
    const err = new Error(
      `You already have a call scheduled for ${existing.scheduledDate} at ${existing.scheduledTime}. Cancel it first if you'd like to pick a different time.`
    ) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  if (isClassScheduleBlocked(scheduledDate, scheduledTime)) {
    const err = new Error("That time isn't available — please pick another.") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  // Same shared-calendar conflict check paid sessions use, so a weekly call
  // can't double-book a slot a consultation or paid session already holds.
  const [bookingConflict, leadConflict] = await Promise.all([
    prisma.sessionBooking.findFirst({
      where: {
        scheduledDate,
        scheduledTime,
        OR: [
          { status: "PAID" },
          { status: "PENDING_PAYMENT", createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        ],
      },
    }),
    prisma.lead.findFirst({
      where: {
        type: "CONSULTATION",
        status: { in: ["NEW", "CONFIRMED"] },
        preferredDate: scheduledDate,
        preferredTime: scheduledTime,
      },
    }),
  ]);
  if (bookingConflict || leadConflict) {
    const err = new Error("That time slot was just booked — please pick another.") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  const booking = await prisma.sessionBooking.create({
    data: {
      sessionType: "PC_WEEKLY_CALL",
      headcount: 1,
      totalAmountCents: 0,
      userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: user.email,
      phone: profile.phone,
      meetingPreference: "google-meet",
      scheduledDate,
      scheduledTime,
      status: "PAID",
      confirmationSentAt: new Date(),
    },
  });

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  const meetLink = await createCalendarEvent({
    summary: `Weekly Coaching Call — ${fullName}`,
    description: `Private Coaching weekly call with ${fullName} (${user.email}).`,
    scheduledDate,
    scheduledTime,
    durationMinutes: WEEKLY_CALL_DURATION_MINUTES,
    attendeeEmail: user.email,
  });

  if (meetLink) {
    await prisma.sessionBooking.update({ where: { id: booking.id }, data: { meetLink } });
  }

  const contactLines = [`<br><strong>Email:</strong> ${env.COACH_EMAIL}`];
  if (env.COACH_PHONE) contactLines.push(`<br><strong>Phone:</strong> ${env.COACH_PHONE}`);

  const clientBody = [
    `Hi ${profile.firstName},`,
    `<br><br>You're confirmed for your weekly coaching call on <strong>${scheduledDate}</strong> at <strong>${scheduledTime}</strong> (America/New_York).`,
    meetLink ? `<br><br><strong>Google Meet link:</strong> <a href="${meetLink}">${meetLink}</a>` : "",
    ...contactLines,
    `<br><br>Anything you want to cover, text me beforehand and I'll come prepared.`,
  ].join("");

  sendEmail(user.email, "Your Weekly Call Is Confirmed — Vintus Performance", clientBody).catch((err) =>
    logger.error({ err, bookingId: booking.id }, "Failed to send weekly-call client confirmation")
  );

  const adminBody = [
    `Weekly coaching call booked: <strong>${fullName}</strong> (${user.email}).`,
    `<br><br><strong>When:</strong> ${scheduledDate} at ${scheduledTime}`,
    meetLink ? `<br><strong>Google Meet:</strong> <a href="${meetLink}">${meetLink}</a>` : "",
  ].join("");

  sendEmail(env.COACH_EMAIL, `Weekly Call Booked — ${fullName}`, adminBody).catch((err) =>
    logger.error({ err, bookingId: booking.id }, "Failed to send weekly-call admin notification")
  );

  if (env.COACH_PHONE) {
    const smsBody = `Vintus: ${fullName} booked their weekly call for ${scheduledDate} at ${scheduledTime}.${meetLink ? ` ${meetLink}` : ""}`;
    sendSMS(env.COACH_PHONE, smsBody).catch((err) =>
      logger.error({ err, bookingId: booking.id }, "Failed to send weekly-call admin SMS")
    );
  }

  logger.info({ userId, bookingId: booking.id, scheduledDate, scheduledTime }, "Weekly coaching call booked");

  return { ...booking, meetLink: meetLink ?? booking.meetLink };
}

export async function cancelWeeklyCoachingCall(userId: string, bookingId: string): Promise<void> {
  const booking = await prisma.sessionBooking.findFirst({
    where: { id: bookingId, userId, sessionType: "PC_WEEKLY_CALL" },
  });
  if (!booking) {
    const err = new Error("Call not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (booking.status === "CANCELED") return;

  await prisma.sessionBooking.update({ where: { id: bookingId }, data: { status: "CANCELED" } });
  logger.info({ userId, bookingId }, "Weekly coaching call canceled by client");
}
