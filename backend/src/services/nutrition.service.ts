import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { anthropic } from "../lib/anthropic.js";

/**
 * Nutrition Plan Service — generates real calorie/macro targets and an
 * AI-written meal plan for NUTRITION_4WEEK / NUTRITION_8WEEK clients.
 * Mirrors workout.service.ts's generate-then-fallback pattern: the AI call
 * is tried first, a rule-based plan is the safety net, and it's surfaced
 * via `source` so a silent fallback never looks like a real AI plan.
 */

const TIER_DURATION_DAYS: Record<string, number> = {
  NUTRITION_4WEEK: 28,
  NUTRITION_8WEEK: 56,
};

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very-active": 1.9,
};

interface MacroTargets {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  usedDefaults: string[]; // which inputs were missing and defaulted, for coachNotes
}

export interface GoalClassification {
  calorieDirection: "deficit" | "surplus" | "maintenance";
  magnitude: "conservative" | "moderate" | "aggressive";
  proteinEmphasis: boolean; // true when muscle preservation/growth matters alongside the calorie direction
  rationale: string; // short, client-facing explanation of the approach chosen
}

const CALORIE_ADJUSTMENTS: Record<GoalClassification["calorieDirection"], Record<GoalClassification["magnitude"], number>> = {
  deficit: { conservative: -300, moderate: -500, aggressive: -750 },
  surplus: { conservative: 200, moderate: 300, aggressive: 500 },
  maintenance: { conservative: 0, moderate: 0, aggressive: 0 },
};

const GOAL_CLASSIFICATION_SYSTEM_PROMPT = `You classify a client's free-text nutrition goal into structured directives that drive calorie and protein math for a precision nutrition coaching service. Read their own words carefully — a goal can combine multiple intents (e.g. "lose weight but keep my muscle" is a deficit AND needs elevated protein to protect muscle during that deficit).

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "calorieDirection": "deficit" | "surplus" | "maintenance",
  "magnitude": "conservative" | "moderate" | "aggressive",
  "proteinEmphasis": true | false,
  "rationale": "one sentence, client-facing, explaining the approach in plain language"
}

Guidance:
- "lose weight/fat", "cut", "lean out", "drop pounds" -> deficit.
- "build/gain muscle", "bulk", "get bigger/stronger" -> surplus.
- "recomp", "lose fat and build muscle", "tone up" -> deficit, proteinEmphasis true (body recomposition is best driven by a modest deficit with high protein, not a surplus).
- "maintain", "stay the same", "just eat better", "more energy" with no weight-change intent -> maintenance.
- proteinEmphasis is true whenever preserving or building muscle is mentioned or implied, regardless of calorie direction.
- Default to moderate magnitude unless they explicitly signal urgency ("fast", "aggressive", "quickly") -> aggressive, or caution ("slow", "sustainable", "gradual") -> conservative.
- If the free text is empty, vague, or uninterpretable, fall back to their stated primary goal.`;

/**
 * Classifies a client's free-text nutrition goal (plus their primaryGoal as
 * a prior) into structured calorie-direction/magnitude/protein-emphasis
 * directives. AI-first with a keyword-based fallback — never throws.
 */
