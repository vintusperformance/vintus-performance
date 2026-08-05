import jwt, { type SignOptions, type Secret } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { DataSource, Prisma } from "@prisma/client";
import { stripe } from "../config/stripe.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { generateInitialPlan } from "./workout.service.js";
import { generateNutritionPlan } from "./nutrition.service.js";
import { notifyNewClient } from "../lib/gmail-notify.js";
import { isWaiverEnabled } from "../lib/feature-flags.js";
import { sendSMS } from "../lib/twilio.js";
import type { RoutineQuestionnaire, NutritionIntake } from "../routes/schemas/onboarding.schemas.js";

const SALT_ROUNDS = 12;

// Bump this whenever the waiver text at legal/private-coaching-waiver-DRAFT.md
// changes, so acceptance records stay tied to the exact version agreed to.
export const CURRENT_WAIVER_VERSION = "2026-07-28-refund-terms";

// ============================================================
// JWT helpers (same logic as auth.service — kept local to avoid circular deps)
// ============================================================

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

function signToken(payload: TokenPayload): string {
  const secret: Secret = env.JWT_SECRET;
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as unknown as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, secret, options);
}

function getTokenExpiry(): Date {
  const match = env.JWT_EXPIRES_IN.match(/^(\d+)([dhms])$/);
  const now = Date.now();
  if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  return new Date(now + value * (multipliers[unit] ?? 0));
}

// ============================================================
// verifyCheckoutSession
// ============================================================

export async function verifyCheckoutSession(
  stripeSessionId: string
): Promise<{ userId: string; tier: string; email: string; waiverRequired: boolean }> {
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

  if (session.status !== "complete") {
    const err = new Error("Checkout session is not complete") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier;

  if (!userId || !tier) {
    const err = new Error("Checkout session missing metadata") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const email =
    session.customer_details?.email ??
    session.customer_email ??
    "";

  const waiverRequired = tier === "PRIVATE_COACHING" && isWaiverEnabled();

  logger.info({ userId, tier, stripeSessionId, waiverRequired }, "Checkout session verified");

  return { userId, tier, email, waiverRequired };
}

// ============================================================
// recordWaiverAcceptance
// ============================================================

export async function recordWaiverAcceptance(userId: string): Promise<{ waiverAcceptedAt: Date }> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });

  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const waiverAcceptedAt = new Date();

  await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: { waiverAcceptedAt, waiverVersion: CURRENT_WAIVER_VERSION },
  });

  logger.info({ userId, waiverVersion: CURRENT_WAIVER_VERSION }, "Waiver accepted");

  return { waiverAcceptedAt };
}

// ============================================================
// setInitialPassword
// ============================================================

export async function setInitialPassword(
  userId: string,
  stripeSessionId: string,
  newPassword: string
): Promise<{ token: string }> {
  // Verify the Stripe session belongs to this user
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

  if (session.metadata?.userId !== userId) {
    const err = new Error("Session does not match user") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    const err = new Error("User not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Create session + JWT so user is immediately logged in
  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: getTokenExpiry(),
    },
  });

  logger.info({ userId }, "Initial password set during onboarding");

  return { token };
}

// ============================================================
// submitRoutineQuestionnaire
// ============================================================

