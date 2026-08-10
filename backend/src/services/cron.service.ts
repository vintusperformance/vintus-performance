import type { MessageChannel, MessageCategory } from "@prisma/client";
import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { sendEmail } from "../lib/resend.js";
import * as messagingService from "./messaging.service.js";
import { checkWelcomeSequence } from "./messaging.service.js";
import * as adherenceService from "./adherence.service.js";
import * as workoutService from "./workout.service.js";
import * as readinessService from "./readiness.service.js";
import * as adminService from "./admin.service.js";
import { sendSMS } from "../lib/twilio.js";
import { PAID_SESSION_CATALOG } from "../data/paid-sessions.js";
import { getActiveNutritionPlan } from "./nutrition.service.js";

import { isAutoMessagingEnabled, isCronEnabled, isPcDailyPushEnabled } from "../lib/feature-flags.js";

// ============================================================
// Auto-messaging toggle — when false, messages are queued as
// pending triggers instead of sent automatically.
// Admin can toggle this live from the admin dashboard.
// ============================================================

// Exclude pending triggers from dedup queries — pending triggers have sentAt set
// by Prisma's @default(now()) but haven't actually been sent yet.
// Must explicitly allow failureReason IS NULL (the normal case for a message
// that sent successfully): `NOT { startsWith }` alone compiles to SQL
// `NOT (failureReason LIKE 'PENDING_TRIGGER:%')`, which evaluates to NULL —
// not TRUE — for a NULL column, so it would silently exclude every
// successfully-sent message from these "already sent today" dedup checks
// and cause duplicate sends on every cron tick.
const NOT_PENDING_TRIGGER = {
  OR: [
    { failureReason: null },
    { NOT: { failureReason: { startsWith: "PENDING_TRIGGER:" } } },
  ],
};

/**
 * Queue a message as a pending trigger instead of sending immediately.
 * Admin can review and fire these from the admin dashboard.
 * If AUTO_MESSAGING_ENABLED is true, sends immediately (production mode).
 */
async function triggerOrQueue(
  userId: string,
  category: string,
  channel: "SMS" | "EMAIL",
  context: Record<string, unknown>,
  description?: string
): Promise<void> {
  if (isAutoMessagingEnabled()) {
    await messagingService.sendMessage(userId, category, channel, context);
    return;
  }

  // Queue as pending trigger — store in MessageLog with a special "PENDING" state
  // (sentAt = null, failedAt = null signals pending)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { athleteProfile: { select: { firstName: true, phone: true } } },
  });

  // Resolve template content for preview
  const templates = (await import("../data/message-templates.js")).messageTemplates;
  const pool = templates[category] || [];
  const template = pool[Math.floor(Math.random() * pool.length)];
  let content = template ? template.content : `[${category}] message for ${user?.athleteProfile?.firstName || userId}`;

  // Interpolate context into template
  if (template && context) {
    for (const [key, val] of Object.entries(context)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val ?? ""));
    }
  }

  await prisma.messageLog.create({
    data: {
      userId,
      channel,
      category: category as MessageCategory,
      content,
      templateId: template?.id ?? null,
      // sentAt defaults to now() in schema — we'll use a flag field instead
      // Store "PENDING_TRIGGER" in the notes-like field to mark as unsent
      failureReason: "PENDING_TRIGGER:" + (description || category),
    },
  });

  logger.info({ userId, category, description }, "Message queued as pending trigger (auto-messaging disabled)");
}

/**
 * Cron Service — daily data review loop for all active clients.
 * Runs hourly, checks which clients need their daily review based on timezone.
 * All operations are IDEMPOTENT: safe to re-run without double-sends or double-adjustments.
 */

// ============================================================
// In-memory dedup: prevent double-processing within server instance
// Cleared daily at 4am UTC
// ============================================================

const processedReviews = new Map<string, boolean>();

// ============================================================
// Timezone helper
// ============================================================

interface LocalTime {
  hour: number;
  minute: number;
  dayOfWeek: number;
  dateStr: string;
}

function getLocalTime(utcDate: Date, timezone: string): LocalTime {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      hour: "numeric",
      minute: "numeric",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });

    const parts = formatter.formatToParts(utcDate);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const year = parts.find((p) => p.type === "year")?.value ?? "2026";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";

    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };

    return {
      hour,
      minute,
      dayOfWeek: dayMap[weekday] ?? 1,
      dateStr: `${year}-${month}-${day}`,
    };
  } catch {
    // Invalid timezone — fall back to UTC
    logger.warn({ timezone }, "Invalid timezone, falling back to UTC");
    return {
      hour: utcDate.getUTCHours(),
      minute: utcDate.getUTCMinutes(),
      dayOfWeek: utcDate.getUTCDay(),
      dateStr: utcDate.toISOString().split("T")[0],
    };
  }
}

// ============================================================
// Helper: get Monday of the week for a given date
// ============================================================

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

// ============================================================
// Helper: convert a "YYYY-MM-DD" + "H:MM" pair — always interpreted as
// America/New_York wall-clock time (how bookings store scheduledDate/Time
// and preferredDate/Time) — into the equivalent UTC instant, DST-aware.
// ============================================================

function nyDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  // Wall-clock numbers taken as if they were already UTC...
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);

  // ...then re-read that instant in America/New_York to find the actual
  // offset in effect on that date (handles EST/EDT correctly).
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(naiveUtc));
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const readAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));

  const offsetMs = readAsUtc - naiveUtc;
  return new Date(naiveUtc - offsetMs);
}

// ============================================================
// startCrons — register all cron jobs on server boot
// ============================================================

