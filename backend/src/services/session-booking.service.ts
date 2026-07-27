import type Stripe from "stripe";
import type { PaidSessionType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { stripe } from "../config/stripe.js";
import { logger } from "../lib/logger.js";
import { sendEmail } from "../lib/resend.js";
import { env } from "../config/env.js";
import { PAID_SESSION_CATALOG, computeSessionTotalCents, isValidHeadcount } from "../data/paid-sessions.js";
import type { CreateSessionBookingInput } from "../routes/schemas/session-booking.schemas.js";

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

  // Client confirmation — meeting details + how to reach Anthony directly.
  const contactLines = [`<br><strong>Email:</strong> ${env.RESEND_FROM_EMAIL}`];
  if (env.COACH_PHONE) contactLines.push(`<br><strong>Phone:</strong> ${env.COACH_PHONE}`);

  const clientBody = [
    `Hi ${booking.firstName},`,
    `<br><br>You're confirmed for your <strong>${config.label}</strong> on <strong>${booking.scheduledDate}</strong> at <strong>${booking.scheduledTime}</strong> (America/New_York).`,
    `<br><br><strong>How we'll connect:</strong> ${booking.meetingPreference}`,
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
    booking.coachingContext ? `<br><br><strong>What they want help with:</strong><br>${booking.coachingContext}` : "",
    `<br><br><strong>Charged:</strong> $${(booking.totalAmountCents / 100).toFixed(2)}`,
  ].join("");

  sendEmail(env.COACH_EMAIL, `Paid Session Booked — ${booking.firstName}`, adminBody).catch((err) =>
    logger.error({ err, bookingId }, "Failed to send paid-session admin notification")
  );

  logger.info({ bookingId, sessionType: booking.sessionType }, "Paid session marked PAID, emails queued");
}