export async function submitRoutineQuestionnaire(
  userId: string,
  data: RoutineQuestionnaire
): Promise<{ planId: string; sessionCount: number }> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  // Update AthleteProfile with routine + expanded fields
  await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: {
      // Existing routine fields
      wakeTime: data.wakeTime,
      bedTime: data.bedTime,
      mealsPerDay: data.mealsPerDay,
      hydrationLevel: data.hydrationLevel,
      supplementsUsed: data.supplementsUsed ?? null,
      recoveryPractices: data.recoveryPractices,

      // Physical Profile
      ...(data.gender ? { gender: data.gender } : {}),
      ...(data.heightInches != null ? { heightInches: data.heightInches } : {}),
      ...(data.weightLbs != null ? { weightLbs: data.weightLbs } : {}),
      ...(data.bodyFatEstimate ? { bodyFatEstimate: data.bodyFatEstimate } : {}),

      // Training Background
      ...(data.yearsTraining != null ? { yearsTraining: data.yearsTraining } : {}),
      ...(data.currentProgram ? { currentProgram: data.currentProgram } : {}),
      ...(data.benchPressMax ? { benchPressMax: data.benchPressMax } : {}),
      ...(data.squatMax ? { squatMax: data.squatMax } : {}),
      ...(data.deadliftMax ? { deadliftMax: data.deadliftMax } : {}),
      ...(data.cardioBase ? { cardioBase: data.cardioBase } : {}),
      ...(data.exercisesLoved ? { exercisesLoved: data.exercisesLoved } : {}),
      ...(data.exercisesHated ? { exercisesHated: data.exercisesHated } : {}),

      // Lifestyle
      ...(data.workType ? { workType: data.workType } : {}),
      ...(data.sessionLength != null ? { sessionLength: data.sessionLength } : {}),
      ...(data.dietaryApproach ? { dietaryApproach: data.dietaryApproach } : {}),
      ...(data.alcoholFrequency ? { alcoholFrequency: data.alcoholFrequency } : {}),
      ...(data.caffeineDaily ? { caffeineDaily: data.caffeineDaily } : {}),

      // Nutrition Profile
      ...(data.activityLevel ? { activityLevel: data.activityLevel } : {}),
      ...(data.foodAllergies ? { foodAllergies: data.foodAllergies } : {}),
      ...(data.foodsLoved ? { foodsLoved: data.foodsLoved } : {}),
      ...(data.foodsHated ? { foodsHated: data.foodsHated } : {}),
      ...(data.cookingSkill ? { cookingSkill: data.cookingSkill } : {}),
      ...(data.mealPrepTime ? { mealPrepTime: data.mealPrepTime } : {}),
      ...(data.foodBudget ? { foodBudget: data.foodBudget } : {}),

      // Injuries & Health
      ...(data.specificInjuries ? { specificInjuries: data.specificInjuries as unknown as Prisma.InputJsonValue } : {}),
      ...(data.chronicConditions ? { chronicConditions: data.chronicConditions } : {}),
      ...(data.medications ? { medications: data.medications } : {}),
      ...(data.previousPT != null ? { previousPT: data.previousPT } : {}),

      // Goal Specifics
      ...(data.targetWeight != null ? { targetWeight: data.targetWeight } : {}),
      ...(data.goalTimeline ? { goalTimeline: data.goalTimeline } : {}),
      ...(data.eventDate ? { eventDate: new Date(data.eventDate) } : {}),
      ...(data.eventDescription ? { eventDescription: data.eventDescription } : {}),
    },
  });

  // Create or update initial ReadinessMetric as baseline (upsert to handle re-submission)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.readinessMetric.upsert({
    where: {
      athleteProfileId_date_source: {
        athleteProfileId: profile.id,
        date: today,
        source: "MANUAL",
      },
    },
    create: {
      athleteProfileId: profile.id,
      date: today,
      source: "MANUAL",
      perceivedEnergy: data.typicalEnergyLevel,
      perceivedSoreness: data.typicalSorenessLevel,
      perceivedMood: data.typicalMoodLevel,
      sleepQualityManual: data.typicalSleepQuality,
      notes: "Baseline from onboarding questionnaire",
    },
    update: {
      perceivedEnergy: data.typicalEnergyLevel,
      perceivedSoreness: data.typicalSorenessLevel,
      perceivedMood: data.typicalMoodLevel,
      sleepQualityManual: data.typicalSleepQuality,
      notes: "Baseline from onboarding questionnaire",
    },
  });

  // Generate initial workout plan (only if one doesn't already exist)
  const existingPlan = await prisma.workoutPlan.findFirst({
    where: { athleteProfileId: profile.id, isActive: true },
  });

  if (existingPlan) {
    logger.info(
      { userId, profileId: profile.id, planId: existingPlan.id },
      "Onboarding routine completed — plan already exists, skipping generation"
    );
    return { planId: existingPlan.id, sessionCount: 0 };
  }

  const plan = await generateInitialPlan(profile.id);

  logger.info(
    { userId, profileId: profile.id, planId: plan.planId, source: plan.source },
    "Onboarding routine completed, initial plan generated"
  );

  // A new client receiving a generic template instead of a personalized plan is a
  // product failure, not a warning — log it loudly so it is visible in Railway.
  if (plan.source === "fallback") {
    logger.error(
      { userId, profileId: profile.id, planId: plan.planId, reason: plan.fallbackReason },
      "NEW CLIENT RECEIVED TEMPLATE PLAN — AI generation failed during onboarding"
    );
  }

  // Notify admin — client has completed onboarding with full profile + plan generated.
  // This is the ideal time: admin has all data to review before approving.
  // Nutrition tiers live in a separate table (NutritionSubscription) so a
  // client can hold a training/coaching plan and a nutrition plan at once —
  // a first-time nutrition-only signup has no `subscription` row at all.
  const userWithSub = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: { select: { planTier: true, status: true } },
      nutritionSubscription: { select: { planTier: true, status: true } },
    },
  });

  if (userWithSub?.subscription) {
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || userWithSub.email;
    notifyNewClient({
      name,
      email: userWithSub.email,
      planTier: userWithSub.subscription.planTier,
      status: userWithSub.subscription.status,
    }).catch((err) => logger.error({ err, userId }, "Admin notification failed after onboarding"));

    // Give the coach a faster path to approve than opening the admin dashboard —
    // reply APPROVE to the most recent request (see sms-webhook.routes.ts).
    if (userWithSub.subscription.status === "PENDING_APPROVAL" && env.COACH_PHONE) {
      const tierLabel = userWithSub.subscription.planTier.replace(/_/g, " ");
      const message = `Vintus: ${name} finished onboarding (${tierLabel}) and is awaiting approval. Reply APPROVE to activate.`;

      sendSMS(env.COACH_PHONE, message)
        .then((sid) =>
          prisma.messageLog.create({
            data: {
              userId,
              channel: "SMS",
              category: "COACH_APPROVAL_REQUEST",
              content: message,
              templateId: "coach-approval-request",
              externalId: sid,
            },
          })
        )
        .catch((err) => logger.error({ err, userId }, "Coach approval SMS failed"));
    }
  }

  // A first-time nutrition-only signup admin notification (training/coaching
  // clients adding nutrition as an add-on go through a separate lightweight
  // endpoint, not this questionnaire, so there's no double-notify risk here).
  if (userWithSub?.nutritionSubscription && !userWithSub.subscription) {
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || userWithSub.email;
    notifyNewClient({
      name,
      email: userWithSub.email,
      planTier: userWithSub.nutritionSubscription.planTier,
      status: userWithSub.nutritionSubscription.status,
    }).catch((err) => logger.error({ err, userId }, "Admin notification failed after nutrition onboarding"));
  }

  // Nutrition tiers get a real generated nutrition plan (calorie/macro
  // targets + AI meal plan) in addition to the lighter recovery-oriented
  // workout plan above — this is the tier's primary paid deliverable.
  if (userWithSub?.nutritionSubscription) {
    try {
      const nutritionResult = await generateNutritionPlan(profile.id);
      if (nutritionResult.source === "fallback") {
        logger.error(
          { userId, profileId: profile.id, reason: nutritionResult.fallbackReason },
          "NEW NUTRITION CLIENT RECEIVED TEMPLATE MEAL PLAN — AI generation failed during onboarding"
        );
      }
    } catch (err) {
      // A nutrition-plan failure must never block onboarding completion —
      // the client still gets their password/dashboard access either way.
      logger.error({ err, userId, profileId: profile.id }, "Nutrition plan generation failed during onboarding");
    }
  }

  return plan;
}

