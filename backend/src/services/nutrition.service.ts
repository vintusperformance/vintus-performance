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

/**
 * Mifflin-St Jeor BMR + activity multiplier + goal-based calorie adjustment.
 * Never throws — missing inputs (height/weight/gender/age) get reasonable
 * defaults so a plan can always be delivered, with the defaults used
 * surfaced back to the caller for disclosure in coachNotes.
 */
export function calculateNutritionTargets(profile: {
  gender: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  dateOfBirth: Date | null;
  activityLevel: string | null;
  primaryGoal: string;
}): MacroTargets {
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

  let dailyCalories: number;
  switch (profile.primaryGoal) {
    case "lose-fat":
      dailyCalories = tdee - 500;
      break;
    case "build-muscle":
      dailyCalories = tdee + 300;
      break;
    case "recomposition":
      dailyCalories = tdee - 200;
      break;
    default: // endurance, well-rounded
      dailyCalories = tdee;
  }
  dailyCalories = Math.round(Math.max(dailyCalories, 1200) / 10) * 10; // floor to a safe minimum, round to 10s

  // Protein: ~1g per lb bodyweight (evidence-based target for active adults).
  const proteinG = Math.round(weightLbs);
  // Fat: ~28% of total calories.
  const fatG = Math.round((dailyCalories * 0.28) / 9);
  // Carbs: remainder.
  const carbsG = Math.max(Math.round((dailyCalories - proteinG * 4 - fatG * 9) / 4), 0);

  return { dailyCalories, proteinG, carbsG, fatG, usedDefaults };
}

interface MealPlanContent {
  mealTiming: string;
  sampleMeals: {
    breakfast: string[];
    lunch: string[];
    dinner: string[];
    snacks: string[];
  };
  supplementNotes: string;
  coachNotes: string;
}

const NUTRITION_SYSTEM_PROMPT = `You are a precision nutrition coach writing a meal plan for a paying client of Vintus Performance, a premium performance-coaching service. Voice: calm, disciplined, confident — never hype-y, never uses exclamation points, never says "crushing it" or similar.

Rules:
- NEVER suggest a food the client has listed as an allergy — treat this as a hard safety constraint, not a preference.
- Respect their stated dietary approach (vegan, keto, vegetarian, paleo, high-protein, IIFYM, or no restriction) strictly.
- Keep recipes within their stated cooking skill — beginner means simple, few-ingredient meals; advanced can include more technique.
- Respect their stated food budget — budget-conscious means accessible, inexpensive staples, not specialty/premium ingredients.
- Favor foods they said they love; avoid foods they said they hate, where compatible with the above.
- Supplement notes must stay general and safe (e.g. whey/plant protein, creatine monohydrate, a multivitamin, fish oil) — never dosing advice beyond standard label guidance, never anything that could conflict with a stated medication or medical condition, and always frame it as optional, not required.
- If the client has a chronic condition or takes medication, do not give any nutrition advice that could interact with it — stay generic and note in coachNotes that they should loop in their physician.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "mealTiming": "2-4 sentences on when/how to structure meals for this person given their schedule and goal",
  "sampleMeals": {
    "breakfast": ["short meal idea 1", "short meal idea 2"],
    "lunch": ["short meal idea 1", "short meal idea 2"],
    "dinner": ["short meal idea 1", "short meal idea 2"],
    "snacks": ["short snack idea 1", "short snack idea 2"]
  },
  "supplementNotes": "1-3 sentences, general and optional",
  "coachNotes": "1-2 sentences summarizing the approach and why, in Vintus's calm/disciplined voice"
}`;

