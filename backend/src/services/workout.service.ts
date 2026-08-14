import type { Prisma, SessionType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { anthropic } from "../lib/anthropic.js";
import {
  pickTemplate,
  applyExperienceModifiers,
  scaleVolume,
  type SessionTemplate,
  type MainExercise,
  type WarmupExercise,
  type CooldownExercise,
} from "../data/exercise-library.js";
import { getSwapOptions, isValidSwap } from "../data/exercise-swaps.js";

/**
 * Workout Service — workout generation, adaptive adjustments, and completion tracking.
 * Core "AI Programming Engine": rule-based logic for decisions, exercise library for content.
 */

// ============================================================
// Types
// ============================================================

interface SessionContent {
  warmup: WarmupExercise[];
  main: MainExercise[];
  cooldown: CooldownExercise[];
  estimatedDuration: number;
  estimatedTSS: number;
}

interface SessionSpec {
  type: SessionType;
  title: string;
}

// ============================================================
// Constants — goal-based session type ratios
// ============================================================

const GOAL_RATIOS: Record<string, { strength: number; endurance: number; hiit: number; mobility: number }> = {
  "build-muscle":   { strength: 0.70, endurance: 0.30, hiit: 0.00, mobility: 0.00 },
  "lose-fat":       { strength: 0.50, endurance: 0.30, hiit: 0.20, mobility: 0.00 },
  endurance:        { strength: 0.30, endurance: 0.60, hiit: 0.00, mobility: 0.10 },
  recomposition:    { strength: 0.60, endurance: 0.25, hiit: 0.15, mobility: 0.00 },
  "well-rounded":   { strength: 0.50, endurance: 0.30, hiit: 0.10, mobility: 0.10 },
};

// Strength session type rotation by training days
const STRENGTH_TYPES_BY_DAYS: Record<number, SessionType[]> = {
  2: ["STRENGTH_FULL", "STRENGTH_FULL"],
  3: ["STRENGTH_FULL", "STRENGTH_FULL", "STRENGTH_FULL"],
  4: ["STRENGTH_UPPER", "STRENGTH_LOWER", "STRENGTH_FULL", "STRENGTH_UPPER"],
  5: ["STRENGTH_UPPER", "STRENGTH_LOWER", "STRENGTH_FULL", "STRENGTH_PUSH", "STRENGTH_PULL"],
  6: ["STRENGTH_PUSH", "STRENGTH_PULL", "STRENGTH_LOWER", "STRENGTH_FULL", "STRENGTH_UPPER", "STRENGTH_LOWER"],
};

const ENDURANCE_TYPES: SessionType[] = ["ENDURANCE_ZONE2", "ENDURANCE_TEMPO", "ENDURANCE_INTERVALS"];

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
// Helper: determine block type from week number
// ============================================================

function getBlockType(weekNumber: number): string {
  // Deload every 4th week of each block
  if (weekNumber % 4 === 0) return "deload";
  if (weekNumber <= 4) return "base";
  if (weekNumber <= 8) return "build";
  return "base"; // cycle restarts
}

// Fixed-duration Training tiers get their entire term generated upfront (see
// generateInitialPlan) so a client can see every workout through their actual
// finish date, not just the current week. PRIVATE_COACHING has no fixed end
// date -- it stays on the existing weekly-rolling cron generation.
const FIXED_DURATION_TRAINING_TIERS = new Set(["TRAINING_30DAY", "TRAINING_60DAY", "TRAINING_90DAY"]);

// Derived from the subscription's actual currentPeriodStart/End -- the same
// totalDays math dashboard.service.ts uses for the "Day X of Y" / "Week X of
// Y" display -- rather than a hardcoded per-tier week count. A 60-day tier's
// billed period is exactly 60 real days (checkout.service.ts), which isn't a
// clean multiple of 7, so a fixed "8 weeks" constant undershoots by 4 days
// and leaves the end of the term with no generated workouts.
//
// Rounding totalDays up to the nearest week isn't quite enough on its own:
// week 1 always starts on the Monday of the purchase week (getWeekStart),
// which can be up to 6 days *before* the actual purchase moment that
// currentPeriodStart/End are measured from. A client who buys on a Sunday
// loses nearly a full week of generated coverage to that offset. Adding one
// extra week absorbs the worst case (7 days of buffer against a max 6-day
// loss) so the plan always reaches the real end date regardless of which day
// of the week someone happens to buy on -- a little pre-generated slack at
// the tail is harmless; a gap with no workouts in it isn't.
function getTotalWeeksForTier(
  planTier: string | undefined,
  periodStart?: Date | null,
  periodEnd?: Date | null
): number | null {
  if (!planTier || !FIXED_DURATION_TRAINING_TIERS.has(planTier)) return null;
  if (periodStart && periodEnd) {
    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.ceil(totalDays / 7) + 1);
  }
  // Fallback if period dates are somehow missing
  switch (planTier) {
    case "TRAINING_30DAY": return 5;
    case "TRAINING_60DAY": return 9;
    case "TRAINING_90DAY": return 13;
    default: return null;
  }
}

// Progressive-overload volume for a week that hasn't happened yet -- there's
// no real adherence/readiness signal to react to (unlike generateNextWeek,
// which adapts to how the *previous* week actually went), so this uses pure
// periodization: a gentle ramp within each 4-week block, reset at deload.
function getUpfrontVolumeMultiplier(weekNumber: number, blockType: string): number {
  if (blockType === "deload") return 0.60;
  const weekInBlock = ((weekNumber - 1) % 4) + 1; // 1, 2, 3 for base/build weeks (4 is always deload)
  return 1 + (weekInBlock - 1) * 0.03;
}

// ============================================================
// Helper: build session schedule from goal + training days
// ============================================================

function buildSessionSchedule(
  trainingDays: number,
  goal: string
): SessionSpec[] {
  const clamped = Math.min(Math.max(trainingDays, 2), 6);
  const ratios = GOAL_RATIOS[goal] ?? GOAL_RATIOS["well-rounded"];

  // Calculate counts from ratios
  const strengthCount = Math.max(1, Math.round(clamped * ratios.strength));
  const enduranceCount = Math.max(0, Math.round(clamped * ratios.endurance));
  const hiitCount = Math.max(0, Math.round(clamped * ratios.hiit));
  const mobilityCount = Math.max(0, Math.round(clamped * ratios.mobility));

  // Adjust to match exact training days
  let total = strengthCount + enduranceCount + hiitCount + mobilityCount;
  const specs: SessionSpec[] = [];

  // Add strength sessions
  const strengthRotation = STRENGTH_TYPES_BY_DAYS[clamped] ?? STRENGTH_TYPES_BY_DAYS[4];
  for (let i = 0; i < strengthCount && specs.length < clamped; i++) {
    const type = strengthRotation[i % strengthRotation.length];
    specs.push({ type, title: formatSessionTitle(type, i + 1) });
  }

  // Add endurance sessions
  for (let i = 0; i < enduranceCount && specs.length < clamped; i++) {
    const type = i === 0 ? "ENDURANCE_ZONE2" as SessionType : ENDURANCE_TYPES[i % ENDURANCE_TYPES.length];
    specs.push({ type, title: formatSessionTitle(type, i + 1) });
  }

  // Add HIIT sessions
  for (let i = 0; i < hiitCount && specs.length < clamped; i++) {
    specs.push({ type: "HIIT" as SessionType, title: `HIIT Conditioning ${i + 1}` });
  }

  // Add mobility sessions
  for (let i = 0; i < mobilityCount && specs.length < clamped; i++) {
    specs.push({ type: "MOBILITY_RECOVERY" as SessionType, title: "Mobility & Recovery" });
  }

  // If we're still short, add Zone 2; if over, trim
  while (specs.length < clamped) {
    specs.push({ type: "ENDURANCE_ZONE2" as SessionType, title: "Zone 2 Cardio" });
  }
  total = specs.length;
  if (total > clamped) {
    specs.length = clamped;
  }

  return specs;
}

function formatSessionTitle(type: SessionType, index: number): string {
  const labels: Record<string, string> = {
    STRENGTH_UPPER: "Upper Body Strength",
    STRENGTH_LOWER: "Lower Body Strength",
    STRENGTH_FULL: "Full Body Strength",
    STRENGTH_PUSH: "Push Strength",
    STRENGTH_PULL: "Pull Strength",
    ENDURANCE_ZONE2: "Zone 2 Cardio",
    ENDURANCE_TEMPO: "Tempo Work",
    ENDURANCE_INTERVALS: "Interval Training",
    HIIT: "HIIT Conditioning",
    MOBILITY_RECOVERY: "Mobility & Recovery",
    ACTIVE_RECOVERY: "Active Recovery",
  };
  return labels[type] ?? type;
}

// ============================================================
// Helper: build session content from exercise library
// ============================================================

function buildSessionContent(
  sessionType: string,
  equipment: string,
  experienceLevel: string,
  avoidTemplateIds: string[] = [],
  volumeMultiplier: number = 1.0
): { content: SessionContent; templateId: string } {
  const template = pickTemplate(sessionType, equipment, avoidTemplateIds);

  if (!template) {
    // Fallback: generate minimal content
    return {
      content: {
        warmup: [{ exercise: "General Warm-up", duration: "5 min", notes: "Light movement" }],
        main: [{ exercise: "Bodyweight Circuit", sets: 3, reps: "10-15", rest: "60s", intensity: "RPE 6" }],
        cooldown: [{ exercise: "Static Stretch", duration: "5 min" }],
        estimatedDuration: 30,
        estimatedTSS: 30,
      },
      templateId: "fallback",
    };
  }

  // Apply experience modifiers then volume scaling
  let adjustedMain = applyExperienceModifiers(template.main, experienceLevel);
  if (volumeMultiplier !== 1.0) {
    adjustedMain = scaleVolume(adjustedMain, volumeMultiplier);
  }

  // Recalculate estimated TSS based on volume changes
  const totalSets = adjustedMain.reduce((sum, ex) => sum + ex.sets, 0);
  const baseTotalSets = template.main.reduce((sum, ex) => sum + ex.sets, 0);
  const tssRatio = baseTotalSets > 0 ? totalSets / baseTotalSets : 1;

  return {
    content: {
      warmup: template.warmup,
      main: adjustedMain,
      cooldown: template.cooldown,
      estimatedDuration: Math.round(template.estimatedDuration * (0.5 + 0.5 * tssRatio)),
      estimatedTSS: Math.round(template.estimatedTSS * tssRatio),
    },
    templateId: template.id,
  };
}

