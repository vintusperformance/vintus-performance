import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { sendEmail } from "../lib/resend.js";
import { env } from "../config/env.js";
import type { ContactInput, ConsultationInput } from "../routes/schemas/leads.schemas.js";
import { getClassScheduleBlockedTimes, isClassScheduleBlocked } from "../data/booking-rules.js";
import { appendSheetRow } from "../lib/google-sheets.js";

/** Save a contact form submission and email admin */
export async function createContactLead(data: ContactInput) {
  const lead = await prisma.lead.create({
    data: {
      type: "CONTACT",
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email,
      phone: data.phone ?? null,
      interest: data.interest ?? null,
      goals: data.goals ?? null,
      referral: data.referral ?? null,
    },
  });

  logger.info({ leadId: lead.id, email: data.email }, "Contact lead created");

  appendSheetRow("Sheet1", [
    lead.createdAt.toISOString(),
    data.firstName,
    data.lastName ?? "",
    data.email,
    data.phone ?? "",
    "", // Primary Goal — n/a for a contact form
    "", // Training Days — n/a
    "", // Experience — n/a
    "", // Challenge — n/a
    "Contact Form", // Source
    data.interest ?? "", // Intent
    lead.status, // Booking Status
    "", // Booked Time — n/a
    [data.goals, data.referral ? `Referral: ${data.referral}` : ""].filter(Boolean).join(" | "),
  ]);

  // Email admin notification (fire and forget)
  const adminBody = [
    `New contact form submission from <strong>${data.firstName}${data.lastName ? " " + data.lastName : ""}</strong>.`,
    `<br><br><strong>Email:</strong> ${data.email}`,
    data.phone ? `<br><strong>Phone:</strong> ${data.phone}` : "",
    data.interest ? `<br><strong>Interest:</strong> ${data.interest}` : "",
    data.goals ? `<br><strong>Goals:</strong> ${data.goals}` : "",
    data.referral ? `<br><strong>Referral:</strong> ${data.referral}` : "",
  ].join("");

  sendEmail(
    env.COACH_EMAIL,
    `New Contact Form — ${data.firstName}`,
    adminBody
  ).catch((err) => logger.error({ err }, "Failed to send contact admin email"));

  return lead;
}