export function startCrons(): void {
  logger.info("Registering cron jobs...");

  // Hourly — daily reviews, weekly digest, and welcome sequence checks
  cron.schedule("0 * * * *", async () => {
    if (!isCronEnabled()) {
      return; // Admin has paused cron via dashboard
    }
    logger.info("Hourly cron tick...");
    try {
      await dailyReviewCron();
    } catch (err) {
      logger.error({ err }, "Daily review cron failed");
    }
    try {
      await weeklyDigestCron();
    } catch (err) {
      logger.error({ err }, "Weekly digest cron failed");
    }
    try {
      await welcomeSequenceCron();
    } catch (err) {
      logger.error({ err }, "Welcome sequence cron failed");
    }
    try {
      await coachRenewalReminderCron();
    } catch (err) {
      logger.error({ err }, "Coach renewal reminder cron failed");
    }
  });

  // Daily admin digest — 11:00 UTC (~7am America/New_York)
  cron.schedule("0 11 * * *", async () => {
    if (!isCronEnabled()) {
      return; // Admin has paused cron via dashboard
    }
    try {
      await adminDailyDigestCron();
    } catch (err) {
      logger.error({ err }, "Admin daily digest cron failed");
    }
  });

  // Clear stale dedup entries daily at 4am UTC
  cron.schedule("0 4 * * *", () => {
    processedReviews.clear();
    logger.info("Cleared processed reviews cache");
  });

  // Every 5 minutes — text the coach 1 hour ahead of any booked session or
  // free consultation, with the meeting link attached
  cron.schedule("*/5 * * * *", async () => {
    if (!isCronEnabled()) {
      return; // Admin has paused cron via dashboard
    }
    try {
      await bookingReminderCron();
    } catch (err) {
      logger.error({ err }, "Booking reminder cron failed");
    }
  });

  logger.info("Cron jobs registered successfully");
}

// ============================================================
// dailyReviewCron — timezone-aware client iteration
// ============================================================

async function dailyReviewCron(): Promise<void> {
  const activeClients = await prisma.subscription.findMany({
    where: { status: "ACTIVE" },
    select: {
      userId: true,
      user: {
        select: {
          athleteProfile: {
            select: { timezone: true },
          },
        },
      },
    },
  });

  const now = new Date();
  let processed = 0;
  let skipped = 0;

  for (const client of activeClients) {
    const timezone = client.user.athleteProfile?.timezone ?? "America/New_York";
    const local = getLocalTime(now, timezone);

    // Midnight window: local hour is 0
    // Morning window: local hour is 6 (or hour 5 + minute >= 30 for half-hour-offset timezones)
    // Check-in window: local hour is 19 (7pm) — PC afternoon/evening check-in prompt
    // Evening window: local hour is 20 (8pm) — for "workout not logged" follow-ups
    const isMidnight = local.hour === 0;
    const isMorning = local.hour === 6 || (local.hour === 5 && local.minute >= 30);
    const isCheckinWindow = local.hour === 19;
    const isEvening = local.hour === 20;

    if (!isMidnight && !isMorning && !isCheckinWindow && !isEvening) continue;

    const reviewType = isEvening ? "evening" : isCheckinWindow ? "checkin" : isMidnight ? "midnight" : "morning";
    const dedupKey = `${client.userId}:${local.dateStr}:${reviewType}`;

    if (processedReviews.has(dedupKey)) {
      skipped++;
      continue;
    }

    const start = Date.now();
    try {
      await dailyReviewForClient(client.userId, isMorning, isEvening, isCheckinWindow);
      processedReviews.set(dedupKey, true);
      processed++;
      logger.info(
        { userId: client.userId, reviewType, durationMs: Date.now() - start },
        "Daily review completed for client"
      );
    } catch (err) {
      logger.error(
        { err, userId: client.userId, reviewType },
        "Daily review failed for client — continuing to next"
      );
    }
  }

  if (processed > 0 || skipped > 0) {
    logger.info(
      { processed, skipped, totalClients: activeClients.length },
      "Daily review cron completed"
    );
  }
}

// ============================================================
// dailyReviewForClient — THE CORE LOOP (6 steps, idempotent)
// ============================================================