// ============================================================
// Safety guardrails
// ============================================================

function clampVolumeChange(
  currentTSS: number,
  previousTSS: number
): number {
  if (previousTSS <= 0) return currentTSS;
  const maxIncrease = previousTSS * 1.10; // +10%
  const maxDecrease = previousTSS * 0.60; // -40% (deload level)
  return Math.min(Math.max(currentTSS, maxDecrease), maxIncrease);
}

async function getRecentTemplateIds(profileId: string, weeks: number = 2): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);
  since.setUTCHours(0, 0, 0, 0);

  const sessions = await prisma.workoutSession.findMany({
    where: {
      workoutPlan: { athleteProfileId: profileId },
      scheduledDate: { gte: since },
    },
    select: { content: true },
  });

  const ids: string[] = [];
  for (const s of sessions) {
    const content = s.content as Record<string, unknown> | null;
    if (content && typeof content === "object" && "templateId" in content) {
      ids.push(content.templateId as string);
    }
  }
  return ids;
}

function shouldDeload(weekNumber: number): boolean {
  return weekNumber % 4 === 0;
}

// ============================================================
// PLAN GENERATION SYSTEM PROMPT
// ============================================================

const PLAN_GENERATION_SYSTEM_PROMPT = `You are the AI training engine for Vintus Performance, a premium fitness coaching platform.
You are generating a personalized Week 1 training plan for a new client.

You must return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "planName": "Week 1 — [Phase Name]",
  "blockType": "base",
  "coachNotes": "2-3 sentence overview of why this plan was designed this way for this specific client",
  "sessions": [
    {
      "dayOffset": 0,
      "sessionType": "STRENGTH_UPPER",
      "title": "Session title",
      "description": "Personalized coach note for this session",
      "prescribedDuration": 45,
      "warmup": [{ "exercise": "Name", "duration": "30 sec", "notes": "Why" }],
      "main": [{ "exercise": "Name", "sets": 3, "reps": "8-10", "rest": "90s", "intensity": "RPE 7", "notes": "Why this exercise" }],
      "cooldown": [{ "exercise": "Name", "duration": "3 min" }]
    }
  ]
}

Rules:
- dayOffset: 0=Monday through 6=Sunday. Schedule exactly the number of training days specified.
- sessionType must be one of: STRENGTH_UPPER, STRENGTH_LOWER, STRENGTH_FULL, STRENGTH_PUSH, STRENGTH_PULL, ENDURANCE_ZONE2, ENDURANCE_TEMPO, ENDURANCE_INTERVALS, HIIT, MOBILITY_RECOVERY, ACTIVE_RECOVERY
- NEVER prescribe exercises that conflict with their injuries. If they have a knee injury, avoid heavy squats/lunges. If shoulder, avoid overhead pressing. Be specific.
- Adjust volume/intensity for their experience level and baseline readiness scores.
- Only prescribe exercises they can do with their equipment.
- Respect their preferred session length — keep sessions within 5 minutes of it.
- Consider their work type: desk workers need more mobility and hip openers. Physical laborers need less total volume.
- If they listed exercises they love, include them when appropriate.
- If they listed exercises they hate, avoid them unless absolutely critical.
- Use their strength levels to set appropriate starting intensity.
- Consider sleep, stress, and recovery practices when setting volume.
- For their plan tier:
  - PRIVATE_COACHING: premium periodized program, maximum personalization
  - TRAINING_30DAY: focused 4-week block targeting primary goal aggressively
  - TRAINING_60DAY: 8-week progressive program with clear phase transitions
  - TRAINING_90DAY: 12-week comprehensive transformation with periodization
  - NUTRITION_4WEEK / NUTRITION_8WEEK: lighter training focus, recovery-oriented
- Each session should have 3-4 warmup exercises, 4-6 main exercises, and 2-3 cooldown exercises.
- The tone should be direct, confident, and premium — like a high-end coach.
- Set RPE based on experience: beginners RPE 5-6, intermediate RPE 7, advanced RPE 8, elite RPE 8-9.
- "rest" must always be one of these clean values: "30s", "45s", "60s", "90s", "120s", "2-3 min", "3-5 min". Never an arbitrary number like "51s" or "64s" — nobody times a rest period to the second.`;

// ============================================================
// generateInitialPlan — Claude-powered with rule-based fallback
// ============================================================

export async function generateInitialPlan(
  profileId: string
): Promise<{ planId: string; sessionCount: number; source: "ai" | "fallback"; fallbackReason?: string }> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: profileId },
  });

  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  // Load subscription for plan tier context
  const subscription = await prisma.subscription.findUnique({
    where: { userId: profile.userId },
    select: { planTier: true, currentPeriodStart: true, currentPeriodEnd: true },
  });

  // Try AI-powered generation first, fall back to rule-based
  let sessionData: Array<{
    scheduledDate: Date;
    scheduledOrder: number;
    sessionType: SessionType;
    title: string;
    description: string;
    prescribedDuration: number;
    prescribedTSS: number;
    content: Prisma.InputJsonValue;
    status: "SCHEDULED";
  }>;
  let planName = "Week 1 — Foundation Phase";
  let source: "ai" | "fallback" = "ai";
  let fallbackReason: string | undefined;

  const startDate = getWeekStart(new Date());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  // Deactivate any existing active plans
  await prisma.workoutPlan.updateMany({
    where: { athleteProfileId: profileId, isActive: true },
    data: { isActive: false },
  });

  try {
    const aiResult = await generatePlanWithClaude(profile, subscription);
    planName = aiResult.planName;
    const VALID_SESSION_TYPES = new Set([
      "STRENGTH_UPPER", "STRENGTH_LOWER", "STRENGTH_FULL", "STRENGTH_PUSH", "STRENGTH_PULL",
      "ENDURANCE_ZONE2", "ENDURANCE_TEMPO", "ENDURANCE_INTERVALS",
      "HIIT", "MOBILITY_RECOVERY", "ACTIVE_RECOVERY", "REST", "CUSTOM",
    ]);

    sessionData = aiResult.sessions.map((s, index) => {
      const sessionDate = new Date(startDate);
      sessionDate.setDate(sessionDate.getDate() + s.dayOffset);
      const estimatedTSS = Math.round(s.prescribedDuration * 1.2);
      const validatedType = VALID_SESSION_TYPES.has(s.sessionType) ? s.sessionType : "CUSTOM";
      return {
        scheduledDate: sessionDate,
        scheduledOrder: index + 1,
        sessionType: validatedType as SessionType,
        title: s.title,
        description: s.description,
        prescribedDuration: s.prescribedDuration,
        prescribedTSS: estimatedTSS,
        content: {
          warmup: s.warmup,
          main: s.main,
          cooldown: s.cooldown,
          estimatedDuration: s.prescribedDuration,
          estimatedTSS: estimatedTSS,
        } as unknown as Prisma.InputJsonValue,
        status: "SCHEDULED" as const,
      };
    });
    logger.info({ profileId }, "AI-generated workout plan created");
  } catch (aiErr) {
    logger.error({ err: aiErr, profileId }, "Claude plan generation failed, using rule-based fallback");
    // Fallback to rule-based generation. Surfaced to the caller so the admin UI can
    // say so — a silent fallback means generic template plans ship to paying clients
    // with nothing indicating the AI never ran.
    source = "fallback";
    fallbackReason = (aiErr as Error).message;
    const result = generateRuleBasedPlan(profile, startDate);
    planName = result.planName;
    sessionData = result.sessionData;
  }

  const plannedTSS = sessionData.reduce((sum, s) => sum + (s.prescribedTSS ?? 0), 0);

  const plan = await prisma.workoutPlan.create({
    data: {
      athleteProfileId: profileId,
      name: planName,
      weekNumber: 1,
      blockType: "base",
      startDate,
      endDate,
      isActive: true,
      plannedTSS,
      sessions: {
        create: sessionData,
      },
    },
  });

  logger.info(
    { profileId, planId: plan.id, sessionCount: sessionData.length, source },
    "Initial workout plan saved"
  );

  // Fixed-duration Training tiers get the rest of their term generated now,
  // so the client can see every workout through their actual finish date
  // instead of only the current week. Week 1 (above) stays the one AI/fallback
  // call and the only isActive plan -- weeks 2+ are rule-based (periodization
  // only, no adherence signal exists yet for weeks that haven't happened) and
  // created inactive; cron.service.ts's weekly check activates each in turn
  // as real time reaches it.
  const totalWeeks = getTotalWeeksForTier(subscription?.planTier, subscription?.currentPeriodStart, subscription?.currentPeriodEnd);
  let totalSessionCount = sessionData.length;
  if (totalWeeks && totalWeeks > 1) {
    totalSessionCount += await generateUpfrontRemainingWeeks(profileId, profile, totalWeeks, endDate);
  }

  return { planId: plan.id, sessionCount: totalSessionCount, source, fallbackReason };
}

// ============================================================
// generateUpfrontRemainingWeeks — weeks 2..N for fixed-duration tiers
// ============================================================