/** Save a consultation booking request, email admin + client confirmation */
export async function createConsultationLead(data: ConsultationInput) {
  if (isClassScheduleBlocked(data.preferredDate, data.preferredTime)) {
    const err = new Error("That time isn't available — please pick another.") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  // The free consultation is one-time-only per person — after that, it's a
  // paid $85 session. Match case-insensitively so "Name@x.com" and
  // "name@x.com" can't both claim the free slot.
  const priorConsult = await prisma.lead.findFirst({
    where: {
      type: "CONSULTATION",
      email: { equals: data.email, mode: "insensitive" },
    },
  });
  if (priorConsult) {
    const err = new Error(
      "You've already used your one-time free consultation. Book a paid session instead."
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 409;
    err.code = "FREE_CONSULT_USED";
    throw err;
  }

  const lead = await prisma.lead.create({
    data: {
      type: "CONSULTATION",
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email,
      phone: data.phone ?? null,
      preferredDate: data.preferredDate,
      preferredTime: data.preferredTime,
      tier: data.tier ?? null,
      primaryGoal: data.primaryGoal ?? null,
      experience: data.experience ?? null,
      notes: data.notes ?? null,
    },
  });

  logger.info({ leadId: lead.id, email: data.email }, "Consultation lead created");

  appendSheetRow("Sheet1", [
    lead.createdAt.toISOString(),
    data.firstName,
    data.lastName ?? "",
    data.email,
    data.phone ?? "",
    data.primaryGoal ?? "", // Primary Goal
    "", // Training Days — n/a for a consultation booking
    data.experience ?? "", // Experience
    "", // Challenge — n/a
    "Free Consultation", // Source
    data.tier ?? "", // Intent
    lead.status, // Booking Status
    `${data.preferredDate} ${data.preferredTime}`, // Booked Time
    data.notes ?? "",
  ]);

  // Admin notification
  const adminBody = [
    `New consultation request from <strong>${data.firstName}${data.lastName ? " " + data.lastName : ""}</strong>.`,
    `<br><br><strong>Email:</strong> ${data.email}`,
    data.phone ? `<br><strong>Phone:</strong> ${data.phone}` : "",
    `<br><strong>Preferred Date:</strong> ${data.preferredDate}`,
    `<br><strong>Preferred Time:</strong> ${data.preferredTime}`,
    data.tier ? `<br><strong>Plan Interest:</strong> ${data.tier}` : "",
    data.primaryGoal ? `<br><strong>Goal:</strong> ${data.primaryGoal}` : "",
    data.experience ? `<br><strong>Experience:</strong> ${data.experience}` : "",
    data.notes ? `<br><strong>Notes:</strong> ${data.notes}` : "",
  ].join("");

  sendEmail(
    env.COACH_EMAIL,
    `New Consultation Request — ${data.firstName}`,
    adminBody
  ).catch((err) => logger.error({ err }, "Failed to send consultation admin email"));

  // Client confirmation
  const clientBody = [
    `Hi ${data.firstName},`,
    `<br><br>We've received your consultation request for <strong>${data.preferredDate}</strong> at <strong>${data.preferredTime}</strong>.`,
    `<br><br>Our team will confirm your appointment within 24 hours. If you need to make changes, reply to this email or contact us directly.`,
    `<br><br>Looking forward to helping you reach your goals!`,
  ].join("");

  sendEmail(
    data.email,
    "Your Vintus Performance Consultation Request",
    clientBody
  ).catch((err) => logger.error({ err }, "Failed to send client confirmation email"));

  return lead;
}

/** Return available consultation slots for a given month */
export async function getAvailableSlots(month: number, year: number) {
  // Get confirmed consultation leads for this period to exclude those slots
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  // Both free consultations and paid sessions land on the same calendar —
  // check both so the two booking flows can't double-book the same time.
  const [confirmedLeads, sessionBookings] = await Promise.all([
    prisma.lead.findMany({
      where: {
        type: "CONSULTATION",
        status: { in: ["NEW", "CONFIRMED"] },
        preferredDate: { gte: startDate, lt: endDate },
      },
      select: { preferredDate: true, preferredTime: true },
    }),
    prisma.sessionBooking.findMany({
      where: {
        scheduledDate: { gte: startDate, lt: endDate },
        OR: [
          { status: "PAID" },
          // An abandoned checkout shouldn't permanently hold a slot hostage —
          // only treat a still-pending booking as blocking for a short window.
          { status: "PENDING_PAYMENT", createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        ],
      },
      select: { scheduledDate: true, scheduledTime: true },
    }),
  ]);

  // Build set of booked slots
  const bookedSlots: Record<string, string[]> = {};
  for (const lead of confirmedLeads) {
    if (lead.preferredDate && lead.preferredTime) {
      if (!bookedSlots[lead.preferredDate]) {
        bookedSlots[lead.preferredDate] = [];
      }
      bookedSlots[lead.preferredDate].push(lead.preferredTime);
    }
  }
  for (const booking of sessionBookings) {
    if (!bookedSlots[booking.scheduledDate]) {
      bookedSlots[booking.scheduledDate] = [];
    }
    bookedSlots[booking.scheduledDate].push(booking.scheduledTime);
  }

  // Class-schedule blackout (Tue/Thu mornings, through the semester) —
  // treated as "booked" so the existing calendar UI greys them out
  // with no frontend changes needed.
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor < end) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const blocked = getClassScheduleBlockedTimes(dateStr);
    if (blocked.length > 0) {
      bookedSlots[dateStr] = [...(bookedSlots[dateStr] ?? []), ...blocked];
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { bookedSlots };
}