export async function dailyReviewForClient(
  userId: string,
  isMorningReview: boolean = false,
  isEveningReview: boolean = false,
  isCheckinReview: boolean = false
): Promise<void> {
  const startTime = Date.now();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      athleteProfile: true,
      subscription: { select: { planTier: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, renewalPromptedAt: true, renewalResponseAt: true, scheduledDeleteAt: true } },
    },
  });

  if (!user?.athleteProfile) {
    logger.warn({ userId }, "Daily review skipped: no athlete profile");
    return;
  }

  const profile = user.athleteProfile;

  // Client's local time for timezone-aware checks
  const localTime = getLocalTime(new Date(), profile.timezone);

  // UTC dates for today and yesterday
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Get active plan with sessions
  const activePlan = await prisma.workoutPlan.findFirst({
    where: { athleteProfileId: profile.id, isActive: true },
    orderBy: { weekNumber: "desc" },
    include: { sessions: { orderBy: { scheduledDate: "asc" } } },
  });

  // ── Step 1: CHECK YESTERDAY'S WORKOUT STATUS ─────────────

  const yesterdaySessions = activePlan?.sessions.filter((s) => {
    const sDate = new Date(s.scheduledDate);
    sDate.setUTCHours(0, 0, 0, 0);
    return sDate.getTime() === yesterday.getTime();
  }) ?? [];

  // Sessions still SCHEDULED from yesterday → should be marked MISSED
  const missedSessions = yesterdaySessions.filter((s) => s.status === "SCHEDULED");
  const completedSessions = yesterdaySessions.filter((s) => s.status === "COMPLETED");

  for (const session of missedSessions) {
    try {
      const isStrength = session.sessionType.startsWith("STRENGTH");
      const isEndurance = session.sessionType.startsWith("ENDURANCE");

      if (isStrength && activePlan) {
        // Marks session MISSED + reschedules + creates AdjustmentLog
        await workoutService.adjustForMissedStrengthDay(activePlan.id, session.id);
      } else if (isEndurance && activePlan) {
        // Marks session MISSED + adjusts + creates AdjustmentLog
        await workoutService.adjustForMissedEnduranceDay(activePlan.id, session.id);
      } else {
        // HIIT, MOBILITY, etc. — just mark as missed
        await prisma.workoutSession.update({
          where: { id: session.id },
          data: { status: "MISSED" },
        });
      }
    } catch (err) {
      // Ensure session is at minimum marked MISSED even if adjustment fails
      await prisma.workoutSession
        .update({ where: { id: session.id }, data: { status: "MISSED" } })
        .catch(() => {});
      logger.error({ err, userId, sessionId: session.id }, "Workout adjustment failed");
    }

    // Update adherence for yesterday's week
    await adherenceService.updateAdherence(userId, yesterday);
  }

  // Send WORKOUT_MISSED message if sessions were missed (dedup: once per day)
  if (missedSessions.length > 0) {
    const existingMissedMsg = await prisma.messageLog.findFirst({
      where: { userId, category: "WORKOUT_MISSED", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
    });
    if (!existingMissedMsg) {
      try {
        await triggerOrQueue(userId, "WORKOUT_MISSED", "SMS", {
          firstName: profile.firstName,
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to send WORKOUT_MISSED message");
      }
    }
  }

  // Send WORKOUT_COMPLETED message if sessions were completed yesterday (dedup)
  if (completedSessions.length > 0) {
    const existingCompletedMsg = await prisma.messageLog.findFirst({
      where: { userId, category: "WORKOUT_COMPLETED", sentAt: { gte: yesterday }, ...NOT_PENDING_TRIGGER },
    });
    if (!existingCompletedMsg) {
      try {
        await triggerOrQueue(userId, "WORKOUT_COMPLETED", "SMS", {
          firstName: profile.firstName,
          workoutTitle: completedSessions[0].title,
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to send WORKOUT_COMPLETED message");
      }
    }

    // Update adherence for completed sessions
    await adherenceService.updateAdherence(userId, yesterday);
  }

  // ── Step 2: CHECK READINESS DATA ───────────────────────────

  const todayReadiness = await prisma.readinessMetric.findFirst({
    where: {
      athleteProfileId: profile.id,
      date: today,
      source: "MANUAL",
    },
  });

  if (todayReadiness && activePlan) {
    // Evaluate flags (matches readiness.service.ts logic)
    const highFatigue =
      (todayReadiness.perceivedEnergy ?? 5) < 4 &&
      (todayReadiness.perceivedSoreness ?? 5) > 7;
    const lowSleep = (todayReadiness.sleepQualityManual ?? 5) < 4;
    const lowHrv = todayReadiness.hrvMs != null && todayReadiness.hrvMs < 30;

    // Check if adjustments already made today (idempotent)
    const todayAdjustments = await prisma.adjustmentLog.findMany({
      where: {
        workoutPlanId: activePlan.id,
        createdAt: { gte: today },
      },
      select: { triggerEvent: true },
    });
    const triggeredToday = new Set(todayAdjustments.map((a) => a.triggerEvent));

    if (highFatigue && !triggeredToday.has("high_fatigue")) {
      try {
        await workoutService.adjustForHighFatigue(activePlan.id, {
          perceivedEnergy: todayReadiness.perceivedEnergy,
          perceivedSoreness: todayReadiness.perceivedSoreness,
          fatigueScore: todayReadiness.fatigueScore,
        });
      } catch (err) {
        logger.error({ err, userId }, "adjustForHighFatigue failed");
      }
    }

    if (lowSleep && !triggeredToday.has("low_sleep")) {
      try {
        await workoutService.adjustForLowSleep(activePlan.id, {
          sleepQualityManual: todayReadiness.sleepQualityManual,
          sleepDurationMin: todayReadiness.sleepDurationMin,
          sleepScore: todayReadiness.sleepScore,
        });
      } catch (err) {
        logger.error({ err, userId }, "adjustForLowSleep failed");
      }
    }

    // Send RECOVERY_TIP if any recovery flag is active (dedup)
    if (highFatigue || lowSleep || lowHrv) {
      const existingRecoveryMsg = await prisma.messageLog.findFirst({
        where: { userId, category: "RECOVERY_TIP", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
      });
      if (!existingRecoveryMsg) {
        try {
          await triggerOrQueue(userId, "RECOVERY_TIP", "SMS", {
            firstName: profile.firstName,
          });
        } catch (err) {
          logger.error({ err, userId }, "Failed to send RECOVERY_TIP message");
        }
      }
    }
    // Catch-up: if check-in exists today but no CHECKIN_RESPONSE was sent
    // (e.g., server restarted during the 3-minute setTimeout window)
    const existingCheckinResponse = await prisma.messageLog.findFirst({
      where: { userId, category: "CHECKIN_RESPONSE" as MessageCategory, sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
    });
    if (!existingCheckinResponse) {
      try {
        // Recompute tone (matches scheduleCheckinResponse formula)
        const energy = todayReadiness.perceivedEnergy ?? 5;
        const soreness = todayReadiness.perceivedSoreness ?? 5;
        const mood = todayReadiness.perceivedMood ?? 5;
        const sleep = todayReadiness.sleepQualityManual ?? 5;
        const composite = (energy + mood + sleep + (11 - soreness)) / 4;

        let readinessTone: "supportive" | "energized" | "balanced";
        if (composite < 4.5) readinessTone = "supportive";
        else if (composite > 7) readinessTone = "energized";
        else readinessTone = "balanced";

        // Evaluate flags (matches readiness.service logic)
        const cronFlags: string[] = [];
        if (energy < 4 && soreness > 7) cronFlags.push("high_fatigue");
        if (sleep < 4) cronFlags.push("low_sleep");

        await triggerOrQueue(userId, "CHECKIN_RESPONSE", "SMS", {
          firstName: profile.firstName,
          perceivedEnergy: todayReadiness.perceivedEnergy ?? undefined,
          perceivedSoreness: todayReadiness.perceivedSoreness ?? undefined,
          perceivedMood: todayReadiness.perceivedMood ?? undefined,
          sleepQualityManual: todayReadiness.sleepQualityManual ?? undefined,
          readinessTone,
          readinessFlags: cronFlags,
        });
        logger.info({ userId }, "Cron catch-up: sent missed CHECKIN_RESPONSE");
      } catch (err) {
        logger.error({ err, userId }, "Cron catch-up: failed to send CHECKIN_RESPONSE");
      }
    }
  } else if (!todayReadiness && isMorningReview) {
    // No check-in yet and it's the morning review → prompt check-in (dedup)
    const existingCheckInMsg = await prisma.messageLog.findFirst({
      where: { userId, category: "CHECK_IN", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
    });
    if (!existingCheckInMsg) {
      try {
        await triggerOrQueue(userId, "CHECK_IN", "SMS", {
          firstName: profile.firstName,
          checkInLink: `${env.FRONTEND_URL}/dashboard.html`,
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to send CHECK_IN message");
      }
    }
  }

  // ── Step 3: CHECK ADHERENCE ESCALATION ──────────────────────

  const consecutiveMissed = await adherenceService.getConsecutiveMissed(userId);
  const weekAdherence = await adherenceService.getCurrentWeekAdherence(userId);

  // Escalation triggers: 3+ consecutive missed OR weekly adherence < 50%
  if (consecutiveMissed >= 3 || weekAdherence.adherenceRate < 0.5) {
    // Check if escalation already created today (idempotent)
    const todayEscalation = await prisma.escalationEvent.findFirst({
      where: { userId, createdAt: { gte: today } },
    });

    if (!todayEscalation) {
      // Determine level from recent escalation history (last 30 days)
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentEscalations = await prisma.escalationEvent.findMany({
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: "desc" },
      });

      const unresolvedCount = recentEscalations.filter((e) => !e.resolvedAt).length;

      let level: number;
      if (unresolvedCount >= 2) {
        level = 3; // "Let's talk" with calendar link
      } else if (unresolvedCount === 1) {
        level = 2; // Direct concern
      } else {
        level = 1; // Gentle nudge
      }

      const triggerReason = consecutiveMissed >= 3
        ? "3_missed_workouts"
        : "low_weekly_adherence";

      const escalation = await prisma.escalationEvent.create({
        data: {
          userId,
          triggerReason,
          escalationLevel: level,
        },
      });

      // Send ESCALATION message — email for level 3, SMS for levels 1-2
      try {
        const channel: "SMS" | "EMAIL" = level >= 3 ? "EMAIL" : "SMS";
        await triggerOrQueue(userId, "ESCALATION", channel, {
          firstName: profile.firstName,
          bookingLink: `${env.FRONTEND_URL}/book-consultation`,
        });

        await prisma.escalationEvent.update({
          where: { id: escalation.id },
          data: { messageSent: true },
        });
      } catch (err) {
        logger.error({ err, userId, level }, "Failed to send ESCALATION message");
      }
    }
  } else if (consecutiveMissed === 2) {
    // 2 consecutive missed → send concern-level WORKOUT_MISSED (dedup)
    const existingConcernMsg = await prisma.messageLog.findFirst({
      where: { userId, category: "WORKOUT_MISSED", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
    });
    if (!existingConcernMsg) {
      try {
        await triggerOrQueue(userId, "WORKOUT_MISSED", "SMS", {
          firstName: profile.firstName,
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to send concern WORKOUT_MISSED message");
      }
    }
  }

  // ── Step 4: WEEKLY PLAN GENERATION (Sunday midnight) ────────

  const isEndOfPlan = activePlan
    ? (() => {
        const endDate = new Date(activePlan.endDate);
        endDate.setUTCHours(0, 0, 0, 0);
        return endDate.getTime() <= today.getTime();
      })()
    : false;

  // Use local day of week for timezone-correct Sunday check
  if (localTime.dayOfWeek === 0 || isEndOfPlan) {
    // Check if next week's plan already exists (idempotent)
    const nextMonday = getWeekStart(new Date());
    nextMonday.setDate(nextMonday.getDate() + 7);

    const existingNextPlan = await prisma.workoutPlan.findFirst({
      where: {
        athleteProfileId: profile.id,
        startDate: { gte: nextMonday },
      },
    });

    if (!existingNextPlan) {
      try {
        await workoutService.generateNextWeek(profile.id);

        // Send plan-ready message (dedup)
        const existingPlanMsg = await prisma.messageLog.findFirst({
          where: { userId, category: "SYSTEM", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
        });
        if (!existingPlanMsg) {
          await triggerOrQueue(userId, "SYSTEM", "SMS", {
            firstName: profile.firstName,
          });
        }
      } catch (err) {
        logger.error({ err, userId }, "Failed to generate next week plan");
      }
    }
  }

  // ── Step 5: DAILY MOTIVATION ────────────────────────────────

  const planTier = user.subscription?.planTier;
  // Private Coaching clients get their own daily encouragement via
  // PC_DAILY_PUSH (Step 7 below) when that's enabled — skip this generic
  // one for them so they don't get two "good morning" texts.
  const skipMotivationForPc = planTier === "PRIVATE_COACHING" && isPcDailyPushEnabled();
  if (planTier && !skipMotivationForPc) {
    // 70% chance (prevents message fatigue)
    if (Math.random() < 0.7) {
      // Skip if too many messages already sent today
      const todayMessageCount = await prisma.messageLog.count({
        where: { userId, sentAt: { gte: today } },
      });

      if (todayMessageCount <= 1) {
        const existingMotivation = await prisma.messageLog.findFirst({
          where: { userId, category: "MOTIVATION", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
        });
        if (!existingMotivation) {
          try {
            await triggerOrQueue(userId, "MOTIVATION", "SMS", {
              firstName: profile.firstName,
              adherenceRate: weekAdherence.adherenceRate,
            });
          } catch (err) {
            logger.error({ err, userId }, "Failed to send MOTIVATION message");
          }
        }
      }
    }
  }

  // ── Step 7: DAILY WORKOUT ALERT (every morning) ─────────────

  const sub = user.subscription;
  if (sub && sub.currentPeriodStart && sub.currentPeriodEnd && isMorningReview) {
    const dayNumber = Math.max(1, Math.ceil((today.getTime() - new Date(sub.currentPeriodStart).getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const totalDays = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime()) / (24 * 60 * 60 * 1000));

    const isPrivateCoachingPush = sub.planTier === "PRIVATE_COACHING" && isPcDailyPushEnabled();

    // Check if we already sent a daily alert today (covers whichever
    // category this tier/branch actually sends)
    const existingDailyAlert = await prisma.messageLog.findFirst({
      where: {
        userId,
        category: { in: isPrivateCoachingPush ? ["PC_DAILY_PUSH"] : ["DAILY_WORKOUT_ALERT", "PLAN_MILESTONE"] },
        sentAt: { gte: today },
        ...NOT_PENDING_TRIGGER,
      },
    });

    if (!existingDailyAlert && dayNumber <= totalDays) {
      const TIER_DISPLAY: Record<string, string> = {
        PRIVATE_COACHING: "Private Coaching",
        TRAINING_30DAY: "30-Day Training",
        TRAINING_60DAY: "60-Day Training",
        TRAINING_90DAY: "90-Day Training",
        NUTRITION_4WEEK: "4-Week Nutrition",
        NUTRITION_8WEEK: "8-Week Nutrition",
      };
      const planTierDisplay = TIER_DISPLAY[sub.planTier] || sub.planTier;

      const todaySessions = activePlan?.sessions.filter((s) => {
        const sd = new Date(s.scheduledDate);
        sd.setUTCHours(0, 0, 0, 0);
        return sd.getTime() === today.getTime();
      }) ?? [];

      const isTrainingDay = todaySessions.length > 0;
      const sessionTitle = isTrainingDay ? todaySessions[0].title : undefined;
      const duration = isTrainingDay ? todaySessions[0].prescribedDuration : undefined;

      if (isPrivateCoachingPush) {
        // Private Coaching: one automatic morning SMS, every day (no
        // milestone branching, no manual-approval queue — Anthony asked
        // for this to be fully automated, scoped to this tier only).
        // Combines encouragement with today's training task and, when the
        // client has an active nutrition plan, today's nutrition guidance.
        // Plain hyphens, not em dashes — an em dash pushes the whole SMS out
        // of the GSM-7 character set into UCS-2, cutting the per-segment
        // limit from 160 to 70 chars and often adding a billable segment.
        let tasksLine = isTrainingDay
          ? `Today: ${sessionTitle} - ${duration || 0} min.`
          : "Today is a rest day - recovery is part of the plan.";

        const nutritionPlan = await getActiveNutritionPlan(userId);
        if (nutritionPlan) {
          tasksLine += ` Nutrition target: ${nutritionPlan.dailyCalories} cal, ${nutritionPlan.proteinG}g protein.`;
        }

        try {
          await messagingService.sendMessage(userId, "PC_DAILY_PUSH", "SMS", {
            firstName: profile.firstName,
            tasksLine,
            dashboardLink: `${env.FRONTEND_URL}/dashboard.html`,
          });
        } catch (err) {
          logger.error({ err, userId }, "Failed to send PC_DAILY_PUSH message");
        }
      } else {
        // Check for milestone day (overrides normal daily) — unchanged
        // behavior for all other tiers, still gated by triggerOrQueue's
        // manual-approval flag.
        const quarter = Math.round(totalDays * 0.25);
        const half = Math.round(totalDays * 0.5);
        const threeQuarter = Math.round(totalDays * 0.75);
        const isMilestone = dayNumber === 1 || dayNumber === quarter || dayNumber === half || dayNumber === threeQuarter || dayNumber === totalDays - 1 || dayNumber === totalDays;

        if (isMilestone) {
          try {
            await triggerOrQueue(userId, "PLAN_MILESTONE", "SMS", {
              firstName: profile.firstName,
              dayNumber,
              totalDays,
              planTierDisplay,
            });
          } catch (err) {
            logger.error({ err, userId }, "Failed to send PLAN_MILESTONE message");
          }
        } else {
          try {
            await triggerOrQueue(userId, "DAILY_WORKOUT_ALERT", "SMS", {
              firstName: profile.firstName,
              dayNumber,
              totalDays,
              sessionTitle: sessionTitle || "Rest",
              duration: duration || 0,
              planTierDisplay,
            });
          } catch (err) {
            logger.error({ err, userId }, "Failed to send DAILY_WORKOUT_ALERT message");
          }
        }
      }
    }
  }

  // ── Step 7b: WORKOUT NOT LOGGED follow-up (evening ~8pm) ───

  if (sub && isEveningReview) {
    const todaySessions = activePlan?.sessions.filter((s) => {
      const sd = new Date(s.scheduledDate);
      sd.setUTCHours(0, 0, 0, 0);
      return sd.getTime() === today.getTime() && s.status === "SCHEDULED";
    }) ?? [];

    if (todaySessions.length > 0) {
      const existingNotLogged = await prisma.messageLog.findFirst({
        where: { userId, category: "WORKOUT_NOT_LOGGED", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
      });

      if (!existingNotLogged) {
        const dayNumber = Math.max(1, Math.ceil((today.getTime() - new Date(sub.currentPeriodStart).getTime()) / (24 * 60 * 60 * 1000)) + 1);
        try {
          await triggerOrQueue(userId, "WORKOUT_NOT_LOGGED", "SMS", {
            firstName: profile.firstName,
            dayNumber,
          });
        } catch (err) {
          logger.error({ err, userId }, "Failed to send WORKOUT_NOT_LOGGED message");
        }
      }
    }
  }

  // ── Step 7c: PC CHECK-IN PROMPT (~7pm) ───────────────────────
  // Private Coaching only, always-auto-send like PC_DAILY_PUSH — asks how
  // the day went and links straight to today's check-in. Not conditional
  // on whether they already logged this morning's readiness check-in;
  // this is a separate touchpoint, not a duplicate reminder.

  if (sub && sub.planTier === "PRIVATE_COACHING" && isPcDailyPushEnabled() && isCheckinReview) {
    const existingAfternoonCheckin = await prisma.messageLog.findFirst({
      where: { userId, category: "PC_AFTERNOON_CHECKIN", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
    });

    if (!existingAfternoonCheckin) {
      try {
        await messagingService.sendMessage(userId, "PC_AFTERNOON_CHECKIN", "SMS", {
          firstName: profile.firstName,
          checkInLink: `${env.FRONTEND_URL}/dashboard.html`,
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to send PC_AFTERNOON_CHECKIN message");
      }
    }
  }

  // ── Step 8: PLAN ENDING WARNING ────────────────────────────

  if (sub && sub.currentPeriodEnd) {
    const daysUntilEnd = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntilEnd === 3 || daysUntilEnd === 1) {
      const TIER_DISPLAY: Record<string, string> = {
        PRIVATE_COACHING: "Private Coaching",
        TRAINING_30DAY: "30-Day Training",
        TRAINING_60DAY: "60-Day Training",
        TRAINING_90DAY: "90-Day Training",
        NUTRITION_4WEEK: "4-Week Nutrition",
        NUTRITION_8WEEK: "8-Week Nutrition",
      };
      const existingEnding = await prisma.messageLog.findFirst({
        where: { userId, category: "PLAN_ENDING", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
      });
      if (!existingEnding) {
        try {
          await triggerOrQueue(userId, "PLAN_ENDING", "SMS", {
            firstName: profile.firstName,
            planTierDisplay: TIER_DISPLAY[sub.planTier] || sub.planTier,
          });
        } catch (err) {
          logger.error({ err, userId }, "Failed to send PLAN_ENDING message");
        }
      }
    }
  }

  // ── Step 9: PLAN COMPLETED — renewal prompt ────────────────

  if (sub && sub.currentPeriodEnd) {
    const periodEnd = new Date(sub.currentPeriodEnd);
    periodEnd.setUTCHours(0, 0, 0, 0);

    if (today.getTime() >= periodEnd.getTime() && !sub.renewalPromptedAt) {
      const TIER_DISPLAY: Record<string, string> = {
        PRIVATE_COACHING: "Private Coaching",
        TRAINING_30DAY: "30-Day Training",
        TRAINING_60DAY: "60-Day Training",
        TRAINING_90DAY: "90-Day Training",
        NUTRITION_4WEEK: "4-Week Nutrition",
        NUTRITION_8WEEK: "8-Week Nutrition",
      };
      const existingCompleted = await prisma.messageLog.findFirst({
        where: { userId, category: "PLAN_COMPLETED", sentAt: { gte: today }, ...NOT_PENDING_TRIGGER },
      });
      if (!existingCompleted) {
        try {
          await triggerOrQueue(userId, "PLAN_COMPLETED", "SMS", {
            firstName: profile.firstName,
            planTierDisplay: TIER_DISPLAY[sub.planTier] || sub.planTier,
          });
          // Set renewal tracking fields
          await prisma.subscription.update({
            where: { userId },
            data: {
              renewalPromptedAt: new Date(),
              scheduledDeleteAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
            },
          });
          logger.info({ userId }, "Plan completed — renewal prompt sent, 4-day deactivation scheduled");
        } catch (err) {
          logger.error({ err, userId }, "Failed to send PLAN_COMPLETED message");
        }
      }
    }
  }

  // ── Step 10: AUTO-DEACTIVATION (4 days after plan end, no response) ──
  // Only runs when AUTO_MESSAGING_ENABLED — otherwise admin handles deactivation manually

  if (isAutoMessagingEnabled() && sub && sub.scheduledDeleteAt && !sub.renewalResponseAt) {
    const deleteAt = new Date(sub.scheduledDeleteAt);
    deleteAt.setUTCHours(0, 0, 0, 0);

    if (today.getTime() >= deleteAt.getTime()) {
      await prisma.subscription.update({
        where: { userId },
        data: { status: "CANCELED" },
      });
      await prisma.athleteProfile.update({
        where: { userId },
        data: { messagingDisabled: true },
      });
      logger.info({ userId }, "Auto-deactivated — no renewal response after 4 days");
    }
  }

  // ── Step 11: LOG ─────────────────────────────────────────────

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      userId,
      profileId: profile.id,
      durationMs,
      yesterdayMissed: missedSessions.length,
      yesterdayCompleted: completedSessions.length,
      hasReadiness: !!todayReadiness,
      consecutiveMissed,
      isMorningReview,
    },
    "Daily review completed"
  );
}

// ============================================================
// weeklyDigestCron — timezone-aware Monday 9am
// ============================================================

async function weeklyDigestCron(): Promise<void> {
  const now = new Date();

  const activeClients = await prisma.subscription.findMany({
    where: { status: "ACTIVE" },
    select: {
      userId: true,
      user: {
        select: {
          email: true,
          athleteProfile: {
            select: { id: true, firstName: true, timezone: true },
          },
        },
      },
    },
  });

  let processed = 0;

  for (const client of activeClients) {
    const timezone = client.user.athleteProfile?.timezone ?? "America/New_York";
    const local = getLocalTime(now, timezone);

    // Only send on Monday (dayOfWeek=1) at 9am local
    if (local.dayOfWeek !== 1 || local.hour !== 9) continue;

    // In-memory dedup
    const dedupKey = `digest:${client.userId}:${local.dateStr}`;
    if (processedReviews.has(dedupKey)) continue;

    // DB dedup: check if digest email already sent this week
    const weekStart = getWeekStart(now);
    const existingDigest = await prisma.messageLog.findFirst({
      where: {
        userId: client.userId,
        category: "SYSTEM",
        channel: "EMAIL",
        sentAt: { gte: weekStart },
        ...NOT_PENDING_TRIGGER,
      },
    });
    if (existingDigest) {
      processedReviews.set(dedupKey, true);
      continue;
    }

    try {
      await sendWeeklyDigest(client.userId);
      processedReviews.set(dedupKey, true);
      processed++;
    } catch (err) {
      logger.error({ err, userId: client.userId }, "Weekly digest failed for client");
    }
  }

  if (processed > 0) {
    logger.info({ processed }, "Weekly digest cron completed");
  }
}

// ============================================================
// sendWeeklyDigest — compose and send summary email
// ============================================================

async function sendWeeklyDigest(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      athleteProfile: true,
      subscription: { select: { planTier: true } },
    },
  });

  if (!user?.athleteProfile) return;

  // Respect per-client messaging kill switch
  if (user.athleteProfile.messagingDisabled) {
    logger.info({ userId }, "Weekly digest skipped (messagingDisabled=true)");
    return;
  }

  const profile = user.athleteProfile;

  // Last week's Monday-Sunday
  const lastWeekStart = getWeekStart(new Date());
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);

  // Parallel data fetch
  const [weekSessions, adherenceRecord, trends, activePlan] = await Promise.all([
    prisma.workoutSession.findMany({
      where: {
        workoutPlan: { athleteProfileId: profile.id },
        scheduledDate: { gte: lastWeekStart, lt: lastWeekEnd },
      },
      select: { status: true, sessionType: true, title: true },
    }),
    prisma.adherenceRecord.findFirst({
      where: { userId, weekStartDate: lastWeekStart },
    }),
    readinessService.getTrends(userId),
    prisma.workoutPlan.findFirst({
      where: { athleteProfileId: profile.id, isActive: true },
      orderBy: { weekNumber: "desc" },
      include: {
        sessions: {
          select: { title: true, scheduledDate: true, sessionType: true },
          orderBy: { scheduledDate: "asc" },
        },
      },
    }),
  ]);

  const completedCount = weekSessions.filter((s) => s.status === "COMPLETED").length;
  const scheduledCount = weekSessions.length;
  const adherenceRate = adherenceRecord?.adherenceRate
    ?? (scheduledCount > 0 ? completedCount / scheduledCount : 0);

  // Build personalized note
  let personalNote: string;
  if (adherenceRate >= 0.9) {
    personalNote = `Outstanding week, ${profile.firstName}. ${completedCount}/${scheduledCount} sessions completed. Your consistency is building real results.`;
  } else if (adherenceRate >= 0.7) {
    personalNote = `Solid week, ${profile.firstName}. ${completedCount}/${scheduledCount} sessions logged. Keep building on this momentum.`;
  } else if (adherenceRate >= 0.5) {
    personalNote = `${profile.firstName}, you got ${completedCount}/${scheduledCount} sessions in. Every rep counts. Let's build from here this week.`;
  } else {
    personalNote = `${profile.firstName}, last week was tough — ${completedCount}/${scheduledCount} sessions. No judgment. This week is a fresh start.`;
  }

  // Readiness trend label
  const trendLabel = trends.trend === "improving"
    ? "Trending Up"
    : trends.trend === "declining"
      ? "Needs Attention"
      : "Holding Steady";

  // Next week plan overview
  let nextWeekOverview = "Your plan for this week is being prepared.";
  if (activePlan && activePlan.sessions.length > 0) {
    const sessionLines = activePlan.sessions.map((s) => {
      const dayName = new Date(s.scheduledDate).toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC",
      });
      return `${dayName}: ${s.title}`;
    });
    nextWeekOverview = `${activePlan.name}<br>${sessionLines.join("<br>")}`;
  }

  // Compose email content (HTML-formatted for branded template)
  const emailContent = [
    `<strong>Last Week</strong>`,
    `Sessions: ${completedCount}/${scheduledCount} completed`,
    `Adherence: ${Math.round(adherenceRate * 100)}%`,
    `Readiness: ${trendLabel} (Energy ${trends.avgEnergy}/10 · Sleep ${trends.avgSleep}/10)`,
    ``,
    personalNote,
    ``,
    `<strong>This Week</strong>`,
    nextWeekOverview,
    ``,
    `Stay disciplined. Stay dominant.`,
  ].join("<br>");

  // Send via Resend directly (custom content, not template-based)
  const externalId = await sendEmail(
    user.email,
    "Your Weekly Summary — Vintus Performance",
    emailContent
  );

  // Log in MessageLog for dedup and history
  await prisma.messageLog.create({
    data: {
      userId,
      channel: "EMAIL" as MessageChannel,
      category: "SYSTEM" as MessageCategory,
      templateId: "weekly-digest",
      content: emailContent,
      externalId,
      failedAt: externalId ? undefined : new Date(),
      failureReason: externalId ? undefined : "Email delivery failed",
    },
  });

  logger.info(
    { userId, completedCount, scheduledCount, adherenceRate, trend: trends.trend },
    "Weekly digest sent"
  );
}

// ============================================================
// welcomeSequenceCron — deliver delayed welcome messages
// Checks recently subscribed users (last 48h) and sends
// welcome email (2h+) and follow-up check-in SMS (24h+).
// ============================================================

async function welcomeSequenceCron(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const recentSubscriptions = await prisma.subscription.findMany({
    where: { status: "ACTIVE", createdAt: { gte: cutoff } },
    select: { userId: true },
  });

  let processed = 0;

  for (const sub of recentSubscriptions) {
    try {
      await checkWelcomeSequence(sub.userId);
      processed++;
    } catch (err) {
      logger.error({ err, userId: sub.userId }, "Welcome sequence check failed for client");
    }
  }

  if (processed > 0) {
    logger.info({ processed }, "Welcome sequence cron completed");
  }
}

// ============================================================
// coachRenewalReminderCron — notify the coach ahead of each
// Private Coaching client's monthly renewal so the plan can be
// reviewed and regenerated for the next month.
// ============================================================

const COACH_REMINDER_LEAD_DAYS = 5;

async function coachRenewalReminderCron(): Promise<void> {
  const now = new Date();
  const leadWindowEnd = new Date(now.getTime() + COACH_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000);

  const dueClients = await prisma.subscription.findMany({
    where: {
      planTier: "PRIVATE_COACHING",
      status: "ACTIVE",
      coachReminderSentAt: null,
      currentPeriodEnd: { gte: now, lte: leadWindowEnd },
    },
    include: {
      user: {
        select: {
          email: true,
          athleteProfile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  let sent = 0;

  for (const sub of dueClients) {
    const firstName = sub.user.athleteProfile?.firstName ?? "";
    const lastName = sub.user.athleteProfile?.lastName ?? "";
    const clientName = `${firstName} ${lastName}`.trim() || sub.user.email;
    const renewalDate = sub.currentPeriodEnd.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    try {
      await sendEmail(
        env.COACH_EMAIL,
        `Renewal coming up: ${clientName} — ${renewalDate}`,
        `${clientName}'s (${sub.user.email}) Private Coaching month renews on ${renewalDate}. ` +
          `Log into the admin dashboard to review their progress and click "Regenerate Plan" ` +
          `to build their next month before it renews.`
      );

      await prisma.subscription.update({
        where: { userId: sub.userId },
        data: { coachReminderSentAt: new Date() },
      });

      sent++;
    } catch (err) {
      logger.error({ err, userId: sub.userId }, "Failed to send coach renewal reminder");
    }
  }

  if (sent > 0) {
    logger.info({ sent }, "Coach renewal reminder cron completed");
  }
}

// ============================================================
// bookingReminderCron — text the coach 1 hour ahead of any paid session
// or free consultation, with the meeting link attached. Runs every 5
// minutes and checks a ~10-minute window around the 1-hour mark so a
// booking is always caught by at least one tick; reminderSentAt guards
// against double-sends across ticks.
// ============================================================

async function bookingReminderCron(): Promise<void> {
  if (!env.COACH_PHONE) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

  const [upcomingSessions, upcomingConsults] = await Promise.all([
    prisma.sessionBooking.findMany({
      where: { status: "PAID", reminderSentAt: null },
    }),
    prisma.lead.findMany({
      where: {
        type: "CONSULTATION",
        status: { in: ["NEW", "CONFIRMED"] },
        reminderSentAt: null,
        preferredDate: { not: null },
        preferredTime: { not: null },
      },
    }),
  ]);

  let sent = 0;

  for (const booking of upcomingSessions) {
    const startUtc = nyDateTimeToUtc(booking.scheduledDate, booking.scheduledTime);
    if (startUtc < windowStart || startUtc > windowEnd) continue;

    const config = PAID_SESSION_CATALOG[booking.sessionType];
    const clientName = `${booking.firstName}${booking.lastName ? " " + booking.lastName : ""}`;
    const body = `Vintus: ${config.label} with ${clientName} starts in 1 hour (${booking.scheduledTime}).${booking.meetLink ? ` ${booking.meetLink}` : ""}`;

    try {
      await sendSMS(env.COACH_PHONE, body);
      await prisma.sessionBooking.update({ where: { id: booking.id }, data: { reminderSentAt: new Date() } });
      sent++;
    } catch (err) {
      logger.error({ err, bookingId: booking.id }, "Failed to send paid-session reminder SMS");
    }
  }

  for (const lead of upcomingConsults) {
    if (!lead.preferredDate || !lead.preferredTime) continue;
    const startUtc = nyDateTimeToUtc(lead.preferredDate, lead.preferredTime);
    if (startUtc < windowStart || startUtc > windowEnd) continue;

    const clientName = `${lead.firstName}${lead.lastName ? " " + lead.lastName : ""}`;
    const body = `Vintus: Free consultation with ${clientName} starts in 1 hour (${lead.preferredTime}).${lead.meetLink ? ` ${lead.meetLink}` : ""}`;

    try {
      await sendSMS(env.COACH_PHONE, body);
      await prisma.lead.update({ where: { id: lead.id }, data: { reminderSentAt: new Date() } });
      sent++;
    } catch (err) {
      logger.error({ err, leadId: lead.id }, "Failed to send consultation reminder SMS");
    }
  }

  if (sent > 0) {
    logger.info({ sent }, "Booking reminder cron completed");
  }
}

// ============================================================
// adminDailyDigestCron — one email each morning summarizing
// everything waiting on the coach: pending approvals, escalations,
// plans ending/completed, queued messages, and system health.
// ============================================================

async function adminDailyDigestCron(): Promise<void> {
  const dedupKey = `admin-digest:${new Date().toISOString().split("T")[0]}`;
  if (processedReviews.has(dedupKey)) return;

  await sendAdminDailyDigest();
  processedReviews.set(dedupKey, true);
}

function clientName(entry: { email: string; athleteProfile?: { firstName: string; lastName: string } | null }): string {
  const p = entry.athleteProfile;
  return p ? `${p.firstName} ${p.lastName}`.trim() || entry.email : entry.email;
}

async function sendAdminDailyDigest(): Promise<void> {
  const [actionQueue, pendingTriggers, health] = await Promise.all([
    adminService.getActionQueue(),
    adminService.getPendingTriggers(),
    adminService.getSystemHealth(),
  ]);

  const { pendingApprovals, endingSoon, completedPlans, unresolvedEscalations } = actionQueue;
  const unhealthy = Object.entries(health).filter(([, v]) => v.status !== "ok");

  const totalItems =
    pendingApprovals.length +
    unresolvedEscalations.length +
    completedPlans.length +
    pendingTriggers.length;

  const sections: string[] = [];

  if (unhealthy.length > 0) {
    sections.push(
      `<strong>⚠ System Health</strong><br>` +
        unhealthy.map(([name]) => `${name}: not responding`).join("<br>")
    );
  }

  if (pendingApprovals.length > 0) {
    sections.push(
      `<strong>New Clients Awaiting Approval (${pendingApprovals.length})</strong><br>` +
        (pendingApprovals as Array<{ email: string; athleteProfile?: { firstName: string; lastName: string } | null; subscription?: { planTier: string } | null }>)
          .map((c) => `${clientName(c)} — ${c.subscription?.planTier ?? "?"}`)
          .join("<br>")
    );
  }

  if (unresolvedEscalations.length > 0) {
    sections.push(
      `<strong>Unresolved Escalations (${unresolvedEscalations.length})</strong><br>` +
        (unresolvedEscalations as Array<{ user: { email: string; athleteProfile?: { firstName: string; lastName: string } | null }; triggerReason: string; escalationLevel: number }>)
          .map((e) => `${clientName(e.user)} — level ${e.escalationLevel} (${e.triggerReason})`)
          .join("<br>")
    );
  }

  if (completedPlans.length > 0) {
    sections.push(
      `<strong>Plans Completed — Awaiting Renewal Response (${completedPlans.length})</strong><br>` +
        (completedPlans as Array<{ email: string; athleteProfile?: { firstName: string; lastName: string } | null; daysUntilDelete: number | null }>)
          .map((c) => `${clientName(c)} — auto-deactivates in ${c.daysUntilDelete ?? "?"}d if no response`)
          .join("<br>")
    );
  }

  if (endingSoon.length > 0) {
    sections.push(
      `<strong>Plans Ending Within 7 Days (${endingSoon.length})</strong><br>` +
        (endingSoon as Array<{ email: string; athleteProfile?: { firstName: string; lastName: string } | null; daysRemaining: number }>)
          .map((c) => `${clientName(c)} — ${c.daysRemaining}d left`)
          .join("<br>")
    );
  }

  if (pendingTriggers.length > 0) {
    sections.push(
      `<strong>Queued Messages Awaiting Send (${pendingTriggers.length})</strong><br>` +
        `Auto-messaging is off, so these are sitting in your Actions tab for manual review.`
    );
  }

  if (totalItems === 0 && unhealthy.length === 0) {
    sections.push(`Nothing needs your attention this morning. Everything's running clean.`);
  }

  const emailContent = [
    `<strong>Vintus Performance — Daily Brief</strong>`,
    ``,
    ...sections.map((s) => s + `<br>`),
    `<br><a href="${env.FRONTEND_URL}/admin.html">Open Admin Dashboard →</a>`,
  ].join("<br>");

  await sendEmail(
    env.COACH_EMAIL,
    totalItems > 0
      ? `Daily Brief: ${totalItems} item${totalItems === 1 ? "" : "s"} need your attention`
      : `Daily Brief: All clear`,
    emailContent
  );

  logger.info(
    { pendingApprovals: pendingApprovals.length, unresolvedEscalations: unresolvedEscalations.length, completedPlans: completedPlans.length, pendingTriggers: pendingTriggers.length, unhealthy: unhealthy.length },
    "Admin daily digest sent"
  );
}