async function generateUpfrontRemainingWeeks(
  profileId: string,
  profile: { trainingDaysPerWeek: number; primaryGoal: string; equipmentAccess: string; experienceLevel: string },
  totalWeeks: number,
  week1EndDate: Date
): Promise<number> {
  const usedTemplateIds: string[] = [];
  let sessionCount = 0;
  let previousWeekStart = new Date(week1EndDate);
  previousWeekStart.setDate(previousWeekStart.getDate() - 6); // back to week 1's Monday

  for (let weekNumber = 2; weekNumber <= totalWeeks; weekNumber++) {
    const blockType = getBlockType(weekNumber);
    const volumeMultiplier = getUpfrontVolumeMultiplier(weekNumber, blockType);

    const weekStart = new Date(previousWeekStart);
    weekStart.setDate(weekStart.getDate() + 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const sessionSpecs = buildSessionSchedule(profile.trainingDaysPerWeek, profile.primaryGoal);
    const sessionData = sessionSpecs.map((spec, index) => {
      const { content, templateId } = buildSessionContent(
        spec.type,
        profile.equipmentAccess,
        profile.experienceLevel,
        usedTemplateIds,
        volumeMultiplier
      );
      usedTemplateIds.push(templateId);

      const dayGap = Math.floor(7 / sessionSpecs.length);
      const sessionDate = new Date(weekStart);
      sessionDate.setDate(sessionDate.getDate() + Math.min(index * dayGap, 6));

      return {
        scheduledDate: sessionDate,
        scheduledOrder: index + 1,
        sessionType: spec.type as SessionType,
        title: spec.title,
        description: `Week ${weekNumber}, Session ${index + 1} — ${spec.title}.${blockType === "deload" ? " Deload week: reduced volume and intensity." : ""}`,
        prescribedDuration: content.estimatedDuration,
        prescribedTSS: content.estimatedTSS,
        content: { ...content, templateId } as unknown as Prisma.InputJsonValue,
        status: "SCHEDULED" as const,
      };
    });

    const plannedTSS = sessionData.reduce((sum, s) => sum + (s.prescribedTSS ?? 0), 0);
    const blockLabel = blockType === "deload" ? "Deload" : blockType === "build" ? "Build Phase" : "Base Phase";

    await prisma.workoutPlan.create({
      data: {
        athleteProfileId: profileId,
        name: `Week ${weekNumber} — ${blockLabel}`,
        weekNumber,
        blockType,
        startDate: weekStart,
        endDate: weekEnd,
        isActive: false,
        plannedTSS,
        sessions: { create: sessionData },
      },
    });

    sessionCount += sessionData.length;
    previousWeekStart = weekStart;
  }

  logger.info(
    { profileId, totalWeeks, sessionCount },
    "Upfront weeks 2+ generated for fixed-duration plan"
  );

  return sessionCount;
}

// ============================================================
// rebuildPlanFromPreferences — client-driven "Edit My Preferences"
// ============================================================

// Distributes `count` sessions across the calendar days of the week
// starting at `weekStart` (a Monday), skipping any weekday in `restDays`
// (Date.getDay() convention: 0=Sun..6=Sat). Returns the chosen dates.
function placeSessionsOnAvailableWeekdays(weekStart: Date, count: number, restDays: number[]): Date[] {
  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weekDates.push(d);
  }
  const available = weekDates.filter((d) => !restDays.includes(d.getDay()));
  if (available.length === 0 || count <= 0) return [];

  const n = Math.min(count, available.length);
  const gap = available.length / n;
  const chosen: Date[] = [];
  for (let i = 0; i < n; i++) {
    chosen.push(available[Math.min(Math.floor(i * gap), available.length - 1)]);
  }
  return chosen;
}