// ============================================================
// submitNutritionIntake — add-on Nutrition Plan for an existing client
// ============================================================

/**
 * Lightweight nutrition-only intake for a client who already has an account
 * and profile (most commonly: a training/coaching client who bought a
 * Nutrition Plan on top). No password step, no re-asking training-specific
 * questions — just the fields that drive calorie/macro calculation and meal
 * planning, then generates the plan immediately.
 */
export async function submitNutritionIntake(
  userId: string,
  data: NutritionIntake
): Promise<{ planId: string; source: "ai" | "fallback" }> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const nutritionSub = await prisma.nutritionSubscription.findUnique({ where: { userId } });
  if (!nutritionSub) {
    const err = new Error("No active nutrition plan found for this account") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: {
      ...(data.gender ? { gender: data.gender } : {}),
      ...(data.heightInches != null ? { heightInches: data.heightInches } : {}),
      ...(data.weightLbs != null ? { weightLbs: data.weightLbs } : {}),
      ...(data.mealsPerDay != null ? { mealsPerDay: data.mealsPerDay } : {}),
      ...(data.dietaryApproach ? { dietaryApproach: data.dietaryApproach } : {}),
      ...(data.activityLevel ? { activityLevel: data.activityLevel } : {}),
      ...(data.foodAllergies ? { foodAllergies: data.foodAllergies } : {}),
      ...(data.foodsLoved ? { foodsLoved: data.foodsLoved } : {}),
      ...(data.foodsHated ? { foodsHated: data.foodsHated } : {}),
      ...(data.cookingSkill ? { cookingSkill: data.cookingSkill } : {}),
      ...(data.mealPrepTime ? { mealPrepTime: data.mealPrepTime } : {}),
      ...(data.foodBudget ? { foodBudget: data.foodBudget } : {}),
      ...(data.chronicConditions ? { chronicConditions: data.chronicConditions } : {}),
      ...(data.medications ? { medications: data.medications } : {}),
    },
  });

  const result = await generateNutritionPlan(profile.id);
  if (result.source === "fallback") {
    logger.error(
      { userId, profileId: profile.id, reason: result.fallbackReason },
      "ADD-ON NUTRITION CLIENT RECEIVED TEMPLATE MEAL PLAN — AI generation failed during intake"
    );
  }

  logger.info({ userId, profileId: profile.id, planId: result.planId }, "Add-on nutrition intake completed");

  return { planId: result.planId, source: result.source };
}