async function generateMealPlanWithClaude(
  profile: {
    firstName: string;
    primaryGoal: string;
    dietaryApproach: string | null;
    foodAllergies: string | null;
    foodsLoved: string | null;
    foodsHated: string | null;
    cookingSkill: string | null;
    mealPrepTime: string | null;
    foodBudget: string | null;
    mealsPerDay: number | null;
    chronicConditions: string | null;
    medications: string | null;
  },
  targets: MacroTargets
): Promise<MealPlanContent> {
  const lines: string[] = [
    `Name: ${profile.firstName}`,
    `Primary Goal: ${profile.primaryGoal}`,
    `Daily Targets: ${targets.dailyCalories} calories, ${targets.proteinG}g protein, ${targets.carbsG}g carbs, ${targets.fatG}g fat`,
  ];
  if (profile.dietaryApproach) lines.push(`Dietary Approach: ${profile.dietaryApproach}`);
  if (profile.foodAllergies) lines.push(`Food Allergies (HARD CONSTRAINT — never include): ${profile.foodAllergies}`);
  if (profile.foodsLoved) lines.push(`Foods They Love: ${profile.foodsLoved}`);
  if (profile.foodsHated) lines.push(`Foods They Hate: ${profile.foodsHated}`);
  if (profile.cookingSkill) lines.push(`Cooking Skill: ${profile.cookingSkill}`);
  if (profile.mealPrepTime) lines.push(`Meal Prep Time Available: ${profile.mealPrepTime}`);
  if (profile.foodBudget) lines.push(`Food Budget: ${profile.foodBudget}`);
  if (profile.mealsPerDay) lines.push(`Preferred Meals/Day: ${profile.mealsPerDay}`);
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

  if (!parsed.sampleMeals || !parsed.mealTiming) {
    throw new Error("Claude nutrition response missing required fields");
  }

  return parsed;
}

/** Simple, safe, dietary-approach-aware fallback if the AI call fails. */
function generateRuleBasedMealPlan(dietaryApproach: string | null): MealPlanContent {
  const isVegan = dietaryApproach === "vegan";
  const isVegetarian = dietaryApproach === "vegetarian" || isVegan;
  const isKeto = dietaryApproach === "keto";

  const protein = isVegan ? "tofu, tempeh, or a plant protein shake" : isVegetarian ? "eggs, greek yogurt, or a protein shake" : "chicken, lean beef, or fish";
  const carb = isKeto ? "leafy greens and non-starchy vegetables" : "rice, oats, or potatoes";

  return {
    mealTiming:
      "Spread your intake across 3-4 meals, anchoring protein to each one. Eat within an hour of waking and keep your last meal at least two hours before bed.",
    sampleMeals: {
      breakfast: [`${protein} with ${isKeto ? "avocado and eggs" : "oats or toast"}`, "Greek yogurt with berries and a scoop of protein"],
      lunch: [`${protein} with ${carb} and a vegetable side`, "A large salad with protein and olive oil dressing"],
      dinner: [`${protein} with ${carb} and roasted vegetables`, "A protein-forward stir-fry with vegetables"],
      snacks: ["A handful of nuts", "Protein shake or cottage cheese"],
    },
    supplementNotes:
      "A basic multivitamin and a protein supplement can help you hit your targets consistently — neither is required, and check with your physician if you take other medications.",
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

  const subscription = await prisma.subscription.findUnique({
    where: { userId: profile.userId },
    select: { planTier: true },
  });
  const tier = subscription?.planTier ?? "NUTRITION_4WEEK";
  const durationDays = TIER_DURATION_DAYS[tier] ?? 28;

  const targets = calculateNutritionTargets(profile);

  let content: MealPlanContent;
  let source: "ai" | "fallback" = "ai";
  let fallbackReason: string | undefined;

  try {
    content = await generateMealPlanWithClaude(profile, targets);
  } catch (aiErr) {
    logger.error({ err: aiErr, profileId }, "Claude nutrition plan generation failed, using rule-based fallback");
    source = "fallback";
    fallbackReason = (aiErr as Error).message;
    content = generateRuleBasedMealPlan(profile.dietaryApproach);
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
      mealTiming: content.mealTiming,
      sampleMeals: content.sampleMeals,
      supplementNotes: content.supplementNotes,
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