export async function rebuildPlanFromPreferences(
  profileId: string,
  options: { restDays?: number[]; swapDateA?: string; swapDateB?: string }
): Promise<{ regeneratedSessionCount: number; swapped: boolean }> {
  const profile = await prisma.athleteProfile.findUnique({ where: { id: profileId } });
  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  if (!options.restDays && !(options.swapDateA && options.swapDateB)) {
    const err = new Error("Provide restDays and/or a pair of days to swap") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let restDays = profile.restDayPreferences;
  if (options.restDays) {
    restDays = [...new Set(options.restDays)].filter((d) => d >= 0 && d <= 6);
    await prisma.athleteProfile.update({
      where: { id: profileId },
      data: { restDayPreferences: restDays },
    });
  }

  let swapped = false;
  let regenerateFrom = today;

  if (options.swapDateA && options.swapDateB) {
    const dateA = new Date(options.swapDateA + "T00:00:00.000Z");
    const dateB = new Date(options.swapDateB + "T00:00:00.000Z");

    if (dateA.getTime() === dateB.getTime()) {
      const err = new Error("Pick two different days to swap") as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    if (dateA < today || dateB < today) {
      const err = new Error("Can't swap a day that's already passed") as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }

    const [sessionA, sessionB] = await Promise.all([
      prisma.workoutSession.findFirst({
        where: { workoutPlan: { athleteProfileId: profileId }, scheduledDate: dateA },
      }),
      prisma.workoutSession.findFirst({
        where: { workoutPlan: { athleteProfileId: profileId }, scheduledDate: dateB },
      }),
    ]);
    if (!sessionA || !sessionB) {
      const err = new Error("One or both selected days don't have a scheduled session to swap") as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
    if (sessionA.status === "COMPLETED" || sessionB.status === "COMPLETED") {
      const err = new Error("Can't swap a day that's already been completed") as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }

    await prisma.$transaction([
      prisma.workoutSession.update({
        where: { id: sessionA.id },
        data: {
          sessionType: sessionB.sessionType,
          title: sessionB.title,
          description: sessionB.description,
          prescribedDuration: sessionB.prescribedDuration,
          prescribedTSS: sessionB.prescribedTSS,
          content: sessionB.content as Prisma.InputJsonValue,
        },
      }),
      prisma.workoutSession.update({
        where: { id: sessionB.id },
        data: {
          sessionType: sessionA.sessionType,
          title: sessionA.title,
          description: sessionA.description,
          prescribedDuration: sessionA.prescribedDuration,
          prescribedTSS: sessionA.prescribedTSS,
          content: sessionA.content as Prisma.InputJsonValue,
        },
      }),
    ]);
    swapped = true;

    // Everything through the swapped days themselves is settled; only the
    // days strictly after the swap get reflowed, per Anthony's own framing
    // ("readjust all of the future days so the plan remains tailored
    // towards their ultimate end goal") -- the swap itself is the client's
    // explicit choice, not something to regenerate away.
    const laterDate = dateA > dateB ? dateA : dateB;
    const dayAfter = new Date(laterDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    if (dayAfter > regenerateFrom) regenerateFrom = dayAfter;
  }

  const allPlans = await prisma.workoutPlan.findMany({
    where: { athleteProfileId: profileId },
    orderBy: { weekNumber: "asc" },
    include: { sessions: { select: { id: true, scheduledDate: true, status: true } } },
  });
  if (allPlans.length === 0) {
    return { regeneratedSessionCount: 0, swapped };
  }

  const planEnd = allPlans.reduce((max, p) => (p.endDate > max ? p.endDate : max), allPlans[0].endDate);
  if (regenerateFrom > planEnd) {
    return { regeneratedSessionCount: 0, swapped };
  }

  // Seed the avoid-list from recent history so regenerated sessions don't
  // immediately repeat what the client just did.
  const usedTemplateIds = await getRecentTemplateIds(profileId, 2);

  // Delete future, non-completed sessions from regenerateFrom onward across
  // every week -- completed history is never touched, and the swap above
  // (if any) already happened before this cutoff was raised past it.
  const sessionIdsToDelete = allPlans
    .flatMap((p) => p.sessions)
    .filter((s) => s.scheduledDate >= regenerateFrom && s.status !== "COMPLETED")
    .map((s) => s.id);
  if (sessionIdsToDelete.length > 0) {
    await prisma.workoutSession.deleteMany({ where: { id: { in: sessionIdsToDelete } } });
  }

  let regeneratedCount = 0;
  for (const plan of allPlans) {
    if (plan.endDate < regenerateFrom) continue; // this whole week is in the past -- untouched

    const volumeMultiplier = getUpfrontVolumeMultiplier(plan.weekNumber, plan.blockType);
    const sessionSpecs = buildSessionSchedule(profile.trainingDaysPerWeek, profile.primaryGoal);
    const placements = placeSessionsOnAvailableWeekdays(plan.startDate, sessionSpecs.length, restDays);

    const newSessionData = placements
      .map((sessionDate, index) => {
        if (sessionDate < regenerateFrom) return null; // this specific day is in the past, or was just swapped -- leave it
        const spec = sessionSpecs[index];
        const { content, templateId } = buildSessionContent(
          spec.type,
          profile.equipmentAccess,
          profile.experienceLevel,
          usedTemplateIds,
          volumeMultiplier
        );
        usedTemplateIds.push(templateId);
        return {
          workoutPlanId: plan.id,
          scheduledDate: sessionDate,
          scheduledOrder: index + 1,
          sessionType: spec.type as SessionType,
          title: spec.title,
          description: `Week ${plan.weekNumber}, Session ${index + 1} — ${spec.title}.${plan.blockType === "deload" ? " Deload week: reduced volume and intensity." : ""} Rebuilt around your updated preferences.`,
          prescribedDuration: content.estimatedDuration,
          prescribedTSS: content.estimatedTSS,
          content: { ...content, templateId } as unknown as Prisma.InputJsonValue,
          status: "SCHEDULED" as const,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (newSessionData.length > 0) {
      await prisma.workoutSession.createMany({ data: newSessionData });
      regeneratedCount += newSessionData.length;
    }

    const weekSessions = await prisma.workoutSession.findMany({
      where: { workoutPlanId: plan.id },
      select: { prescribedTSS: true },
    });
    const plannedTSS = weekSessions.reduce((sum, s) => sum + (s.prescribedTSS ?? 0), 0);
    await prisma.workoutPlan.update({ where: { id: plan.id }, data: { plannedTSS } });
  }

  // Audit trail, same pattern as executeJerryAdjustment -- log against the
  // plan covering "today" if one exists, otherwise the earliest touched plan.
  const logTargetPlan =
    allPlans.find((p) => p.startDate <= today && p.endDate >= today) ??
    allPlans.find((p) => p.endDate >= regenerateFrom) ??
    allPlans[0];
  if (logTargetPlan) {
    await prisma.adjustmentLog.create({
      data: {
        workoutPlanId: logTargetPlan.id,
        triggerEvent: "client_preference_change",
        triggerData: { restDays: options.restDays ?? null, swapDateA: options.swapDateA ?? null, swapDateB: options.swapDateB ?? null } as unknown as Prisma.InputJsonValue,
        adjustmentType: swapped && options.restDays ? "swap_session_and_rest_days" : swapped ? "swap_session" : "update_rest_days",
        description: `Client updated training preferences via "Edit My Preferences"${swapped ? ` (swapped ${options.swapDateA} <-> ${options.swapDateB})` : ""}${options.restDays ? `, rest days set to [${restDays.join(", ")}]` : ""}. ${regeneratedCount} upcoming session(s) rebuilt around it.`,
        affectedSessions: [],
      },
    });
  }

  logger.info(
    { profileId, regeneratedCount, swapped, restDays },
    "Plan rebuilt from client preferences"
  );

  return { regeneratedSessionCount: regeneratedCount, swapped };
}

// ============================================================
// Claude-powered plan generation
// ============================================================

async function generatePlanWithClaude(
  profile: Awaited<ReturnType<typeof prisma.athleteProfile.findUnique>>,
  subscription: { planTier: string; currentPeriodStart: Date; currentPeriodEnd: Date } | null
): Promise<{
  planName: string;
  sessions: Array<{
    dayOffset: number;
    sessionType: string;
    title: string;
    description: string;
    prescribedDuration: number;
    warmup: Array<{ exercise: string; duration: string; notes: string }>;
    main: Array<{ exercise: string; sets: number; reps: string; rest: string; intensity: string; notes?: string }>;
    cooldown: Array<{ exercise: string; duration: string }>;
  }>;
}> {
  if (!profile) throw new Error("Profile required for AI plan generation");

  // Calculate age from DOB
  let age: string | undefined;
  if (profile.dateOfBirth) {
    const ageDiff = Date.now() - new Date(profile.dateOfBirth).getTime();
    age = Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000)) + " years old";
  }

  // Build the user prompt with ALL available data
  const lines: string[] = [
    `Name: ${profile.firstName} ${profile.lastName}`,
    `Primary Goal: ${profile.primaryGoal}`,
    `Training Days/Week: ${profile.trainingDaysPerWeek}`,
    `Experience Level: ${profile.experienceLevel}`,
    `Equipment Access: ${profile.equipmentAccess}`,
  ];

  if (subscription?.planTier) lines.push(`Plan Tier: ${subscription.planTier}`);
  if (age) lines.push(`Age: ${age}`);
  if (profile.personaType) lines.push(`Persona: ${profile.personaType}`);
  if (profile.aiSummary) lines.push(`Coach Summary: ${profile.aiSummary}`);
  if (profile.riskFlags?.length) lines.push(`Risk Flags: ${profile.riskFlags.join(", ")}`);

  // Physical
  if (profile.heightInches) lines.push(`Height: ${Math.floor(profile.heightInches / 12)}'${profile.heightInches % 12}"`);
  if (profile.weightLbs) lines.push(`Weight: ${profile.weightLbs} lbs`);
  if (profile.bodyFatEstimate) lines.push(`Body Fat: ${profile.bodyFatEstimate}`);

  // Training background
  if (profile.yearsTraining != null) lines.push(`Years Training: ${profile.yearsTraining}`);
  if (profile.currentProgram) lines.push(`Current Program: ${profile.currentProgram}`);
  if (profile.benchPressMax) lines.push(`Bench Press Max: ${profile.benchPressMax}`);
  if (profile.squatMax) lines.push(`Squat Max: ${profile.squatMax}`);
  if (profile.deadliftMax) lines.push(`Deadlift Max: ${profile.deadliftMax}`);
  if (profile.cardioBase) lines.push(`Cardio Base: ${profile.cardioBase}`);
  if (profile.exercisesLoved) lines.push(`Exercises They Love: ${profile.exercisesLoved}`);
  if (profile.exercisesHated) lines.push(`Exercises They Hate: ${profile.exercisesHated}`);

  // Lifestyle
  if (profile.workType) lines.push(`Work Type: ${profile.workType}`);
  if (profile.sessionLength) lines.push(`Preferred Session Length: ${profile.sessionLength} minutes`);
  if (profile.preferredTrainingTime) lines.push(`Preferred Time: ${profile.preferredTrainingTime}`);
  if (profile.wakeTime) lines.push(`Wake Time: ${profile.wakeTime}`);
  if (profile.bedTime) lines.push(`Bed Time: ${profile.bedTime}`);
  if (profile.stressLevel) lines.push(`Stress Level: ${profile.stressLevel}/10`);
  if (profile.sleepSchedule) lines.push(`Sleep Schedule: ${profile.sleepSchedule}`);
  if (profile.dietaryApproach) lines.push(`Diet: ${profile.dietaryApproach}`);
  if (profile.alcoholFrequency) lines.push(`Alcohol: ${profile.alcoholFrequency}`);
  if (profile.caffeineDaily) lines.push(`Caffeine: ${profile.caffeineDaily}`);
  if (profile.mealsPerDay) lines.push(`Meals/Day: ${profile.mealsPerDay}`);
  if (profile.hydrationLevel) lines.push(`Hydration: ${profile.hydrationLevel}`);
  if (profile.supplementsUsed) lines.push(`Supplements: ${profile.supplementsUsed}`);
  if (profile.travelFrequency) lines.push(`Travel: ${profile.travelFrequency}`);
  if (profile.occupation) lines.push(`Occupation: ${profile.occupation}`);

  // Injuries & health
  if (profile.injuryHistory) lines.push(`Injury History: ${profile.injuryHistory}`);
  if (profile.specificInjuries) {
    const injuries = profile.specificInjuries as Array<{ area: string; severity: string; notes?: string }>;
    if (injuries.length) {
      lines.push(`Specific Injuries: ${injuries.map(i => `${i.area} (${i.severity})${i.notes ? " - " + i.notes : ""}`).join("; ")}`);
    }
  }
  if (profile.chronicConditions) lines.push(`Chronic Conditions: ${profile.chronicConditions}`);
  if (profile.medications) lines.push(`Medications: ${profile.medications}`);
  if (profile.previousPT) lines.push(`Previous Physical Therapy: Yes`);

  // Recovery
  if (profile.recoveryPractices?.length) lines.push(`Recovery Practices: ${profile.recoveryPractices.join(", ")}`);

  // Goal specifics
  if (profile.targetWeight) lines.push(`Target Weight: ${profile.targetWeight} lbs`);
  if (profile.goalTimeline) lines.push(`Timeline: ${profile.goalTimeline}`);
  if (profile.eventDate) lines.push(`Event Date: ${profile.eventDate.toISOString().split("T")[0]}`);
  if (profile.eventDescription) lines.push(`Event: ${profile.eventDescription}`);
  if (profile.biggestChallenge) lines.push(`Biggest Challenge: ${profile.biggestChallenge}`);
  if (profile.secondaryGoals?.length) lines.push(`Secondary Goals: ${profile.secondaryGoals.join(", ")}`);

  const userPrompt = lines.join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    // A full week at the prescribed exercise counts runs 2.5-4k tokens of JSON.
    // 4000 sat right on the edge and truncated mid-object, which surfaced as an
    // opaque JSON parse failure and a silent fall back to templates.
    max_tokens: 8000,
    system: PLAN_GENERATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Claude response hit the max_tokens limit and was truncated before the JSON closed"
    );
  }

  // Diagnostic snapshot of the raw response shape — a prior failure returned
  // stop_reason=end_turn with zero-length content, which is not explained by
  // truncation or malformed JSON, so the block types and usage matter here.
  const blockTypes = response.content.map((b) => b.type).join(",") || "none";
  const outputTokens = response.usage?.output_tokens ?? "unknown";

  if (response.content.length === 0) {
    throw new Error(
      `Claude returned an empty content array. stop_reason=${response.stop_reason}, ` +
        `output_tokens=${outputTokens}`
    );
  }

  // Find the first actual text block rather than assuming content[0] is text —
  // a thinking/reasoning block ahead of the answer would otherwise be
  // misreported as "empty" when the real content is one block later.
  const textBlock = response.content.find(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  );
  const text = textBlock?.text ?? "";

  if (!text) {
    throw new Error(
      `Claude returned no usable text block. blockTypes=${blockTypes}, ` +
        `stop_reason=${response.stop_reason}, output_tokens=${outputTokens}`
    );
  }

  // Parse JSON — strip markdown fences if present
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    // Include what actually came back — without this the failure is undiagnosable
    // from logs alone.
    throw new Error(
      `Claude returned unparseable JSON (${(parseErr as Error).message}). ` +
        `stop_reason=${response.stop_reason}, blockTypes=${blockTypes}, length=${cleaned.length}. ` +
        `First 300 chars: ${cleaned.slice(0, 300)}`
    );
  }

  // Validate structure
  if (!parsed.sessions || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    throw new Error("Claude returned plan with no sessions");
  }

  return {
    planName: parsed.planName || "Week 1 — Foundation Phase",
    sessions: parsed.sessions,
  };
}

// ============================================================
// Rule-based fallback (original logic)
// ============================================================

function generateRuleBasedPlan(
  profile: { trainingDaysPerWeek: number; primaryGoal: string; equipmentAccess: string; experienceLevel: string },
  startDate: Date
): {
  planName: string;
  sessionData: Array<{
    scheduledDate: Date;
    scheduledOrder: number;
    sessionType: SessionType;
    title: string;
    description: string;
    prescribedDuration: number;
    prescribedTSS: number;
    content: Prisma.InputJsonValue;
    status: "SCHEDULED";
  }>;
} {
  const sessionSpecs = buildSessionSchedule(profile.trainingDaysPerWeek, profile.primaryGoal);
  const usedTemplateIds: string[] = [];

  const sessionData = sessionSpecs.map((spec, index) => {
    const { content, templateId } = buildSessionContent(
      spec.type,
      profile.equipmentAccess,
      profile.experienceLevel,
      usedTemplateIds
    );
    usedTemplateIds.push(templateId);

    const dayGap = Math.floor(7 / sessionSpecs.length);
    const sessionDate = new Date(startDate);
    sessionDate.setDate(sessionDate.getDate() + Math.min(index * dayGap, 6));

    return {
      scheduledDate: sessionDate,
      scheduledOrder: index + 1,
      sessionType: spec.type as SessionType,
      title: spec.title,
      description: `Week 1, Session ${index + 1} — ${spec.title}. ${profile.experienceLevel === "beginner" ? "Focus on form and controlled tempo." : "Push with intent. Controlled reps."}`,
      prescribedDuration: content.estimatedDuration,
      prescribedTSS: content.estimatedTSS,
      content: { ...content, templateId } as unknown as Prisma.InputJsonValue,
      status: "SCHEDULED" as const,
    };
  });

  return { planName: "Week 1 — Foundation Phase", sessionData };
}

// ============================================================
// generateNextWeek
// ============================================================

export async function generateNextWeek(
  profileId: string
): Promise<{ planId: string; sessionCount: number }> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: profileId },
  });

  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  // Get current active plan to determine week number
  const currentPlan = await prisma.workoutPlan.findFirst({
    where: { athleteProfileId: profileId, isActive: true },
    orderBy: { weekNumber: "desc" },
    include: { sessions: { select: { prescribedTSS: true } } },
  });

  const previousWeekNumber = currentPlan?.weekNumber ?? 0;
  const nextWeekNumber = previousWeekNumber + 1;
  const blockType = getBlockType(nextWeekNumber);
  const isDeload = blockType === "deload";

  // Get adherence data for the current week
  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessions = await prisma.workoutSession.findMany({
    where: {
      workoutPlan: { athleteProfileId: profileId },
      scheduledDate: { gte: weekStart, lt: weekEnd },
    },
    select: { status: true },
  });

  const scheduled = weekSessions.length;
  const completed = weekSessions.filter((s) => s.status === "COMPLETED").length;
  const adherenceRate = scheduled > 0 ? completed / scheduled : 0;

  // Get recent readiness to check avg energy
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const recentReadiness = await prisma.readinessMetric.findMany({
    where: {
      athleteProfileId: profileId,
      date: { gte: twoWeeksAgo },
      source: "MANUAL",
    },
    select: { perceivedEnergy: true, fatigueScore: true },
  });

  const avgEnergy = recentReadiness.length > 0
    ? recentReadiness.reduce((sum, r) => sum + (r.perceivedEnergy ?? 5), 0) / recentReadiness.length
    : 5;

  // Check for sustained high fatigue (deload trigger)
  const recentFatigue = recentReadiness
    .filter((r) => r.fatigueScore != null)
    .map((r) => r.fatigueScore!);
  const highFatigueDays = recentFatigue.filter((f) => f > 70).length;

  // Check for 2 consecutive weeks of low adherence (deload trigger)
  const adherenceRecords = await prisma.adherenceRecord.findMany({
    where: { userId: profile.userId },
    orderBy: { weekStartDate: "desc" },
    take: 2,
    select: { adherenceRate: true },
  });
  const twoWeeksLowAdherence = adherenceRecords.length >= 2 &&
    adherenceRecords.every((r) => r.adherenceRate < 0.5);

  // Determine volume multiplier
  let volumeMultiplier = 1.0;
  if (isDeload || highFatigueDays >= 5 || twoWeeksLowAdherence) {
    volumeMultiplier = 0.60; // deload: -40%
  } else if (adherenceRate > 0.80 && avgEnergy > 6) {
    volumeMultiplier = 1.08; // progressive overload: +5-10%
  } else if (adherenceRate < 0.60) {
    volumeMultiplier = 0.90; // reduce: -10%
  }

  // Clamp against previous week's TSS
  const previousTSS = currentPlan?.sessions.reduce(
    (sum, s) => sum + (s.prescribedTSS ?? 0),
    0
  ) ?? 0;

  // Get recently used template IDs to avoid repeats
  const avoidTemplateIds = await getRecentTemplateIds(profileId, 2);

  // Build session schedule
  const sessionSpecs = buildSessionSchedule(profile.trainingDaysPerWeek, profile.primaryGoal);

  // Calculate dates for next week
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);

  // Deactivate current active plans
  await prisma.workoutPlan.updateMany({
    where: { athleteProfileId: profileId, isActive: true },
    data: { isActive: false },
  });

  // Build session content with volume adjustments
  const usedIds = [...avoidTemplateIds];
  const sessionData = sessionSpecs.map((spec, index) => {
    const { content, templateId } = buildSessionContent(
      spec.type,
      profile.equipmentAccess,
      profile.experienceLevel,
      usedIds,
      volumeMultiplier
    );
    usedIds.push(templateId);

    const dayGap = Math.floor(7 / sessionSpecs.length);
    const sessionDate = new Date(nextWeekStart);
    sessionDate.setDate(sessionDate.getDate() + Math.min(index * dayGap, 6));

    return {
      scheduledDate: sessionDate,
      scheduledOrder: index + 1,
      sessionType: spec.type as SessionType,
      title: spec.title,
      description: `Week ${nextWeekNumber}, Session ${index + 1} — ${spec.title}.${isDeload ? " Deload week: reduced volume and intensity." : ""}`,
      prescribedDuration: content.estimatedDuration,
      prescribedTSS: content.estimatedTSS,
      content: { ...content, templateId } as unknown as Prisma.InputJsonValue,
      status: "SCHEDULED" as const,
    };
  });

  // Apply safety guardrail: clamp total TSS
  let plannedTSS = sessionData.reduce((sum, s) => sum + (s.prescribedTSS ?? 0), 0);
  if (previousTSS > 0) {
    plannedTSS = clampVolumeChange(plannedTSS, previousTSS);
  }

  const blockLabel = isDeload ? "Deload" : blockType === "build" ? "Build Phase" : "Base Phase";
  const plan = await prisma.workoutPlan.create({
    data: {
      athleteProfileId: profileId,
      name: `Week ${nextWeekNumber} — ${blockLabel}`,
      weekNumber: nextWeekNumber,
      blockType,
      startDate: nextWeekStart,
      endDate: nextWeekEnd,
      isActive: true,
      plannedTSS,
      sessions: {
        create: sessionData,
      },
    },
  });

  logger.info(
    {
      profileId,
      planId: plan.id,
      weekNumber: nextWeekNumber,
      blockType,
      adherenceRate,
      avgEnergy,
      volumeMultiplier,
      sessionCount: sessionSpecs.length,
    },
    "Next week workout plan generated"
  );

  return { planId: plan.id, sessionCount: sessionSpecs.length };
}