export async function classifyNutritionGoal(
  goalText: string | null,
  primaryGoal: string
): Promise<GoalClassification> {
  const text = (goalText ?? "").trim();

  try {
    if (!text) throw new Error("No free-text goal provided — skip straight to fallback");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: GOAL_CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Free-text goal: "${text}"\nStated primary goal: ${primaryGoal}` }],
    });

    const textBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
    );
    const raw = textBlock?.text ?? "";
    if (!raw) throw new Error("Claude returned no usable text block for goal classification");

    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as GoalClassification;

    if (
      !["deficit", "surplus", "maintenance"].includes(parsed.calorieDirection) ||
      !["conservative", "moderate", "aggressive"].includes(parsed.magnitude) ||
      typeof parsed.proteinEmphasis !== "boolean"
    ) {
      throw new Error("Claude returned malformed goal classification");
    }

    return parsed;
  } catch (err) {
    logger.error({ err, goalText, primaryGoal }, "AI goal classification failed, using keyword-based fallback");
    return classifyGoalWithKeywords(text, primaryGoal);
  }
}

/** Deterministic keyword-based classification — the safety net if the AI call fails or no free text was given. */
function classifyGoalWithKeywords(text: string, primaryGoal: string): GoalClassification {
  const lower = text.toLowerCase();

  const lossSignals = /lose|cut|cutting|lean out|shed|drop weight|fat loss|slim/;
  const gainSignals = /build muscle|gain muscle|bulk|get bigger|mass|pack on/;
  const maintainSignals = /maintain|stay the same|more energy|feel better|eat better/;
  const muscleProtectSignals = /keep.*muscle|preserve.*muscle|maintain.*muscle|tone|don't lose muscle|retain muscle|build muscle|gain muscle/;
  const aggressiveSignals = /fast|quickly|aggressive|asap|rapid/;
  const conservativeSignals = /slow|gradual|sustainable|steady|slowly/;

  let calorieDirection: GoalClassification["calorieDirection"];
  let proteinEmphasis = muscleProtectSignals.test(lower);

  if (lossSignals.test(lower) && gainSignals.test(lower)) {
    // Recomposition intent stated directly — deficit with high protein.
    calorieDirection = "deficit";
    proteinEmphasis = true;
  } else if (lossSignals.test(lower)) {
    calorieDirection = "deficit";
  } else if (gainSignals.test(lower)) {
    calorieDirection = "surplus";
    proteinEmphasis = true;
  } else if (maintainSignals.test(lower)) {
    calorieDirection = "maintenance";
  } else {
    // No usable signal in the free text — fall back to the stated primary goal.
    switch (primaryGoal) {
      case "lose-fat":
        calorieDirection = "deficit";
        break;
      case "build-muscle":
        calorieDirection = "surplus";
        proteinEmphasis = true;
        break;
      case "recomposition":
        calorieDirection = "deficit";
        proteinEmphasis = true;
        break;
      default:
        calorieDirection = "maintenance";
    }
  }

  const magnitude: GoalClassification["magnitude"] = aggressiveSignals.test(lower)
    ? "aggressive"
    : conservativeSignals.test(lower)
      ? "conservative"
      : "moderate";

  const rationale =
    calorieDirection === "deficit"
      ? proteinEmphasis
        ? "A calorie deficit with elevated protein to protect your muscle while you lose weight."
        : "A calorie deficit to drive weight loss."
      : calorieDirection === "surplus"
        ? "A calorie surplus with high protein to support muscle growth."
        : "Maintenance calories to support your current weight and performance.";

  return { calorieDirection, magnitude, proteinEmphasis, rationale };
}

/**
 * Mifflin-St Jeor BMR + activity multiplier + goal-classification-based
 * calorie adjustment. Never throws — missing inputs (height/weight/gender/
 * age) get reasonable defaults so a plan can always be delivered, with the
 * defaults used surfaced back to the caller for disclosure in coachNotes.
 */
export function calculateNutritionTargets(
  profile: {
    gender: string | null;
    heightInches: number | null;
    weightLbs: number | null;
    dateOfBirth: Date | null;
    activityLevel: string | null;
  },
  classification: GoalClassification
): MacroTargets {
  const usedDefaults: string[] = [];

  const gender = profile.gender === "female" ? "female" : profile.gender === "male" ? "male" : "male";
  if (!profile.gender) usedDefaults.push("gender");

  const heightInches = profile.heightInches ?? 68;
  if (!profile.heightInches) usedDefaults.push("height");

  const weightLbs = profile.weightLbs ?? 165;
  if (!profile.weightLbs) usedDefaults.push("weight");

  let age = 35;
  if (profile.dateOfBirth) {
    const ageDiff = Date.now() - new Date(profile.dateOfBirth).getTime();
    age = Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
  } else {
    usedDefaults.push("age");
  }

  const activityMultiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel ?? ""] ?? 1.55;
  if (!profile.activityLevel) usedDefaults.push("activity level");

  const heightCm = heightInches * 2.54;
  const weightKg = weightLbs * 0.453592;

  const bmr =
    gender === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const tdee = bmr * activityMultiplier;

  const adjustment = CALORIE_ADJUSTMENTS[classification.calorieDirection][classification.magnitude];
  let dailyCalories = tdee + adjustment;
  dailyCalories = Math.round(Math.max(dailyCalories, 1200) / 10) * 10; // floor to a safe minimum, round to 10s

  // Protein: ~1g per lb bodyweight baseline (evidence-based for active adults).
  // Bumped higher specifically when cutting while trying to protect muscle —
  // that's the scenario where protein does the most work.
  const proteinPerLb = classification.calorieDirection === "deficit" && classification.proteinEmphasis ? 1.15 : 1.0;
  const proteinG = Math.round(weightLbs * proteinPerLb);
  // Fat: ~28% of total calories.
  const fatG = Math.round((dailyCalories * 0.28) / 9);
  // Carbs: remainder.
  const carbsG = Math.max(Math.round((dailyCalories - proteinG * 4 - fatG * 9) / 4), 0);

  return { dailyCalories, proteinG, carbsG, fatG, usedDefaults };
}

interface ChecklistItem {
  time: string; // e.g. "6:30 AM" or "Post-Workout" — anchored to their actual wake/bed time when known
  type: "breakfast" | "lunch" | "dinner" | "snack";
  label: string; // e.g. "Breakfast"
  food: string; // ONE concrete meal — no alternatives, nothing to decide
}

interface MealPlanContent {
  eatingRhythm: string; // one short sentence — not a paragraph
  checklist: ChecklistItem[];
  supplements: string[]; // short tags only, e.g. "Whey Protein" — no explanatory sentences
  coachNotes: string; // one sentence
}

const NUTRITION_SYSTEM_PROMPT = `You are a precision nutrition coach building a daily checklist for a paying client of Vintus Performance, a premium performance-coaching service. Voice: calm, disciplined, confident — never hype-y, never uses exclamation points, never says "crushing it" or similar.

This client is a busy, high-performing professional. They do not want to read — they want to glance at a checklist, know exactly what to eat and when, and move on. Every field must be as short as physically possible while staying specific and correct. No explanatory prose, no alternatives to choose between — one concrete meal per slot, not a menu of options.

Rules:
- NEVER suggest a food the client has listed as an allergy — treat this as a hard safety constraint, not a preference.
- Respect their stated dietary approach (vegan, keto, vegetarian, paleo, high-protein, IIFYM, or no restriction) strictly.
- Keep meals within their stated cooking skill and food budget — beginner/budget-conscious means simple, accessible staples, not technique or specialty ingredients.
- Favor foods they said they love; avoid foods they said they hate, where compatible with the above.
- Build exactly as many checklist entries as their stated meals/day (default 4 if unspecified: 3 meals + 1 snack). Anchor times to their actual wake/bed time if given — first meal shortly after waking, last meal at least 2 hours before bed, evenly spaced between.
- Supplements are short tags only (e.g. "Whey Protein", "Creatine Monohydrate", "Multivitamin") — no dosing, no sentences, never anything that could conflict with a stated medication or condition. Omit entirely if none are appropriate.
- If the client has a chronic condition or takes medication, keep coachNotes generic and tell them to loop in their physician rather than giving anything that could interact with it.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "eatingRhythm": "one short sentence, e.g. '4 meals, ~4 hours apart, protein with each one.'",
  "checklist": [
    { "time": "6:30 AM", "type": "breakfast", "label": "Breakfast", "food": "3 eggs, oatmeal, banana" }
  ],
  "supplements": ["short tag", "short tag"],
  "coachNotes": "one sentence explaining the calorie/macro strategy in plain language"
}`;

async function generateMealPlanWithClaude(
  profile: {
    firstName: string;
    primaryGoal: string;
    nutritionGoals: string | null;
    dietaryApproach: string | null;
    foodAllergies: string | null;
    foodsLoved: string | null;
    foodsHated: string | null;
    cookingSkill: string | null;
    mealPrepTime: string | null;
    foodBudget: string | null;
    mealsPerDay: number | null;
    wakeTime: string | null;
    bedTime: string | null;
    chronicConditions: string | null;
    medications: string | null;
  },
  targets: MacroTargets,
  classification: GoalClassification
): Promise<MealPlanContent> {
  const lines: string[] = [
    `Name: ${profile.firstName}`,
    `Primary Goal: ${profile.primaryGoal}`,
    `Nutrition Goal (their own words): ${profile.nutritionGoals || "not specified"}`,
    `Calorie Strategy: ${classification.calorieDirection} (${classification.magnitude}) — ${classification.rationale}`,
    `Daily Targets: ${targets.dailyCalories} calories, ${targets.proteinG}g protein, ${targets.carbsG}g carbs, ${targets.fatG}g fat`,
  ];
  if (profile.dietaryApproach) lines.push(`Dietary Approach: ${profile.dietaryApproach}`);
  if (profile.foodAllergies) lines.push(`Food Allergies (HARD CONSTRAINT — never include): ${profile.foodAllergies}`);
  if (profile.foodsLoved) lines.push(`Foods They Love: ${profile.foodsLoved}`);
  if (profile.foodsHated) lines.push(`Foods They Hate: ${profile.foodsHated}`);
  if (profile.cookingSkill) lines.push(`Cooking Skill: ${profile.cookingSkill}`);
  if (profile.mealPrepTime) lines.push(`Meal Prep Time Available: ${profile.mealPrepTime}`);
  if (profile.foodBudget) lines.push(`Food Budget: ${profile.foodBudget}`);
  lines.push(`Meals/Day: ${profile.mealsPerDay || 4}`);
  if (profile.wakeTime) lines.push(`Wake Time: ${profile.wakeTime}`);
  if (profile.bedTime) lines.push(`Bed Time: ${profile.bedTime}`);
  if (profile.chronicConditions) lines.push(`Chronic Conditions: ${profile.chronicConditions}`);
  if (profile.medications) lines.push(`Medications: ${profile.medications}`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system: NUTRITION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude nutrition response hit max_tokens and was truncated");
  }

  const textBlock = response.content.find(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  );
  const text = textBlock?.text ?? "";
  if (!text) {
    throw new Error(`Claude returned no usable text block for nutrition plan. stop_reason=${response.stop_reason}`);
  }

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: MealPlanContent;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(
      `Claude returned unparseable nutrition JSON (${(parseErr as Error).message}). First 300 chars: ${cleaned.slice(0, 300)}`
    );
  }

  if (!parsed.checklist || !parsed.checklist.length || !parsed.eatingRhythm) {
    throw new Error("Claude nutrition response missing required fields");
  }

  return parsed;
}

/** Simple, safe, dietary-approach-aware fallback if the AI call fails. */
function generateRuleBasedMealPlan(dietaryApproach: string | null, mealsPerDay: number | null): MealPlanContent {
  const isVegan = dietaryApproach === "vegan";
  const isVegetarian = dietaryApproach === "vegetarian" || isVegan;
  const isKeto = dietaryApproach === "keto";

  const protein = isVegan ? "Tofu, tempeh, or a plant protein shake" : isVegetarian ? "Eggs, Greek yogurt, or a protein shake" : "Chicken, lean beef, or fish";
  const carb = isKeto ? "leafy greens and non-starchy vegetables" : "rice, oats, or potatoes";

  const fullChecklist: ChecklistItem[] = [
    { time: "7:00 AM", type: "breakfast", label: "Breakfast", food: `${protein} with ${isKeto ? "avocado and eggs" : "oats"}` },
    { time: "12:30 PM", type: "lunch", label: "Lunch", food: `${protein} with ${carb} and a vegetable side` },
    { time: "4:00 PM", type: "snack", label: "Snack", food: "Greek yogurt or a handful of nuts" },
    { time: "7:00 PM", type: "dinner", label: "Dinner", food: `${protein} with ${carb} and roasted vegetables` },
  ];
  const checklist = fullChecklist.slice(0, Math.max(mealsPerDay ?? 4, 2));

  return {
    eatingRhythm: `${checklist.length} meals, spaced ~4 hours apart, protein with each one.`,
    checklist,
    supplements: ["Protein Powder", "Multivitamin"],
    coachNotes:
      "This is a starter template built to your calculated targets while your full plan is refined. Message your coach with more detail on your preferences for a more tailored version.",
  };
}

export async function generateNutritionPlan(
  profileId: string
): Promise<{ planId: string; source: "ai" | "fallback"; fallbackReason?: string }> {
  const profile = await prisma.athleteProfile.findUnique({ where: { id: profileId } });
  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const nutritionSubscription = await prisma.nutritionSubscription.findUnique({
    where: { userId: profile.userId },
    select: { planTier: true },
  });
  const tier = nutritionSubscription?.planTier ?? "NUTRITION_4WEEK";
  const durationDays = TIER_DURATION_DAYS[tier] ?? 28;

  const classification = await classifyNutritionGoal(profile.nutritionGoals, profile.primaryGoal);
  const targets = calculateNutritionTargets(profile, classification);

  let content: MealPlanContent;
  let source: "ai" | "fallback" = "ai";
  let fallbackReason: string | undefined;

  try {
    content = await generateMealPlanWithClaude(profile, targets, classification);
  } catch (aiErr) {
    logger.error({ err: aiErr, profileId }, "Claude nutrition plan generation failed, using rule-based fallback");
    source = "fallback";
    fallbackReason = (aiErr as Error).message;
    content = generateRuleBasedMealPlan(profile.dietaryApproach, profile.mealsPerDay);
  }

  if (targets.usedDefaults.length > 0) {
    content.coachNotes += ` (Note: ${targets.usedDefaults.join(", ")} defaulted for the calorie calculation — update your profile for more precise targets.)`;
  }

  await prisma.nutritionPlan.updateMany({
    where: { athleteProfileId: profileId, isActive: true },
    data: { isActive: false },
  });

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationDays);

  const plan = await prisma.nutritionPlan.create({
    data: {
      athleteProfileId: profileId,
      tier,
      startDate,
      endDate,
      dailyCalories: targets.dailyCalories,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      mealTiming: content.eatingRhythm,
      sampleMeals: content.checklist as unknown as Prisma.InputJsonValue,
      supplementNotes: content.supplements.join(", "),
      coachNotes: content.coachNotes,
      source,
    },
  });

  logger.info({ profileId, planId: plan.id, source }, "Nutrition plan generated");

  return { planId: plan.id, source, fallbackReason };
}

export async function getActiveNutritionPlan(userId: string) {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  return prisma.nutritionPlan.findFirst({
    where: { athleteProfileId: profile.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });
}