// ============================================================
// initiateDeviceConnection (MVP: pending record, no OAuth)
// ============================================================

export async function initiateDeviceConnection(
  userId: string,
  provider: DataSource
): Promise<{ provider: string; status: string; setupUrl: string | null }> {
  // Upsert so repeated calls don't create duplicates
  await prisma.deviceConnection.upsert({
    where: {
      userId_provider: { userId, provider },
    },
    create: {
      userId,
      provider,
      isActive: false,
      scopes: [],
    },
    update: {
      // No-op — just ensure it exists
    },
  });

  logger.info({ userId, provider }, "Device connection initiated (pending)");

  return {
    provider,
    status: "pending",
    setupUrl: null, // Phase 2: OAuth URL
  };
}

// ============================================================
// getOnboardingStatus
// ============================================================

export async function getOnboardingStatus(userId: string): Promise<{
  passwordSet: boolean;
  deviceConnected: boolean;
  routineCompleted: boolean;
  planGenerated: boolean;
  waiverAccepted: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      sessions: { take: 1 },
      athleteProfile: {
        include: {
          workoutPlans: { take: 1 },
        },
      },
      deviceConnections: { where: { isActive: true }, take: 1 },
    },
  });

  if (!user) {
    const err = new Error("User not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  // Password is "set" if user has at least one session (meaning they logged in / set password)
  const passwordSet = (user.sessions?.length ?? 0) > 0;

  // Device is connected if any active DeviceConnection exists
  const deviceConnected = (user.deviceConnections?.length ?? 0) > 0;

  // Routine is completed if wakeTime is set (required field from questionnaire)
  const routineCompleted = user.athleteProfile?.wakeTime != null;

  // Plan is generated if at least one WorkoutPlan exists
  const planGenerated = (user.athleteProfile?.workoutPlans?.length ?? 0) > 0;

  const waiverAccepted = user.athleteProfile?.waiverAcceptedAt != null;

  return { passwordSet, deviceConnected, routineCompleted, planGenerated, waiverAccepted };
}