// ============================================================
// Adaptive Adjustment: Missed Strength Day
// ============================================================

export async function adjustForMissedStrengthDay(
  planId: string,
  missedSessionId: string
): Promise<void> {
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    include: {
      sessions: { orderBy: { scheduledDate: "asc" } },
      athleteProfile: true,
    },
  });

  if (!plan) return;

  const missedSession = plan.sessions.find((s) => s.id === missedSessionId);
  if (!missedSession) return;

  const missedDate = new Date(missedSession.scheduledDate);
  const futureSessions = plan.sessions.filter(
    (s) => new Date(s.scheduledDate) > missedDate && s.status === "SCHEDULED"
  );

  // Count missed strength sessions this week
  const missedStrengthCount = plan.sessions.filter(
    (s) => s.status === "MISSED" && s.sessionType.startsWith("STRENGTH")
  ).length;

  const affectedIds: string[] = [];

  if (missedStrengthCount >= 2) {
    // 2+ missed: consolidate into full-body session on next available slot
    const nextSlot = futureSessions[0];
    if (nextSlot) {
      const { content } = buildSessionContent(
        "STRENGTH_FULL",
        plan.athleteProfile.equipmentAccess,
        plan.athleteProfile.experienceLevel,
        [],
        0.85 // slightly reduced volume
      );

      await prisma.workoutSession.update({
        where: { id: nextSlot.id },
        data: {
          sessionType: "STRENGTH_FULL",
          title: "Consolidated Full Body (Adjusted)",
          description: "Consolidated session after missed strength days. Reduced volume.",
          content: { ...content, templateId: "adjusted" } as unknown as Prisma.InputJsonValue,
          prescribedDuration: content.estimatedDuration,
          prescribedTSS: content.estimatedTSS,
        },
      });
      affectedIds.push(nextSlot.id);
    }
  } else {
    // Check if next day is REST (no session) → swap
    const nextDay = new Date(missedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];

    const nextDaySession = futureSessions.find(
      (s) => new Date(s.scheduledDate).toISOString().split("T")[0] === nextDayStr
    );

    if (!nextDaySession) {
      // Next day is rest — create a reduced-volume replacement
      const { content } = buildSessionContent(
        missedSession.sessionType,
        plan.athleteProfile.equipmentAccess,
        plan.athleteProfile.experienceLevel,
        [],
        0.85 // -15% volume
      );

      const created = await prisma.workoutSession.create({
        data: {
          workoutPlanId: planId,
          scheduledDate: nextDay,
          scheduledOrder: missedSession.scheduledOrder,
          sessionType: missedSession.sessionType,
          title: `${missedSession.title} (Rescheduled)`,
          description: "Rescheduled from missed day. Volume reduced 15%.",
          prescribedDuration: content.estimatedDuration,
          prescribedTSS: content.estimatedTSS,
          content: { ...content, templateId: "rescheduled" } as unknown as Prisma.InputJsonValue,
          status: "SCHEDULED",
          originalDate: missedSession.scheduledDate,
          rescheduledFrom: missedSession.id,
        },
      });
      affectedIds.push(created.id);
    } else if (!nextDaySession.sessionType.startsWith("STRENGTH")) {
      // Next day is endurance/other — push strength to next available
      const emptySlot = findNextEmptySlot(plan.sessions, missedDate, plan.endDate);
      if (emptySlot) {
        const { content } = buildSessionContent(
          missedSession.sessionType,
          plan.athleteProfile.equipmentAccess,
          plan.athleteProfile.experienceLevel,
          [],
          0.85
        );

        const created = await prisma.workoutSession.create({
          data: {
            workoutPlanId: planId,
            scheduledDate: emptySlot,
            scheduledOrder: missedSession.scheduledOrder,
            sessionType: missedSession.sessionType,
            title: `${missedSession.title} (Rescheduled)`,
            description: "Pushed to next available slot. Volume reduced 15%.",
            prescribedDuration: content.estimatedDuration,
            prescribedTSS: content.estimatedTSS,
            content: { ...content, templateId: "rescheduled" } as unknown as Prisma.InputJsonValue,
            status: "SCHEDULED",
            originalDate: missedSession.scheduledDate,
            rescheduledFrom: missedSession.id,
          },
        });
        affectedIds.push(created.id);
      }
    }
  }

  // Mark original session as MISSED
  await prisma.workoutSession.update({
    where: { id: missedSessionId },
    data: { status: "MISSED" },
  });

  // Log adjustment
  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: planId,
      triggerEvent: "missed_workout",
      triggerData: {
        missedSessionId,
        sessionType: missedSession.sessionType,
        missedStrengthCount,
      } as unknown as Prisma.InputJsonValue,
      adjustmentType: missedStrengthCount >= 2 ? "swap_session" : "reschedule",
      description: missedStrengthCount >= 2
        ? `Consolidated remaining strength work into full-body session after ${missedStrengthCount}+ missed strength days.`
        : `Rescheduled missed ${missedSession.sessionType} session to next available slot with 15% volume reduction.`,
      affectedSessions: affectedIds,
    },
  });

  logger.info(
    { planId, missedSessionId, missedStrengthCount, affectedIds },
    "Adjusted for missed strength day"
  );
}

// ============================================================
// Adaptive Adjustment: Missed Endurance Day
// ============================================================

export async function adjustForMissedEnduranceDay(
  planId: string,
  missedSessionId: string
): Promise<void> {
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    include: {
      sessions: { orderBy: { scheduledDate: "asc" } },
      athleteProfile: true,
    },
  });

  if (!plan) return;

  const missedSession = plan.sessions.find((s) => s.id === missedSessionId);
  if (!missedSession) return;

  const missedDate = new Date(missedSession.scheduledDate);
  const futureSessions = plan.sessions.filter(
    (s) => new Date(s.scheduledDate) > missedDate && s.status === "SCHEDULED"
  );

  const affectedIds: string[] = [];

  // Find next endurance session
  const nextEndurance = futureSessions.find((s) =>
    s.sessionType.startsWith("ENDURANCE")
  );

  if (nextEndurance) {
    // Add 15 min Zone 2 to next endurance session
    const existingContent = nextEndurance.content as Record<string, unknown>;
    const currentDuration = (existingContent.estimatedDuration as number) ?? 30;
    const currentTSS = (existingContent.estimatedTSS as number) ?? 30;

    await prisma.workoutSession.update({
      where: { id: nextEndurance.id },
      data: {
        prescribedDuration: currentDuration + 15,
        prescribedTSS: currentTSS + 12,
        content: {
          ...existingContent,
          estimatedDuration: currentDuration + 15,
          estimatedTSS: currentTSS + 12,
        } as unknown as Prisma.InputJsonValue,
        description: `${nextEndurance.description ?? ""} (Extended +15 min to compensate for missed session)`,
      },
    });
    affectedIds.push(nextEndurance.id);

    // Check if weekend session exists — extend by 20%
    const weekendSessions = futureSessions.filter((s) => {
      const day = new Date(s.scheduledDate).getUTCDay();
      return (day === 0 || day === 6) && s.sessionType.startsWith("ENDURANCE");
    });

    for (const ws of weekendSessions) {
      if (ws.id === nextEndurance.id) continue; // already adjusted
      const wsContent = ws.content as Record<string, unknown>;
      const wsDuration = (wsContent.estimatedDuration as number) ?? 30;
      const wsTSS = (wsContent.estimatedTSS as number) ?? 30;

      await prisma.workoutSession.update({
        where: { id: ws.id },
        data: {
          prescribedDuration: Math.round(wsDuration * 1.2),
          prescribedTSS: Math.round(wsTSS * 1.2),
          content: {
            ...wsContent,
            estimatedDuration: Math.round(wsDuration * 1.2),
            estimatedTSS: Math.round(wsTSS * 1.2),
          } as unknown as Prisma.InputJsonValue,
          description: `${ws.description ?? ""} (Extended 20% — weekend compensation)`,
        },
      });
      affectedIds.push(ws.id);
    }
  } else {
    // No endurance sessions remaining — add 30 min Zone 2 to a rest day
    const emptySlot = findNextEmptySlot(plan.sessions, missedDate, plan.endDate);
    if (emptySlot) {
      const { content } = buildSessionContent(
        "ENDURANCE_ZONE2",
        plan.athleteProfile.equipmentAccess,
        plan.athleteProfile.experienceLevel,
        []
      );
      // Override to 30 min
      content.estimatedDuration = 30;
      content.estimatedTSS = 30;

      const created = await prisma.workoutSession.create({
        data: {
          workoutPlanId: planId,
          scheduledDate: emptySlot,
          scheduledOrder: 99,
          sessionType: "ENDURANCE_ZONE2",
          title: "Zone 2 Cardio (Added)",
          description: "Added Zone 2 session to compensate for missed endurance day.",
          prescribedDuration: 30,
          prescribedTSS: 30,
          content: { ...content, templateId: "compensatory" } as unknown as Prisma.InputJsonValue,
          status: "SCHEDULED",
          originalDate: missedSession.scheduledDate,
          rescheduledFrom: missedSession.id,
        },
      });
      affectedIds.push(created.id);
    }
  }

  // Mark original as MISSED
  await prisma.workoutSession.update({
    where: { id: missedSessionId },
    data: { status: "MISSED" },
  });

  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: planId,
      triggerEvent: "missed_workout",
      triggerData: {
        missedSessionId,
        sessionType: missedSession.sessionType,
      } as unknown as Prisma.InputJsonValue,
      adjustmentType: nextEndurance ? "reduce_volume" : "add_recovery",
      description: nextEndurance
        ? "Extended next endurance session by 15 min to compensate for missed cardio."
        : "Added 30-min Zone 2 session on rest day to compensate for missed endurance.",
      affectedSessions: affectedIds,
    },
  });

  logger.info(
    { planId, missedSessionId, affectedIds },
    "Adjusted for missed endurance day"
  );
}

// ============================================================
// Adaptive Adjustment: High Fatigue
// ============================================================

export async function adjustForHighFatigue(
  planId: string,
  readinessData: Record<string, unknown>
): Promise<void> {
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    include: {
      sessions: { orderBy: { scheduledDate: "asc" } },
      athleteProfile: true,
    },
  });

  if (!plan) return;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySession = plan.sessions.find(
    (s) =>
      new Date(s.scheduledDate) >= today &&
      new Date(s.scheduledDate) < tomorrow &&
      s.status === "SCHEDULED"
  );

  const affectedIds: string[] = [];

  if (todaySession) {
    if (todaySession.sessionType === "HIIT") {
      // Replace HIIT with mobility/recovery
      const { content } = buildSessionContent(
        "MOBILITY_RECOVERY",
        plan.athleteProfile.equipmentAccess,
        plan.athleteProfile.experienceLevel
      );

      await prisma.workoutSession.update({
        where: { id: todaySession.id },
        data: {
          sessionType: "MOBILITY_RECOVERY",
          title: "Mobility & Recovery (Fatigue Adjustment)",
          description: "HIIT replaced with recovery due to high fatigue. Listen to your body.",
          content: { ...content, templateId: "fatigue-swap" } as unknown as Prisma.InputJsonValue,
          prescribedDuration: content.estimatedDuration,
          prescribedTSS: content.estimatedTSS,
        },
      });
      affectedIds.push(todaySession.id);
    } else if (todaySession.sessionType.startsWith("STRENGTH")) {
      // Reduce strength volume by 25%
      const existingContent = todaySession.content as Record<string, unknown>;
      const existingMain = (existingContent.main as MainExercise[]) ?? [];
      const reducedMain = scaleVolume(existingMain, 0.75);
      const currentTSS = (existingContent.estimatedTSS as number) ?? 50;

      await prisma.workoutSession.update({
        where: { id: todaySession.id },
        data: {
          description: `${todaySession.description ?? ""} (Volume reduced 25% — fatigue detected)`,
          prescribedTSS: Math.round(currentTSS * 0.75),
          content: {
            ...existingContent,
            main: reducedMain,
            estimatedTSS: Math.round(currentTSS * 0.75),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      affectedIds.push(todaySession.id);
    } else if (todaySession.sessionType.startsWith("ENDURANCE")) {
      // Cap at Zone 2
      const existingContent = todaySession.content as Record<string, unknown>;

      await prisma.workoutSession.update({
        where: { id: todaySession.id },
        data: {
          sessionType: "ENDURANCE_ZONE2",
          description: `${todaySession.description ?? ""} (Capped at Zone 2 — fatigue detected)`,
          content: {
            ...existingContent,
            main: (existingContent.main as MainExercise[])?.map((ex) => ({
              ...ex,
              intensity: "Zone 2 (conversational pace)",
              notes: `${ex.notes ?? ""} Fatigue detected — keep effort easy.`.trim(),
            })),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      affectedIds.push(todaySession.id);
    }
  }

  // Check for sustained fatigue (3+ days) → pull deload forward
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  threeDaysAgo.setUTCHours(0, 0, 0, 0);

  const recentReadiness = await prisma.readinessMetric.findMany({
    where: {
      athleteProfileId: plan.athleteProfile.id,
      date: { gte: threeDaysAgo },
      source: "MANUAL",
    },
    select: { perceivedEnergy: true, perceivedSoreness: true, fatigueScore: true },
  });

  const sustainedFatigue = recentReadiness.length >= 3 && recentReadiness.every((r) => {
    const highFatigue = (r.fatigueScore != null && r.fatigueScore > 70) ||
      ((r.perceivedEnergy ?? 5) < 4 && (r.perceivedSoreness ?? 5) > 7);
    return highFatigue;
  });

  if (sustainedFatigue) {
    // Pull deload forward — reduce all remaining scheduled sessions
    const remaining = plan.sessions.filter(
      (s) => new Date(s.scheduledDate) > today && s.status === "SCHEDULED"
    );

    for (const session of remaining) {
      if (affectedIds.includes(session.id)) continue;
      const existingContent = session.content as Record<string, unknown>;
      const existingMain = (existingContent.main as MainExercise[]) ?? [];
      const reducedMain = scaleVolume(existingMain, 0.60);
      const currentTSS = (existingContent.estimatedTSS as number) ?? 50;

      await prisma.workoutSession.update({
        where: { id: session.id },
        data: {
          description: `${session.description ?? ""} (Emergency deload — sustained fatigue)`,
          prescribedTSS: Math.round(currentTSS * 0.60),
          content: {
            ...existingContent,
            main: reducedMain,
            estimatedTSS: Math.round(currentTSS * 0.60),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      affectedIds.push(session.id);
    }

    // Update plan block type
    await prisma.workoutPlan.update({
      where: { id: planId },
      data: { blockType: "deload" },
    });
  }

  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: planId,
      triggerEvent: "high_fatigue",
      triggerData: readinessData as unknown as Prisma.InputJsonValue,
      adjustmentType: sustainedFatigue ? "advance_deload" : todaySession?.sessionType === "HIIT" ? "swap_session" : "reduce_volume",
      description: sustainedFatigue
        ? "Sustained fatigue detected (3+ days). Pulling deload forward — all remaining sessions reduced to 60% volume."
        : `Fatigue detected. ${todaySession?.sessionType === "HIIT" ? "Replaced HIIT with recovery." : "Reduced today's session volume/intensity."}`,
      affectedSessions: affectedIds,
    },
  });

  logger.info(
    { planId, sustainedFatigue, affectedIds },
    "Adjusted for high fatigue"
  );
}

// ============================================================
// Adaptive Adjustment: Low Sleep
// ============================================================

export async function adjustForLowSleep(
  planId: string,
  readinessData: Record<string, unknown>
): Promise<void> {
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    include: {
      sessions: { orderBy: { scheduledDate: "asc" } },
      athleteProfile: true,
    },
  });

  if (!plan) return;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySession = plan.sessions.find(
    (s) =>
      new Date(s.scheduledDate) >= today &&
      new Date(s.scheduledDate) < tomorrow &&
      s.status === "SCHEDULED"
  );

  const affectedIds: string[] = [];

  if (todaySession) {
    // Reduce intensity by 10%
    const existingContent = todaySession.content as Record<string, unknown>;
    const existingMain = (existingContent.main as MainExercise[]) ?? [];
    const reducedMain = scaleVolume(existingMain, 0.90);
    const currentTSS = (existingContent.estimatedTSS as number) ?? 50;

    await prisma.workoutSession.update({
      where: { id: todaySession.id },
      data: {
        description: `${todaySession.description ?? ""} (Reduced 10% — prioritize 8hr sleep tonight)`,
        prescribedTSS: Math.round(currentTSS * 0.90),
        content: {
          ...existingContent,
          main: reducedMain.map((ex) => ({
            ...ex,
            notes: `${ex.notes ?? ""} Priority: get 8 hours of sleep tonight.`.trim(),
          })),
          estimatedTSS: Math.round(currentTSS * 0.90),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    affectedIds.push(todaySession.id);
  }

  // Check for consecutive low sleep → replace next HIIT
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  twoDaysAgo.setUTCHours(0, 0, 0, 0);

  const recentSleep = await prisma.readinessMetric.findMany({
    where: {
      athleteProfileId: plan.athleteProfile.id,
      date: { gte: twoDaysAgo },
      source: "MANUAL",
    },
    select: { sleepQualityManual: true, sleepScore: true, sleepDurationMin: true },
  });

  const consecutiveLowSleep = recentSleep.length >= 2 && recentSleep.every((r) =>
    (r.sleepScore != null && r.sleepScore < 50) ||
    (r.sleepQualityManual != null && r.sleepQualityManual < 4) ||
    (r.sleepDurationMin != null && r.sleepDurationMin < 360)
  );

  if (consecutiveLowSleep) {
    // Replace next HIIT with active recovery
    const nextHiit = plan.sessions.find(
      (s) =>
        new Date(s.scheduledDate) > today &&
        s.status === "SCHEDULED" &&
        s.sessionType === "HIIT" &&
        !affectedIds.includes(s.id)
    );

    if (nextHiit) {
      const { content } = buildSessionContent(
        "ACTIVE_RECOVERY",
        plan.athleteProfile.equipmentAccess,
        plan.athleteProfile.experienceLevel
      );

      await prisma.workoutSession.update({
        where: { id: nextHiit.id },
        data: {
          sessionType: "ACTIVE_RECOVERY",
          title: "Active Recovery (Sleep Adjustment)",
          description: "HIIT replaced with active recovery due to consecutive low sleep nights.",
          content: { ...content, templateId: "sleep-swap" } as unknown as Prisma.InputJsonValue,
          prescribedDuration: content.estimatedDuration,
          prescribedTSS: content.estimatedTSS,
        },
      });
      affectedIds.push(nextHiit.id);
    }
  }

  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: planId,
      triggerEvent: "low_sleep",
      triggerData: readinessData as unknown as Prisma.InputJsonValue,
      adjustmentType: consecutiveLowSleep ? "swap_session" : "reduce_intensity",
      description: consecutiveLowSleep
        ? "2+ consecutive low sleep nights. Replaced next HIIT with active recovery. Reduced today's intensity."
        : "Low sleep detected. Reduced today's session intensity by 10%. Prioritize sleep tonight.",
      affectedSessions: affectedIds,
    },
  });

  logger.info(
    { planId, consecutiveLowSleep, affectedIds },
    "Adjusted for low sleep"
  );
}

// ============================================================
// Adaptive Adjustment: Travel Week
// ============================================================

export async function adjustForTravelWeek(
  profileId: string
): Promise<void> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: profileId },
    include: {
      workoutPlans: {
        where: { isActive: true },
        orderBy: { weekNumber: "desc" },
        take: 1,
        include: { sessions: { orderBy: { scheduledDate: "asc" } } },
      },
    },
  });

  if (!profile || profile.workoutPlans.length === 0) return;

  const plan = profile.workoutPlans[0];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Get scheduled sessions from today forward
  const futureSessions = plan.sessions.filter(
    (s) => new Date(s.scheduledDate) >= today && s.status === "SCHEDULED"
  );

  const affectedIds: string[] = [];

  // Reduce to max 3 sessions
  const maxTravelSessions = 3;
  const sessionsToKeep = futureSessions.slice(0, maxTravelSessions);
  const sessionsToCancel = futureSessions.slice(maxTravelSessions);

  // Cancel excess sessions
  for (const session of sessionsToCancel) {
    await prisma.workoutSession.update({
      where: { id: session.id },
      data: { status: "SKIPPED", athleteNotes: "Cancelled for travel week" },
    });
    affectedIds.push(session.id);
  }

  // Convert remaining sessions to bodyweight/travel-friendly
  let hasEndurance = false;
  for (const session of sessionsToKeep) {
    if (session.sessionType.startsWith("ENDURANCE")) {
      // Keep one endurance session as-is (running = no equipment)
      if (!hasEndurance) {
        hasEndurance = true;
        // Ensure it's a run (no equipment needed)
        const { content } = buildSessionContent(
          "ENDURANCE_ZONE2",
          "bodyweight-only",
          profile.experienceLevel
        );
        await prisma.workoutSession.update({
          where: { id: session.id },
          data: {
            sessionType: "ENDURANCE_ZONE2",
            title: "Zone 2 Run (Travel)",
            description: "Maintained cardio session — running requires no equipment.",
            content: { ...content, templateId: "travel-endurance" } as unknown as Prisma.InputJsonValue,
            prescribedDuration: content.estimatedDuration,
          },
        });
        affectedIds.push(session.id);
        continue;
      }
    }

    // Replace gym sessions with bodyweight
    if (session.sessionType.startsWith("STRENGTH") || session.sessionType === "HIIT") {
      const bwType = session.sessionType.startsWith("STRENGTH")
        ? session.sessionType
        : "STRENGTH_FULL";

      const { content } = buildSessionContent(
        bwType,
        "bodyweight-only",
        profile.experienceLevel,
        [],
        0.85 // slightly reduced for travel
      );

      await prisma.workoutSession.update({
        where: { id: session.id },
        data: {
          title: `${session.title} (Travel — Bodyweight)`,
          description: "Converted to bodyweight for hotel/travel. No equipment needed.",
          content: { ...content, templateId: "travel-bw" } as unknown as Prisma.InputJsonValue,
          prescribedDuration: content.estimatedDuration,
          prescribedTSS: content.estimatedTSS,
        },
      });
      affectedIds.push(session.id);
    }
  }

  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: plan.id,
      triggerEvent: "travel_week",
      triggerData: {
        profileId,
        travelFrequency: profile.travelFrequency,
        originalSessionCount: futureSessions.length,
        adjustedSessionCount: sessionsToKeep.length,
      } as unknown as Prisma.InputJsonValue,
      adjustmentType: "swap_session",
      description: `Travel week adjustment: reduced from ${futureSessions.length} to ${sessionsToKeep.length} sessions. Gym exercises replaced with bodyweight alternatives.`,
      affectedSessions: affectedIds,
    },
  });

  logger.info(
    { profileId, planId: plan.id, affectedIds, keptSessions: sessionsToKeep.length },
    "Adjusted for travel week"
  );
}

// ============================================================
// Escalation Adjustment: sustained missed-workout pattern
// ============================================================

/**
 * Applied when a client crosses the missed-workout escalation threshold
 * (3+ missed/skipped in a rolling 7 days, or <50% weekly adherence) — a
 * conservative volume trim to the rest of this week's remaining sessions,
 * not a full plan regeneration. An EscalationEvent is created alongside this
 * so it surfaces in the coach's existing unresolved-escalations queue for
 * review; the trim itself ships immediately so the client's week doesn't
 * sit stale while that review happens.
 */
export async function applyEscalationAdjustment(profileId: string): Promise<string[]> {
  const profile = await prisma.athleteProfile.findUnique({ where: { id: profileId } });
  if (!profile) return [];

  const plan = await prisma.workoutPlan.findFirst({
    where: { athleteProfileId: profileId, isActive: true },
    include: { sessions: true },
  });
  if (!plan) return [];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const remaining = plan.sessions.filter(
    (s) => new Date(s.scheduledDate) >= today && s.status === "SCHEDULED"
  );

  const affectedIds: string[] = [];
  for (const s of remaining) {
    const existingContent = s.content as Record<string, unknown>;
    const existingMain = (existingContent.main as MainExercise[]) ?? [];
    const reducedMain = scaleVolume(existingMain, 0.80);
    const currentTSS = (existingContent.estimatedTSS as number) ?? s.prescribedTSS ?? 50;

    await prisma.workoutSession.update({
      where: { id: s.id },
      data: {
        description: `${s.description ?? ""} (Volume reduced 20% — missed-workout pattern detected)`.trim(),
        prescribedTSS: Math.round(currentTSS * 0.80),
        content: {
          ...existingContent,
          main: reducedMain,
          estimatedTSS: Math.round(currentTSS * 0.80),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    affectedIds.push(s.id);
  }

  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: plan.id,
      triggerEvent: "escalation_pattern",
      triggerData: { profileId, affectedCount: affectedIds.length } as unknown as Prisma.InputJsonValue,
      adjustmentType: "reduce_volume",
      description: `Missed-workout pattern detected. Reduced remaining ${affectedIds.length} session(s) this week by 20% volume.`,
      affectedSessions: affectedIds,
    },
  });

  logger.info({ profileId, planId: plan.id, affectedIds }, "Applied escalation volume adjustment");

  return affectedIds;
}

// ============================================================
// Bounded Self-Edit: Exercise Swap (Private Coaching only)
// ============================================================

function buildInjuryBlob(profile: {
  injuryHistory: string | null;
  riskFlags: string[];
  specificInjuries: unknown;
}): string {
  const parts: string[] = [];
  if (profile.injuryHistory) parts.push(profile.injuryHistory);
  if (profile.riskFlags?.length) parts.push(profile.riskFlags.join(" "));
  const injuries = profile.specificInjuries as Array<{ area?: string }> | null;
  if (Array.isArray(injuries)) {
    for (const i of injuries) {
      if (i.area) parts.push(i.area);
    }
  }
  return parts.join(" ").toLowerCase();
}

async function loadSwapContext(userId: string, sessionId: string) {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { planTier: true },
  });

  if (subscription?.planTier !== "PRIVATE_COACHING") {
    const err = new Error("Exercise swaps are available on Private Coaching plans") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, workoutPlan: { athleteProfileId: profile.id } },
  });

  if (!session) {
    const err = new Error("Workout session not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  if (session.status !== "SCHEDULED") {
    const err = new Error("Can only swap exercises on a scheduled session") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  return { profile, session };
}

export async function getSwapAlternatives(
  userId: string,
  sessionId: string,
  exerciseIndex: number
): Promise<{ exercise: string; options: string[] }> {
  const { profile, session } = await loadSwapContext(userId, sessionId);

  const content = session.content as unknown as SessionContent;
  const current = content.main?.[exerciseIndex];
  if (!current) {
    const err = new Error("Exercise not found in this session") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const injuryBlob = buildInjuryBlob(profile);
  const options = getSwapOptions(current.exercise, profile.equipmentAccess, injuryBlob);

  return { exercise: current.exercise, options };
}

export async function applyExerciseSwap(
  userId: string,
  sessionId: string,
  exerciseIndex: number,
  newExercise: string
): Promise<unknown> {
  const { profile, session } = await loadSwapContext(userId, sessionId);

  const content = session.content as unknown as SessionContent;
  const current = content.main?.[exerciseIndex];
  if (!current) {
    const err = new Error("Exercise not found in this session") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const injuryBlob = buildInjuryBlob(profile);
  const allowedOptions = getSwapOptions(current.exercise, profile.equipmentAccess, injuryBlob);

  // Revalidate server-side — never trust the option the client claims it was shown.
  if (!isValidSwap(current.exercise, newExercise) || !allowedOptions.includes(newExercise)) {
    const err = new Error("That alternative isn't available for this exercise") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const previousExercise = current.exercise;
  const updatedMain = content.main.map((ex, i) =>
    i === exerciseIndex ? { ...ex, exercise: newExercise } : ex
  );
  const updatedContent = { ...content, main: updatedMain };

  const updated = await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { content: updatedContent as unknown as Prisma.InputJsonValue },
  });

  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: session.workoutPlanId,
      triggerEvent: "client_swap",
      triggerData: { sessionId, exerciseIndex, from: previousExercise, to: newExercise } as unknown as Prisma.InputJsonValue,
      adjustmentType: "swap_session",
      description: `Client swapped "${previousExercise}" for "${newExercise}" on "${session.title}".`,
      affectedSessions: [sessionId],
    },
  });

  logger.info({ userId, sessionId, exerciseIndex, previousExercise, newExercise }, "Client exercise swap applied");

  return updated;
}

// ============================================================
// Jerry (chat) session adjustment — Private Coaching only
// ============================================================

export interface JerryAdjustmentParams {
  date: string; // YYYY-MM-DD
  action: "swap_exercise" | "reduce_intensity" | "skip_session";
  exerciseName?: string;
  newExercise?: string;
  reason: string;
}

export interface JerryAdjustmentResult {
  ok: boolean;
  message: string; // fed back to Claude as the tool_result
  description?: string; // short client-facing change note, if successful
}

/**
 * Executes a bounded plan change requested through the chat tool. Every path
 * here is deliberately narrow: only sessions in [today, today+7] can be
 * touched, exercise swaps still have to pass the same pre-approved
 * movement-pattern groups as the self-serve swap UI, and intensity can only
 * come down (never up) by a fixed, small amount. Jerry has latitude to
 * decide *when* to use this, not *how far* any single use can reach.
 */
export async function executeJerryAdjustment(
  userId: string,
  params: JerryAdjustmentParams
): Promise<JerryAdjustmentResult> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) return { ok: false, message: "No athlete profile found for this client." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return { ok: false, message: "Date must be in YYYY-MM-DD format." };
  }

  const targetDate = new Date(params.date + "T00:00:00.000Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7);

  if (targetDate < today || targetDate > maxDate) {
    return { ok: false, message: "Can only adjust sessions between today and 7 days out." };
  }

  const tomorrow = new Date(targetDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const session = await prisma.workoutSession.findFirst({
    where: {
      workoutPlan: { athleteProfileId: profile.id, isActive: true },
      scheduledDate: { gte: targetDate, lt: tomorrow },
    },
  });

  if (!session) {
    return { ok: false, message: `No scheduled session found on ${params.date}.` };
  }

  if (session.status !== "SCHEDULED") {
    return { ok: false, message: `That session is already marked ${session.status.toLowerCase()} — nothing to adjust.` };
  }

  const content = session.content as unknown as SessionContent;

  if (params.action === "skip_session") {
    await prisma.workoutSession.update({
      where: { id: session.id },
      data: { status: "SKIPPED", athleteNotes: params.reason },
    });
    await prisma.adjustmentLog.create({
      data: {
        workoutPlanId: session.workoutPlanId,
        triggerEvent: "jerry_chat",
        triggerData: { sessionId: session.id, action: params.action, reason: params.reason } as unknown as Prisma.InputJsonValue,
        adjustmentType: "skip_no_replan",
        description: `Jerry skipped "${session.title}" (${params.date}) via chat: ${params.reason}`,
        affectedSessions: [session.id],
      },
    });
    return { ok: true, message: "Session skipped.", description: `Skipped "${session.title}" on ${params.date}` };
  }

  if (params.action === "reduce_intensity") {
    const existingMain = content.main ?? [];
    const reducedMain = scaleVolume(existingMain, 0.85);
    const currentTSS = content.estimatedTSS ?? session.prescribedTSS ?? 50;

    await prisma.workoutSession.update({
      where: { id: session.id },
      data: {
        description: `${session.description ?? ""} (Reduced 15% via chat — ${params.reason})`.trim(),
        prescribedTSS: Math.round(currentTSS * 0.85),
        content: { ...content, main: reducedMain, estimatedTSS: Math.round(currentTSS * 0.85) } as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.adjustmentLog.create({
      data: {
        workoutPlanId: session.workoutPlanId,
        triggerEvent: "jerry_chat",
        triggerData: { sessionId: session.id, action: params.action, reason: params.reason } as unknown as Prisma.InputJsonValue,
        adjustmentType: "reduce_intensity",
        description: `Jerry reduced intensity 15% on "${session.title}" (${params.date}) via chat: ${params.reason}`,
        affectedSessions: [session.id],
      },
    });
    return { ok: true, message: "Intensity reduced 15% for that session.", description: `Reduced intensity on "${session.title}" (${params.date})` };
  }

  // swap_exercise
  if (!params.exerciseName || !params.newExercise) {
    return { ok: false, message: "swap_exercise requires both exerciseName and newExercise." };
  }

  const index = (content.main ?? []).findIndex(
    (ex) => ex.exercise.toLowerCase() === params.exerciseName!.toLowerCase()
  );
  if (index === -1) {
    return { ok: false, message: `Couldn't find "${params.exerciseName}" in that session.` };
  }

  const actualName = content.main[index].exercise;
  const injuryBlob = buildInjuryBlob(profile);
  const allowedOptions = getSwapOptions(actualName, profile.equipmentAccess, injuryBlob);

  if (!isValidSwap(actualName, params.newExercise) || !allowedOptions.includes(params.newExercise)) {
    const suggestion = allowedOptions.length
      ? ` Approved alternatives for "${actualName}": ${allowedOptions.join(", ")}.`
      : ` No pre-approved alternative exists for "${actualName}" — this one needs a human coach's judgment.`;
    return { ok: false, message: `"${params.newExercise}" isn't a pre-approved substitute for "${actualName}".${suggestion}` };
  }

  const updatedMain = content.main.map((ex, i) => (i === index ? { ...ex, exercise: params.newExercise! } : ex));
  await prisma.workoutSession.update({
    where: { id: session.id },
    data: { content: { ...content, main: updatedMain } as unknown as Prisma.InputJsonValue },
  });
  await prisma.adjustmentLog.create({
    data: {
      workoutPlanId: session.workoutPlanId,
      triggerEvent: "jerry_chat",
      triggerData: { sessionId: session.id, from: actualName, to: params.newExercise, reason: params.reason } as unknown as Prisma.InputJsonValue,
      adjustmentType: "swap_session",
      description: `Jerry swapped "${actualName}" for "${params.newExercise}" on "${session.title}" (${params.date}) via chat: ${params.reason}`,
      affectedSessions: [session.id],
    },
  });

  return {
    ok: true,
    message: `Swapped "${actualName}" for "${params.newExercise}".`,
    description: `Swapped "${actualName}" → "${params.newExercise}" on ${params.date}`,
  };
}

// ============================================================
// Helpers
// ============================================================

function findNextEmptySlot(
  sessions: { scheduledDate: Date; status: string }[],
  afterDate: Date,
  planEndDate: Date
): Date | null {
  const scheduledDates = new Set(
    sessions
      .filter((s) => s.status !== "MISSED" && s.status !== "SKIPPED")
      .map((s) => new Date(s.scheduledDate).toISOString().split("T")[0])
  );

  const cursor = new Date(afterDate);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= planEndDate) {
    const dateStr = cursor.toISOString().split("T")[0];
    if (!scheduledDates.has(dateStr)) {
      return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}
