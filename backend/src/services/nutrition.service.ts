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

// ============================================================
// Macro Calculator add-on ($23, Training Plan clients) — targets only, no
// meal plan/checklist. Deterministic and AI-free by design: a lightweight
// tool a client can recalculate instantly shouldn't depend on an AI call
// the way the full Nutrition Plan tiers' goal classification does. Reuses
// calculateNutritionTargets (same BMR/TDEE math the real Nutrition Plans
// use) by building a GoalClassification directly from simple form inputs
// instead of classifying free text.
export interface MacroCalculatorInput {
  weightLbs: number;
  heightInches: number;
  age: number;
  gender: "male" | "female";
  activityLevel: string; // sedentary | light | moderate | active | very-active
  goalDirection: "lose" | "maintain" | "gain";
}

export function calculateMacroCalculatorTargets(
  input: MacroCalculatorInput
): { dailyCalories: number; proteinG: number; carbsG: number; fatG: number } {
  const directionMap: Record<MacroCalculatorInput["goalDirection"], GoalClassification["calorieDirection"]> = {
    lose: "deficit",
    maintain: "maintenance",
    gain: "surplus",
  };
  const calorieDirection = directionMap[input.goalDirection];

  const classification: GoalClassification = {
    calorieDirection,
    magnitude: "moderate",
    proteinEmphasis: calorieDirection === "deficit",
    rationale: `${input.goalDirection} weight at a moderate, sustainable pace`,
  };

  const approxDateOfBirth = new Date(Date.now() - input.age * 365.25 * 24 * 60 * 60 * 1000);

  const { dailyCalories, proteinG, carbsG, fatG } = calculateNutritionTargets(
    {
      gender: input.gender,
      heightInches: input.heightInches,
      weightLbs: input.weightLbs,
      dateOfBirth: approxDateOfBirth,
      activityLevel: input.activityLevel,
    },
    classification
  );

  return { dailyCalories, proteinG, carbsG, fatG };
}

interface ChecklistItem {
  time: string; // e.g. "6:30 AM" or "Post-Workout" — anchored to their actual wake/bed time when known
  type: "breakfast" | "lunch" | "dinner" | "snack";
  label: string; // e.g. "Breakfast"
  title: string; // short appealing dish name, e.g. "Protein Oatmeal Bowl"
  foods: string[]; // each with an exact quantity baked in, e.g. "180g Chicken Breast", "2 Whole Eggs"
  instructions: string; // brief prep steps — 1-3 short sentences, not a full recipe
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MealPlanContent {
  eatingRhythm: string; // one short sentence — not a paragraph
  checklist: ChecklistItem[];
  supplements: string[]; // short tags only, e.g. "Whey Protein" — no explanatory sentences
  coachNotes: string; // one sentence
}

interface MealTarget {
  time: string;
  type: ChecklistItem["type"];
  label: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// Slot composition by meal count — meals come first, snacks fill in as count
// grows. offsetPct places each slot across the client's actual eating window.
const SLOT_PATTERNS: Record<number, Array<{ type: ChecklistItem["type"]; label: string; offsetPct: number }>> = {
  2: [
    { type: "breakfast", label: "Breakfast", offsetPct: 0 },
    { type: "dinner", label: "Dinner", offsetPct: 1 },
  ],
  3: [
    { type: "breakfast", label: "Breakfast", offsetPct: 0 },
    { type: "lunch", label: "Lunch", offsetPct: 0.5 },
    { type: "dinner", label: "Dinner", offsetPct: 1 },
  ],
  4: [
    { type: "breakfast", label: "Breakfast", offsetPct: 0 },
    { type: "lunch", label: "Lunch", offsetPct: 0.4 },
    { type: "snack", label: "Snack", offsetPct: 0.65 },
    { type: "dinner", label: "Dinner", offsetPct: 1 },
  ],
  5: [
    { type: "breakfast", label: "Breakfast", offsetPct: 0 },
    { type: "snack", label: "Snack", offsetPct: 0.25 },
    { type: "lunch", label: "Lunch", offsetPct: 0.5 },
    { type: "snack", label: "Snack", offsetPct: 0.75 },
    { type: "dinner", label: "Dinner", offsetPct: 1 },
  ],
  6: [
    { type: "breakfast", label: "Breakfast", offsetPct: 0 },
    { type: "snack", label: "Snack", offsetPct: 0.2 },
    { type: "lunch", label: "Lunch", offsetPct: 0.4 },
    { type: "snack", label: "Snack", offsetPct: 0.6 },
    { type: "dinner", label: "Dinner", offsetPct: 0.85 },
    { type: "snack", label: "Snack", offsetPct: 1 },
  ],
};

function parseTimeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function formatMinutesAsTime(mins: number): string {
  const normalized = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Splits daily calorie/macro targets across meal slots so both the AI and
 * the rule-based fallback have a concrete per-meal number to hit instead of
 * freely improvising 4 meals that happen to sum correctly. Protein is spread
 * evenly across every slot (real-meals and snacks alike) per the standard
 * "protein at every meal" principle; calories/carbs/fat are weighted toward
 * full meals over snacks.
 */
function distributeMealTargets(
  targets: MacroTargets,
  mealsPerDay: number | null,
  wakeTime: string | null,
  bedTime: string | null
): MealTarget[] {
  const count = Math.min(Math.max(mealsPerDay ?? 4, 2), 6);
  const pattern = SLOT_PATTERNS[count] ?? SLOT_PATTERNS[4];

  const wakeMin = parseTimeToMinutes(wakeTime);
  const bedMin = parseTimeToMinutes(bedTime);
  // Default eating window: 7:00 AM to 9:00 PM. If we have real wake/bed
  // times, start 30 min after waking and end 2 hours before bed.
  const windowStart = wakeMin != null ? wakeMin + 30 : 7 * 60;
  let windowEnd = bedMin != null ? bedMin - 120 : 21 * 60;
  if (bedMin != null && bedMin < wakeMin!) windowEnd += 24 * 60; // bedtime past midnight
  if (windowEnd <= windowStart) windowEnd = windowStart + 12 * 60; // sane fallback spread

  const weights = pattern.map((slot) => (slot.type === "snack" ? 0.5 : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const proteinPerSlot = targets.proteinG / pattern.length;

  return pattern.map((slot, i) => {
    const share = weights[i] / weightSum;
    const timeMin = Math.round(windowStart + (windowEnd - windowStart) * slot.offsetPct);
    return {
      time: formatMinutesAsTime(timeMin),
      type: slot.type,
      label: slot.label,
      calories: Math.round((targets.dailyCalories * share) / 10) * 10,
      proteinG: Math.round(proteinPerSlot),
      carbsG: Math.round(targets.carbsG * share),
      fatG: Math.round(targets.fatG * share),
    };
  });
}

const NUTRITION_SYSTEM_PROMPT = `You are a precision nutrition coach building a daily checklist for a paying client of Vintus Performance, a premium performance-coaching service. Voice: calm, disciplined, confident — never hype-y, never uses exclamation points, never says "crushing it" or similar.

This client is a busy, high-performing professional. They do not want to read, and they do not want to guess portion sizes — they want to glance at a checklist, know exactly what to eat, exactly how much, and when, and move on. No explanatory prose, no alternatives to choose between — one concrete set of foods per slot, not a menu of options.

You will be given a per-meal calorie/protein/carb/fat budget for each slot. Choose real foods and exact quantities — grams for anything weighed (e.g. "180g Chicken Breast", "150g White Rice"), simple counts for discrete items (e.g. "2 Whole Eggs", "1 Banana", "1 Slice Whole Wheat Toast") — that land close to that slot's budget. Then report the ACTUAL calories/protein/carbs/fat for the exact quantities you chose (real nutrition values, calculated correctly for those amounts) — these do not need to match the budget exactly, they need to be true for the foods and quantities you listed. Give each meal a short, appealing dish title (e.g. "Protein Oatmeal Bowl", not just "Breakfast"), and 1-3 short, concrete prep steps — enough to actually make it, nothing padded.

Rules:
- NEVER suggest a food the client has listed as an allergy — treat this as a hard safety constraint, not a preference.
- Respect their stated dietary approach (vegan, keto, vegetarian, paleo, high-protein, IIFYM, or no restriction) strictly.
- Keep meals within their stated cooking skill and food budget — beginner/budget-conscious means simple, accessible staples, not technique or specialty ingredients. Instructions must match their cooking skill: beginner gets dead-simple steps (no technique assumed), advanced can include real technique.
- Favor foods they said they love; avoid foods they said they hate, where compatible with the above.
- Every meal must fit its slot, not just its macros. Breakfast means foods people actually eat in the morning — eggs, oats, yogurt, toast, a smoothie — never a dinner-style entree like grilled chicken or steak, even if the protein target is high. Lunch and dinner are full plated meals: a protein, a carb, a vegetable, each with its own quantity. Snacks are 1-2 simple, no-prep items. Do not reuse a lunch/dinner protein choice (e.g. chicken, beef, fish) as the breakfast protein.
- Supplements are short tags only (e.g. "Whey Protein", "Creatine Monohydrate", "Multivitamin") — no dosing, no sentences, never anything that could conflict with a stated medication or condition. Omit entirely if none are appropriate.
- If the client has a chronic condition or takes medication, keep coachNotes generic and tell them to loop in their physician rather than giving anything that could interact with it.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "eatingRhythm": "one short sentence, e.g. '4 meals, ~4 hours apart, protein with each one.'",
  "checklist": [
    { "time": "6:30 AM", "type": "breakfast", "label": "Breakfast", "title": "Protein Oatmeal Bowl", "foods": ["3 Whole Eggs", "60g Dry Oats", "1 Banana"], "instructions": "Scramble the eggs. Cook oats with water or milk. Slice banana over the oats and plate together.", "calories": 520, "proteinG": 28, "carbsG": 58, "fatG": 19 }
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
  classification: GoalClassification,
  mealTargets: MealTarget[]
): Promise<MealPlanContent> {
  const lines: string[] = [
    `Name: ${profile.firstName}`,
    `Primary Goal: ${profile.primaryGoal}`,
    `Nutrition Goal (their own words): ${profile.nutritionGoals || "not specified"}`,
    `Calorie Strategy: ${classification.calorieDirection} (${classification.magnitude}) — ${classification.rationale}`,
    `Daily Targets: ${targets.dailyCalories} calories, ${targets.proteinG}g protein, ${targets.carbsG}g carbs, ${targets.fatG}g fat`,
    `Per-meal budgets (hit these as closely as real food quantities allow):`,
    ...mealTargets.map(
      (m) => `  - ${m.label} (${m.time}): ~${m.calories} cal, ~${m.proteinG}g protein, ~${m.carbsG}g carbs, ~${m.fatG}g fat`
    ),
  ];
  if (profile.dietaryApproach) lines.push(`Dietary Approach: ${profile.dietaryApproach}`);
  if (profile.foodAllergies) lines.push(`Food Allergies (HARD CONSTRAINT — never include): ${profile.foodAllergies}`);
  if (profile.foodsLoved) lines.push(`Foods They Love: ${profile.foodsLoved}`);
  if (profile.foodsHated) lines.push(`Foods They Hate: ${profile.foodsHated}`);
  if (profile.cookingSkill) lines.push(`Cooking Skill: ${profile.cookingSkill}`);
  if (profile.mealPrepTime) lines.push(`Meal Prep Time Available: ${profile.mealPrepTime}`);
  if (profile.foodBudget) lines.push(`Food Budget: ${profile.foodBudget}`);
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
  const malformedItem = parsed.checklist.find(
    (item) =>
      !Array.isArray(item.foods) ||
      !item.foods.length ||
      !item.title ||
      typeof item.calories !== "number" ||
      typeof item.proteinG !== "number" ||
      typeof item.carbsG !== "number" ||
      typeof item.fatG !== "number"
  );
  if (malformedItem) {
    throw new Error(`Claude nutrition response has a checklist item missing foods/title/macros: ${JSON.stringify(malformedItem)}`);
  }
  // Instructions are useful but not safety- or math-critical — patch a
  // missing one rather than discarding an otherwise-good AI response.
  parsed.checklist.forEach((item) => {
    if (!item.instructions) item.instructions = `Prepare and plate: ${item.foods.join(", ")}.`;
  });

  return parsed;
}

// Standard per-100g nutrition reference (per-unit for eggs/banana/shake) used
// only by the rule-based fallback, so its quantities and macro totals are
// real arithmetic on real foods — not placeholder numbers.
const FOOD_REF: Record<string, { cal: number; protein: number; carb: number; fat: number }> = {
  chickenBreast: { cal: 165, protein: 31, carb: 0, fat: 3.6 },
  whiteFish: { cal: 105, protein: 23, carb: 0, fat: 1 },
  tofu: { cal: 144, protein: 15.5, carb: 3.5, fat: 8.7 },
  greekYogurt: { cal: 73, protein: 10, carb: 3.9, fat: 1.9 },
  oatsDry: { cal: 389, protein: 16.9, carb: 66, fat: 6.9 },
  rice: { cal: 130, protein: 2.7, carb: 28, fat: 0.3 },
  nonStarchyVeg: { cal: 25, protein: 2, carb: 5, fat: 0.2 },
  nuts: { cal: 579, protein: 21, carb: 22, fat: 50 },
  avocado: { cal: 160, protein: 2, carb: 9, fat: 15 },
  egg: { cal: 72, protein: 6.3, carb: 0.4, fat: 4.8 }, // per whole large egg
  banana: { cal: 105, protein: 1.3, carb: 27, fat: 0.4 }, // per medium banana
  proteinPowder: { cal: 400, protein: 80, carb: 8, fat: 5 }, // per 100g whey/plant isolate
  oliveOil: { cal: 884, protein: 0, carb: 0, fat: 100 }, // per 100g — used in small (5-25g) amounts to close the fat gap
  // Added for meal-shuffle/meal-idea variety — real per-100g values, same as the rest of FOOD_REF.
  salmon: { cal: 208, protein: 20, carb: 0, fat: 13 },
  turkeyBreast: { cal: 135, protein: 30, carb: 0, fat: 1 },
  chickpeas: { cal: 164, protein: 8.9, carb: 27, fat: 2.6 },
  quinoa: { cal: 120, protein: 4.4, carb: 21, fat: 1.9 },
  sweetPotato: { cal: 90, protein: 2, carb: 21, fat: 0.1 },
  cottageCheese: { cal: 98, protein: 11, carb: 3.4, fat: 4.3 },
  mixedBerries: { cal: 57, protein: 0.7, carb: 14, fat: 0.3 },
  hummus: { cal: 166, protein: 7.9, carb: 14.3, fat: 9.6 },
};

/** Grams of a food needed to hit a target amount of one nutrient, rounded to a real-world 5g portion. */
function gramsFor(targetAmount: number, per100gValue: number, min = 30, max = 350): number {
  if (per100gValue <= 0) return min;
  const grams = (targetAmount / per100gValue) * 100;
  return Math.min(Math.max(Math.round(grams / 5) * 5, min), max);
}

function scaledMacros(ref: { cal: number; protein: number; carb: number; fat: number }, grams: number) {
  const factor = grams / 100;
  return { cal: ref.cal * factor, protein: ref.protein * factor, carb: ref.carb * factor, fat: ref.fat * factor };
}

/**
 * Fixed title per composition branch, plus prep steps built from whichever
 * foods actually ended up in the list — the protein-powder and olive-oil
 * top-ups are conditional, so instructions can't unconditionally reference
 * them without risking a step for an ingredient that isn't actually there.
 */
function titleAndInstructionsFor(
  type: ChecklistItem["type"],
  isVegan: boolean,
  isVegetarian: boolean,
  isKeto: boolean,
  foods: string[]
): { title: string; instructions: string } {
  const has = (needle: string) => foods.some((f) => f.toLowerCase().includes(needle));
  const steps: string[] = [];

  if (type === "breakfast") {
    if (isVegan) {
      steps.push("Crumble and pan-fry the tofu with a pinch of turmeric and black salt for an egg-like scramble.");
      if (has("dry oats")) steps.push("Cook the oats with water.");
    } else if (isKeto) {
      steps.push("Scramble or fry the eggs in butter or oil.");
      if (has("avocado")) steps.push("Slice the avocado and plate alongside.");
    } else {
      steps.push("Scramble the eggs.");
      if (has("dry oats")) steps.push("Cook the oats with water or milk.");
    }
    if (has("banana")) steps.push("Slice the banana over the top.");
    if (has("protein powder")) steps.push("Stir the protein powder into the oats or a splash of water.");
    const title = isVegan ? "Tofu Scramble & Oats" : isKeto ? "Eggs & Avocado" : "Protein Oatmeal Bowl";
    return { title, instructions: steps.join(" ") };
  }

  if (type === "lunch" || type === "dinner") {
    const protein = isVegan || isVegetarian ? "tofu" : type === "lunch" ? "chicken breast" : "white fish";
    steps.push(`Season and cook the ${protein} (grill, bake, or pan-sear).`);
    if (has("white rice")) steps.push("Cook the rice per package instructions.");
    steps.push("Steam or roast the vegetables.");
    if (has("olive oil")) steps.push("Plate together and finish with the olive oil.");
    else steps.push("Plate together.");
    if (has("protein powder")) steps.push("Mix the protein powder into water on the side if you're short on the day's protein.");
    const title = isVegan || isVegetarian ? "Tofu, Rice & Veg Bowl" : type === "lunch" ? "Grilled Chicken & Rice Bowl" : "Baked White Fish & Rice";
    return { title, instructions: steps.join(" ") };
  }

  // snack
  if (has("greek yogurt")) {
    steps.push("Stir the protein powder into the Greek yogurt, if using.");
    steps.push("Top with almonds.");
    return { title: "Greek Yogurt & Almonds", instructions: steps.join(" ") };
  }
  steps.push("Blend the protein powder with water or a milk alternative.");
  steps.push("Pair with the almonds.");
  return { title: "Protein Shake & Almonds", instructions: steps.join(" ") };
}

/**
 * Simple, safe, dietary-approach-aware fallback if the AI call fails.
 * Builds each meal from real per-100g nutrition data sized to that meal's
 * target, so the displayed quantities and macro totals are genuinely
 * consistent with each other — not just a labeled placeholder.
 */
function generateRuleBasedMealPlan(dietaryApproach: string | null, mealTargets: MealTarget[]): MealPlanContent {
  const isVegan = dietaryApproach === "vegan";
  const isVegetarian = dietaryApproach === "vegetarian" || isVegan;
  const isKeto = dietaryApproach === "keto";

  const checklist: ChecklistItem[] = mealTargets.map((mt) => {
    const foods: string[] = [];
    let cal = 0, protein = 0, carb = 0, fat = 0;

    const addGrams = (label: string, ref: typeof FOOD_REF[string], grams: number) => {
      const m = scaledMacros(ref, grams);
      cal += m.cal; protein += m.protein; carb += m.carb; fat += m.fat;
      foods.push(`${grams}g ${label}`);
    };
    const addCount = (label: string, ref: typeof FOOD_REF[string], count: number) => {
      cal += ref.cal * count; protein += ref.protein * count; carb += ref.carb * count; fat += ref.fat * count;
      foods.push(`${count} ${label}${count === 1 ? "" : "s"}`);
    };

    // Protein powder tops up whatever whole-food protein sources don't cover
    // — it's what keeps a high protein target from turning into an absurd
    // whole-food quantity (5+ eggs, a second chicken breast).
    const topUpProtein = (label: string) => {
      const remaining = mt.proteinG - protein;
      if (remaining > 8) {
        addGrams(label, FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
      }
    };
    // A small amount of olive oil closes whatever fat gap lean proteins,
    // carbs, and vegetables leave open — without it, calories and fat both
    // undershoot the target regardless of how well protein/carbs are sized.
    const topUpFat = () => {
      const remaining = mt.fatG - fat;
      if (remaining > 3) {
        addGrams("Olive Oil", FOOD_REF.oliveOil, gramsFor(remaining, FOOD_REF.oliveOil.fat, 5, 30));
      }
    };

    // Order matters: every food that meaningfully contributes protein (the
    // primary source AND the carb source — oats/rice are not protein-free)
    // must be added BEFORE topUpProtein runs, or the top-up double-counts
    // and overshoots the target.
    if (mt.type === "breakfast") {
      if (isVegan) {
        addGrams("Tofu Scramble", FOOD_REF.tofu, gramsFor(Math.min(mt.proteinG, 25), FOOD_REF.tofu.protein, 80, 200));
        addGrams("Dry Oats", FOOD_REF.oatsDry, gramsFor(Math.max(mt.carbsG - carb, 20), FOOD_REF.oatsDry.carb, 30, 120));
        if (!isKeto) addCount("Banana", FOOD_REF.banana, 1);
        topUpProtein("Plant Protein Powder");
      } else {
        addCount("Whole Egg", FOOD_REF.egg, 3);
        if (!isKeto) {
          addGrams("Dry Oats", FOOD_REF.oatsDry, gramsFor(Math.max(mt.carbsG - carb, 20), FOOD_REF.oatsDry.carb, 30, 100));
        } else {
          addGrams("Avocado", FOOD_REF.avocado, 75);
        }
        if (!isKeto) addCount("Banana", FOOD_REF.banana, 1);
        topUpProtein("Protein Powder");
      }
      topUpFat();
    } else if (mt.type === "lunch" || mt.type === "dinner") {
      const proteinRef = isVegan || isVegetarian ? FOOD_REF.tofu : mt.type === "lunch" ? FOOD_REF.chickenBreast : FOOD_REF.whiteFish;
      const proteinLabel = isVegan || isVegetarian ? "Tofu" : mt.type === "lunch" ? "Chicken Breast" : "White Fish";
      addGrams(proteinLabel, proteinRef, gramsFor(Math.min(mt.proteinG, 55), proteinRef.protein, 120, 300));
      if (!isKeto) {
        addGrams("White Rice", FOOD_REF.rice, gramsFor(Math.max(mt.carbsG - carb, 30), FOOD_REF.rice.carb, 50, 300));
      }
      addGrams("Mixed Vegetables", FOOD_REF.nonStarchyVeg, 150);
      topUpProtein(isVegan ? "Plant Protein Powder" : "Protein Powder");
      topUpFat();
    } else {
      // snack
      if (isVegan) {
        addGrams("Almonds", FOOD_REF.nuts, 20);
        addGrams("Plant Protein Powder", FOOD_REF.proteinPowder, gramsFor(Math.max(mt.proteinG - protein, 10), FOOD_REF.proteinPowder.protein, 20, 60));
      } else {
        addGrams("Greek Yogurt", FOOD_REF.greekYogurt, gramsFor(Math.min(mt.proteinG, 25), FOOD_REF.greekYogurt.protein, 100, 250));
        addGrams("Almonds", FOOD_REF.nuts, 15);
        topUpProtein("Protein Powder");
      }
    }

    const { title, instructions } = titleAndInstructionsFor(mt.type, isVegan, isVegetarian, isKeto, foods);

    return {
      time: mt.time,
      type: mt.type,
      label: mt.label,
      title,
      foods,
      instructions,
      calories: Math.round(cal),
      proteinG: Math.round(protein),
      carbsG: Math.round(carb),
      fatG: Math.round(fat),
    };
  });

  return {
    eatingRhythm: `${checklist.length} meals, spaced across the day, protein with each one.`,
    checklist,
    supplements: ["Protein Powder", "Multivitamin"],
    coachNotes:
      "This is a starter template built to your calculated targets while your full plan is refined. Message your coach with more detail on your preferences for a more tailored version.",
  };
}

// ============================================================
// Meal alternatives — shuffle (strict: same calories/macros as the slot
// it's replacing) and Meal Ideas search (cap: calories at or under a client-
// chosen ceiling, macros optional guidance). Both funnel through the same
// AI-first / rule-based-fallback generator so they inherit the same safety
// constraints (allergies, dietary approach) as the original plan.
// ============================================================

const MEAL_ALTERNATIVE_SYSTEM_PROMPT = `You are a precision nutrition coach for Vintus Performance, a premium performance-coaching service. Voice: calm, disciplined, confident — never hype-y, never uses exclamation points.

Generate meal alternative(s) for ONE slot of a client's day. The client wants variety without breaking their plan — every alternative must respect their dietary approach, allergies, and cooking constraints exactly as strictly as their existing plan does.

For each alternative, choose real foods and exact quantities (grams for anything weighed, simple counts for discrete items), then report the ACTUAL calories/protein/carbs/fat for those exact quantities — real nutrition values, calculated correctly for those amounts, not the target rounded off. Give each a short, appealing dish title, different from any title in the avoid-list, and 1-3 short concrete prep steps.

Rules:
- NEVER suggest a food the client has listed as an allergy — hard safety constraint, not a preference.
- Respect their stated dietary approach (vegan, keto, vegetarian, paleo, high-protein, IIFYM, or no restriction) strictly.
- Keep meals within their stated cooking skill and food budget.
- If a calorie cap is given, it is a HARD LIMIT — no alternative may exceed it. Any protein/carb/fat numbers given alongside a cap are optional guidance, not requirements.
- If no cap is given, hit the given calorie/protein/carb/fat targets as closely as real food quantities allow.
- Every alternative must be genuinely different from the others and from anything in the avoid-list — a different protein source or dish, not a minor variation on the same one.
- The meal must fit its slot type: breakfast means foods people actually eat in the morning, never a dinner-style entree. Lunch/dinner are full plated meals (protein, carb, vegetable). Snacks are 1-2 simple, no-prep items.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "alternatives": [
    { "title": "Herb-Crusted Salmon & Quinoa", "foods": ["180g Salmon", "150g Quinoa", "150g Mixed Vegetables"], "instructions": "Season and bake the salmon. Cook quinoa per package instructions. Steam the vegetables and plate together.", "calories": 540, "proteinG": 38, "carbsG": 45, "fatG": 20 }
  ]
}`;

async function generateMealAlternativesWithClaude(
  profile: {
    firstName: string;
    dietaryApproach: string | null;
    foodAllergies: string | null;
    foodsLoved: string | null;
    foodsHated: string | null;
    cookingSkill: string | null;
    mealPrepTime: string | null;
    foodBudget: string | null;
    chronicConditions: string | null;
    medications: string | null;
  },
  target: MealTarget,
  avoidTitles: string[],
  count: number,
  calorieCap?: number
): Promise<Array<Pick<ChecklistItem, "title" | "foods" | "instructions" | "calories" | "proteinG" | "carbsG" | "fatG">>> {
  const lines: string[] = [
    `Name: ${profile.firstName}`,
    `Meal Slot: ${target.label} (${target.time}), type: ${target.type}`,
    calorieCap != null
      ? `Calorie Cap (HARD LIMIT — every alternative must be at or under this): ${calorieCap} calories`
      : `Target: ~${target.calories} calories, ~${target.proteinG}g protein, ~${target.carbsG}g carbs, ~${target.fatG}g fat — hit these as closely as real food quantities allow`,
  ];
  if (calorieCap != null) {
    if (target.proteinG) lines.push(`Protein preference (optional guidance, not required): ~${target.proteinG}g`);
    if (target.carbsG) lines.push(`Carb preference (optional guidance, not required): ~${target.carbsG}g`);
    if (target.fatG) lines.push(`Fat preference (optional guidance, not required): ~${target.fatG}g`);
  }
  lines.push(`Generate ${count} distinct alternative${count === 1 ? "" : "s"}, each genuinely different from one another.`);
  if (avoidTitles.length) lines.push(`Avoid these existing meal titles (and any minor variation of them) — must be different dishes: ${avoidTitles.join(", ")}`);
  if (profile.dietaryApproach) lines.push(`Dietary Approach: ${profile.dietaryApproach}`);
  if (profile.foodAllergies) lines.push(`Food Allergies (HARD CONSTRAINT — never include): ${profile.foodAllergies}`);
  if (profile.foodsLoved) lines.push(`Foods They Love: ${profile.foodsLoved}`);
  if (profile.foodsHated) lines.push(`Foods They Hate: ${profile.foodsHated}`);
  if (profile.cookingSkill) lines.push(`Cooking Skill: ${profile.cookingSkill}`);
  if (profile.mealPrepTime) lines.push(`Meal Prep Time Available: ${profile.mealPrepTime}`);
  if (profile.foodBudget) lines.push(`Food Budget: ${profile.foodBudget}`);
  if (profile.chronicConditions) lines.push(`Chronic Conditions: ${profile.chronicConditions}`);
  if (profile.medications) lines.push(`Medications: ${profile.medications}`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    system: MEAL_ALTERNATIVE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude meal-alternative response hit max_tokens and was truncated");
  }

  const textBlock = response.content.find(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  );
  const text = textBlock?.text ?? "";
  if (!text) {
    throw new Error(`Claude returned no usable text block for meal alternatives. stop_reason=${response.stop_reason}`);
  }

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: { alternatives: Array<{ title: string; foods: string[]; instructions?: string; calories: number; proteinG: number; carbsG: number; fatG: number }> };
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(
      `Claude returned unparseable meal-alternative JSON (${(parseErr as Error).message}). First 300 chars: ${cleaned.slice(0, 300)}`
    );
  }

  if (!parsed.alternatives || !parsed.alternatives.length) {
    throw new Error("Claude meal-alternative response missing alternatives");
  }
  const malformedItem = parsed.alternatives.find(
    (item) =>
      !Array.isArray(item.foods) ||
      !item.foods.length ||
      !item.title ||
      typeof item.calories !== "number" ||
      typeof item.proteinG !== "number" ||
      typeof item.carbsG !== "number" ||
      typeof item.fatG !== "number"
  );
  if (malformedItem) {
    throw new Error(`Claude meal-alternative response has an item missing foods/title/macros: ${JSON.stringify(malformedItem)}`);
  }
  if (calorieCap != null) {
    const overCap = parsed.alternatives.find((item) => item.calories > calorieCap * 1.05);
    if (overCap) {
      throw new Error(`Claude meal-alternative response exceeded the calorie cap: ${JSON.stringify(overCap)}`);
    }
  }
  const withInstructions = parsed.alternatives.map((item) => ({
    ...item,
    instructions: item.instructions || `Prepare and plate: ${item.foods.join(", ")}.`,
  }));

  return withInstructions.slice(0, count);
}

/**
 * Rule-based fallback for meal alternatives. Unlike generateRuleBasedMealPlan
 * (one fixed recipe per type/diet — fine for a single full-day starter
 * template), shuffling and searching need genuine variety across repeated
 * calls, so each slot type/diet combination has 2+ recipe branches, and
 * results are drawn from whichever branches aren't already used in the
 * client's current plan (avoidTitles) before falling back to reuse.
 */
function buildRuleBasedAlternatives(
  dietaryApproach: string | null,
  mt: { type: ChecklistItem["type"]; time: string; label: string; calories: number; proteinG: number; carbsG: number; fatG: number },
  avoidTitles: string[],
  count: number,
  calorieCap?: number
): ChecklistItem[] {
  const isVegan = dietaryApproach === "vegan";
  const isVegetarian = dietaryApproach === "vegetarian" || isVegan;
  const isKeto = dietaryApproach === "keto";
  const targetProtein = mt.proteinG;

  type Ref = { cal: number; protein: number; carb: number; fat: number };
  type Built = { title: string; foods: string[]; instructions: string; cal: number; protein: number; carb: number; fat: number };

  function acc() {
    const foods: string[] = [];
    let cal = 0, protein = 0, carb = 0, fat = 0;
    return {
      foods,
      addGrams(label: string, ref: Ref, grams: number) {
        const m = scaledMacros(ref, grams);
        cal += m.cal; protein += m.protein; carb += m.carb; fat += m.fat;
        foods.push(`${grams}g ${label}`);
      },
      addCount(label: string, ref: Ref, n: number) {
        cal += ref.cal * n; protein += ref.protein * n; carb += ref.carb * n; fat += ref.fat * n;
        foods.push(`${n} ${label}${n === 1 ? "" : "s"}`);
      },
      totals() {
        return { cal, protein, carb, fat };
      },
    };
  }

  const recipes: Array<() => Built> = [];

  if (mt.type === "breakfast") {
    if (isVegan) {
      recipes.push(() => {
        const a = acc();
        a.addGrams("Tofu Scramble", FOOD_REF.tofu, gramsFor(Math.min(targetProtein, 25), FOOD_REF.tofu.protein, 80, 200));
        a.addGrams("Dry Oats", FOOD_REF.oatsDry, gramsFor(Math.max(mt.carbsG - a.totals().carb, 20), FOOD_REF.oatsDry.carb, 30, 120));
        if (!isKeto) a.addCount("Banana", FOOD_REF.banana, 1);
        const remaining = targetProtein - a.totals().protein;
        if (remaining > 8) a.addGrams("Plant Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
        const t = a.totals();
        return { title: "Tofu Scramble & Oats", foods: a.foods, instructions: "Crumble and pan-fry the tofu with turmeric and black salt. Cook oats with water. Slice banana over the top.", ...t };
      });
      recipes.push(() => {
        const a = acc();
        a.addGrams("Chickpea Scramble", FOOD_REF.chickpeas, gramsFor(Math.min(targetProtein, 20), FOOD_REF.chickpeas.protein, 100, 250));
        a.addGrams("Mixed Berries", FOOD_REF.mixedBerries, 100);
        const remaining = targetProtein - a.totals().protein;
        if (remaining > 8) a.addGrams("Plant Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
        const t = a.totals();
        return { title: "Chickpea Scramble & Berries", foods: a.foods, instructions: "Mash and pan-fry the chickpeas with turmeric and paprika. Serve with mixed berries on the side.", ...t };
      });
    } else if (isKeto) {
      recipes.push(() => {
        const a = acc();
        a.addCount("Whole Egg", FOOD_REF.egg, 3);
        a.addGrams("Avocado", FOOD_REF.avocado, 75);
        const remaining = targetProtein - a.totals().protein;
        if (remaining > 8) a.addGrams("Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
        const t = a.totals();
        return { title: "Eggs & Avocado", foods: a.foods, instructions: "Scramble or fry the eggs in butter. Slice the avocado and plate alongside.", ...t };
      });
      recipes.push(() => {
        const a = acc();
        a.addGrams("Cottage Cheese", FOOD_REF.cottageCheese, gramsFor(Math.min(targetProtein, 25), FOOD_REF.cottageCheese.protein, 100, 250));
        a.addGrams("Avocado", FOOD_REF.avocado, 50);
        const remaining = targetProtein - a.totals().protein;
        if (remaining > 8) a.addGrams("Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
        const t = a.totals();
        return { title: "Cottage Cheese & Avocado Bowl", foods: a.foods, instructions: "Spoon the cottage cheese into a bowl and top with sliced avocado.", ...t };
      });
    } else {
      recipes.push(() => {
        const a = acc();
        a.addCount("Whole Egg", FOOD_REF.egg, 3);
        a.addGrams("Dry Oats", FOOD_REF.oatsDry, gramsFor(Math.max(mt.carbsG - a.totals().carb, 20), FOOD_REF.oatsDry.carb, 30, 100));
        a.addCount("Banana", FOOD_REF.banana, 1);
        const remaining = targetProtein - a.totals().protein;
        if (remaining > 8) a.addGrams("Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
        const t = a.totals();
        return { title: "Protein Oatmeal Bowl", foods: a.foods, instructions: "Scramble the eggs. Cook oats with water or milk. Slice banana over the top.", ...t };
      });
      recipes.push(() => {
        const a = acc();
        a.addGrams("Greek Yogurt", FOOD_REF.greekYogurt, gramsFor(Math.min(targetProtein, 30), FOOD_REF.greekYogurt.protein, 150, 300));
        a.addGrams("Mixed Berries", FOOD_REF.mixedBerries, 100);
        a.addGrams("Dry Oats", FOOD_REF.oatsDry, gramsFor(Math.max(mt.carbsG - a.totals().carb, 15), FOOD_REF.oatsDry.carb, 20, 80));
        const remaining = targetProtein - a.totals().protein;
        if (remaining > 8) a.addGrams("Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
        const t = a.totals();
        return { title: "Greek Yogurt Berry Bowl", foods: a.foods, instructions: "Layer the Greek yogurt with berries and a sprinkle of dry oats.", ...t };
      });
    }
  } else if (mt.type === "lunch" || mt.type === "dinner") {
    const proteinOptions: Array<{ label: string; ref: Ref }> = isVegan || isVegetarian
      ? [{ label: "Tofu", ref: FOOD_REF.tofu }, { label: "Chickpeas", ref: FOOD_REF.chickpeas }]
      : [
          { label: mt.type === "lunch" ? "Chicken Breast" : "White Fish", ref: mt.type === "lunch" ? FOOD_REF.chickenBreast : FOOD_REF.whiteFish },
          { label: "Salmon", ref: FOOD_REF.salmon },
          { label: "Turkey Breast", ref: FOOD_REF.turkeyBreast },
        ];
    const carbOptions: Array<{ label: string; ref: Ref } | null> = isKeto
      ? [null]
      : [{ label: "White Rice", ref: FOOD_REF.rice }, { label: "Quinoa", ref: FOOD_REF.quinoa }, { label: "Sweet Potato", ref: FOOD_REF.sweetPotato }];

    proteinOptions.forEach((p) => {
      carbOptions.forEach((c) => {
        recipes.push(() => {
          const a = acc();
          a.addGrams(p.label, p.ref, gramsFor(Math.min(targetProtein, 55), p.ref.protein, 120, 300));
          if (c) a.addGrams(c.label, c.ref, gramsFor(Math.max(mt.carbsG - a.totals().carb, 30), c.ref.carb, 50, 300));
          a.addGrams("Mixed Vegetables", FOOD_REF.nonStarchyVeg, 150);
          const remaining = targetProtein - a.totals().protein;
          if (remaining > 8) a.addGrams(isVegan ? "Plant Protein Powder" : "Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 10, 60));
          const fatRemaining = mt.fatG - a.totals().fat;
          if (fatRemaining > 3) a.addGrams("Olive Oil", FOOD_REF.oliveOil, gramsFor(fatRemaining, FOOD_REF.oliveOil.fat, 5, 30));
          const t = a.totals();
          const title = c ? `${p.label} & ${c.label} Bowl` : `${p.label} & Roasted Veg`;
          const instructions = `Season and cook the ${p.label.toLowerCase()} (grill, bake, or pan-sear).${c ? ` Cook the ${c.label.toLowerCase()} per package instructions.` : ""} Steam or roast the vegetables. Plate together.`;
          return { title, foods: a.foods, instructions, ...t };
        });
      });
    });
  } else {
    // snack
    recipes.push(() => {
      const a = acc();
      if (isVegan) {
        a.addGrams("Almonds", FOOD_REF.nuts, 20);
        const remaining = Math.max(targetProtein - a.totals().protein, 10);
        a.addGrams("Plant Protein Powder", FOOD_REF.proteinPowder, gramsFor(remaining, FOOD_REF.proteinPowder.protein, 20, 60));
      } else {
        a.addGrams("Greek Yogurt", FOOD_REF.greekYogurt, gramsFor(Math.min(targetProtein, 25), FOOD_REF.greekYogurt.protein, 100, 250));
        a.addGrams("Almonds", FOOD_REF.nuts, 15);
      }
      const t = a.totals();
      return {
        title: isVegan ? "Almonds & Protein Shake" : "Greek Yogurt & Almonds",
        foods: a.foods,
        instructions: isVegan ? "Blend the protein powder with water or a milk alternative. Pair with the almonds." : "Top the Greek yogurt with almonds.",
        ...t,
      };
    });
    recipes.push(() => {
      const a = acc();
      if (isVegan) {
        a.addGrams("Hummus", FOOD_REF.hummus, 80);
        a.addGrams("Mixed Vegetables", FOOD_REF.nonStarchyVeg, 100);
      } else {
        a.addGrams("Cottage Cheese", FOOD_REF.cottageCheese, gramsFor(Math.min(targetProtein, 20), FOOD_REF.cottageCheese.protein, 100, 250));
        a.addGrams("Mixed Berries", FOOD_REF.mixedBerries, 80);
      }
      const t = a.totals();
      return {
        title: isVegan ? "Hummus & Veggies" : "Cottage Cheese & Berries",
        foods: a.foods,
        instructions: isVegan ? "Dip the vegetables in hummus." : "Top the cottage cheese with berries.",
        ...t,
      };
    });
  }

  const usedTitles = new Set(avoidTitles.map((t) => t.toLowerCase()));
  const built = recipes.map((r) => r());
  const fresh = built.filter((b) => !usedTitles.has(b.title.toLowerCase()));
  const pool = fresh.length > 0 ? fresh : built;

  const results: ChecklistItem[] = [];
  for (let i = 0; i < count; i++) {
    const b = pool[i % pool.length];
    let cal = b.cal, protein = b.protein, carb = b.carb, fat = b.fat;
    // Rule-based sizing targets protein/carbs, which can occasionally push
    // calories a bit over a search cap — clamp proportionally rather than
    // rebuilding the food list, since this is the safety-net path only.
    if (calorieCap != null && cal > calorieCap) {
      const scale = calorieCap / cal;
      cal *= scale; protein *= scale; carb *= scale; fat *= scale;
    }
    results.push({
      time: mt.time,
      type: mt.type,
      label: mt.label,
      title: b.title,
      foods: b.foods,
      instructions: b.instructions,
      calories: Math.round(cal),
      proteinG: Math.round(protein),
      carbsG: Math.round(carb),
      fatG: Math.round(fat),
    });
    usedTitles.add(b.title.toLowerCase());
  }
  return results;
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
  const mealTargets = distributeMealTargets(targets, profile.mealsPerDay, profile.wakeTime, profile.bedTime);

  let content: MealPlanContent;
  let source: "ai" | "fallback" = "ai";
  let fallbackReason: string | undefined;

  try {
    content = await generateMealPlanWithClaude(profile, targets, classification, mealTargets);
  } catch (aiErr) {
    logger.error({ err: aiErr, profileId }, "Claude nutrition plan generation failed, using rule-based fallback");
    source = "fallback";
    fallbackReason = (aiErr as Error).message;
    content = generateRuleBasedMealPlan(profile.dietaryApproach, mealTargets);
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

function notFound(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

async function requireProfileAndActivePlan(userId: string) {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) throw notFound("Athlete profile not found");

  const plan = await prisma.nutritionPlan.findFirst({
    where: { athleteProfileId: profile.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!plan) throw notFound("No active nutrition plan found for this account");

  const checklist = (plan.sampleMeals as unknown as ChecklistItem[]) || [];
  return { profile, plan, checklist };
}

// ============================================================
// Meal shuffle — "not craving this? shuffle for a new meal idea." Replaces
// one checklist slot with a genuinely different meal that still hits that
// slot's own calorie/macro numbers, so the day's totals don't drift.
// ============================================================

export async function shuffleMeal(
  userId: string,
  index: number
): Promise<{ item: ChecklistItem; source: "ai" | "fallback" }> {
  const { profile, plan, checklist } = await requireProfileAndActivePlan(userId);
  const slot = checklist[index];
  if (!slot) throw notFound("Meal slot not found");

  const avoidTitles = checklist.map((c) => c.title).filter(Boolean);
  const target: MealTarget = {
    time: slot.time, type: slot.type, label: slot.label,
    calories: slot.calories, proteinG: slot.proteinG, carbsG: slot.carbsG, fatG: slot.fatG,
  };

  let item: ChecklistItem;
  let source: "ai" | "fallback" = "ai";
  try {
    const [alt] = await generateMealAlternativesWithClaude(profile, target, avoidTitles, 1);
    item = { time: slot.time, type: slot.type, label: slot.label, ...alt };
  } catch (err) {
    logger.error({ err, userId, index }, "Claude meal shuffle failed, using rule-based fallback");
    source = "fallback";
    [item] = buildRuleBasedAlternatives(profile.dietaryApproach, target, avoidTitles, 1);
  }

  const updatedChecklist = [...checklist];
  updatedChecklist[index] = item;
  await prisma.nutritionPlan.update({
    where: { id: plan.id },
    data: { sampleMeals: updatedChecklist as unknown as Prisma.InputJsonValue },
  });

  return { item, source };
}

// ============================================================
// Meal Ideas search — capped-calorie alternatives the client browses and
// picks from, rather than an automatic swap. Macros are optional guidance;
// the calorie cap is the hard "stay on plan" constraint.
// ============================================================

export async function searchMealIdeas(
  userId: string,
  params: { index: number; calorieCap: number; proteinG?: number; carbsG?: number; fatG?: number }
): Promise<{ candidates: ChecklistItem[]; source: "ai" | "fallback" }> {
  const { profile, checklist } = await requireProfileAndActivePlan(userId);
  const slot = checklist[params.index];
  if (!slot) throw notFound("Meal slot not found");

  const avoidTitles = checklist.map((c) => c.title).filter(Boolean);

  // Explicit protein/carb/fat guidance if given; otherwise a standard
  // 30/40/30 calorie split off the cap so the rule-based fallback has
  // something concrete to size portions against.
  const proteinG = params.proteinG ?? Math.round((params.calorieCap * 0.3) / 4);
  const carbsG = params.carbsG ?? Math.round((params.calorieCap * 0.4) / 4);
  const fatG = params.fatG ?? Math.round((params.calorieCap * 0.3) / 9);

  const target: MealTarget = {
    time: slot.time, type: slot.type, label: slot.label,
    calories: Math.min(slot.calories, params.calorieCap), proteinG, carbsG, fatG,
  };

  let candidates: ChecklistItem[];
  let source: "ai" | "fallback" = "ai";
  try {
    const alts = await generateMealAlternativesWithClaude(profile, target, avoidTitles, 3, params.calorieCap);
    candidates = alts.map((alt) => ({ time: slot.time, type: slot.type, label: slot.label, ...alt }));
  } catch (err) {
    logger.error({ err, userId, params }, "Claude meal-idea search failed, using rule-based fallback");
    source = "fallback";
    candidates = buildRuleBasedAlternatives(profile.dietaryApproach, target, avoidTitles, 3, params.calorieCap);
  }

  return { candidates, source };
}

/** Persists a client-chosen Meal Ideas candidate into their plan's checklist. */
export async function applyMealIdea(
  userId: string,
  params: {
    index: number;
    item: { title: string; foods: string[]; instructions?: string; calories: number; proteinG: number; carbsG: number; fatG: number };
  }
): Promise<{ item: ChecklistItem }> {
  const { plan, checklist } = await requireProfileAndActivePlan(userId);
  const slot = checklist[params.index];
  if (!slot) throw notFound("Meal slot not found");

  const { item: candidate } = params;
  if (
    !candidate ||
    !Array.isArray(candidate.foods) ||
    !candidate.foods.length ||
    !candidate.title ||
    typeof candidate.calories !== "number" ||
    typeof candidate.proteinG !== "number" ||
    typeof candidate.carbsG !== "number" ||
    typeof candidate.fatG !== "number"
  ) {
    const err = new Error("Invalid meal idea — missing title, foods, or macros") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const item: ChecklistItem = {
    time: slot.time,
    type: slot.type,
    label: slot.label,
    title: candidate.title,
    foods: candidate.foods,
    instructions: candidate.instructions || `Prepare and plate: ${candidate.foods.join(", ")}.`,
    calories: candidate.calories,
    proteinG: candidate.proteinG,
    carbsG: candidate.carbsG,
    fatG: candidate.fatG,
  };

  const updatedChecklist = [...checklist];
  updatedChecklist[params.index] = item;
  await prisma.nutritionPlan.update({
    where: { id: plan.id },
    data: { sampleMeals: updatedChecklist as unknown as Prisma.InputJsonValue },
  });

  return { item };
}

// ============================================================
// Weekly grocery list — the plan's one sample day (sampleMeals repeats
// identically every day of the term) scaled to 7 days and household size.
// Pure read/compute, nothing persisted.
// ============================================================

/**
 * Parses a checklist food entry ("180g Chicken Breast", "2 Whole Eggs") into
 * a quantity/unit/name. addGrams-produced entries are always "<n>g <label>";
 * addCount-produced entries are always "<n> <label>[s]" — the plural "s" is
 * mechanically appended by addCount, so it's safe to strip back off here.
 */
function parseFoodItem(entry: string): { quantity: number; unit: "g" | "count"; name: string } | null {
  const gramsMatch = entry.match(/^(\d+(?:\.\d+)?)\s*g\s+(.+)$/i);
  if (gramsMatch) {
    return { quantity: parseFloat(gramsMatch[1]), unit: "g", name: gramsMatch[2].trim() };
  }
  const countMatch = entry.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (countMatch) {
    const quantity = parseFloat(countMatch[1]);
    let name = countMatch[2].trim();
    if (quantity !== 1 && /s$/i.test(name)) name = name.replace(/s$/i, "");
    return { quantity, unit: "count", name };
  }
  return null;
}

export interface GroceryListItem {
  name: string;
  quantity: number;
  unit: "g" | "count";
  display: string;
}

export async function getGroceryList(
  userId: string,
  people: number
): Promise<{ items: GroceryListItem[]; people: number; days: number }> {
  const { checklist } = await requireProfileAndActivePlan(userId);

  const DAYS_PER_WEEK = 7;
  const safePeople = Math.min(Math.max(Math.round(people) || 1, 1), 12);

  const totals = new Map<string, { name: string; quantity: number; unit: "g" | "count" }>();

  checklist.forEach((item) => {
    (item.foods || []).forEach((entry) => {
      const parsed = parseFoodItem(entry);
      if (!parsed) return;
      const key = `${parsed.name.toLowerCase()}|${parsed.unit}`;
      const scaled = parsed.quantity * DAYS_PER_WEEK * safePeople;
      const existing = totals.get(key);
      if (existing) {
        existing.quantity += scaled;
      } else {
        totals.set(key, { name: parsed.name, quantity: scaled, unit: parsed.unit });
      }
    });
  });

  const items: GroceryListItem[] = Array.from(totals.values())
    .map((val) => {
      let display: string;
      if (val.unit === "g") {
        const kg = val.quantity / 1000;
        display = kg >= 1 ? `${kg.toFixed(1)} kg ${val.name}` : `${Math.round(val.quantity)}g ${val.name}`;
      } else {
        const rounded = Math.round(val.quantity);
        display = `${rounded} ${val.name}${rounded === 1 ? "" : "s"}`;
      }
      return { name: val.name, quantity: Math.round(val.quantity * 10) / 10, unit: val.unit, display };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { items, people: safePeople, days: DAYS_PER_WEEK };
}

// ============================================================
// Jerry's nutrition-adjustment tool (chat.service.ts)
// ============================================================

export interface NutritionGoalUpdateParams {
  goalDescription: string;
  targetWeight?: number;
}

export interface NutritionGoalUpdateResult {
  ok: boolean;
  message: string; // fed back to Claude as the tool_result
  description?: string; // short client-facing change note, if successful
}

/**
 * Executes a client-requested nutrition goal change from the chat tool:
 * updates their stated goal (and target weight, if given), then regenerates
 * the full nutrition plan so calories/macros/meals actually reflect it —
 * a goal update that doesn't touch the plan would just be a note nobody
 * acts on.
 */
export async function executeNutritionGoalUpdate(
  userId: string,
  params: NutritionGoalUpdateParams
): Promise<NutritionGoalUpdateResult> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) return { ok: false, message: "No athlete profile found for this client." };

  const nutritionSub = await prisma.nutritionSubscription.findUnique({ where: { userId } });
  if (!nutritionSub || nutritionSub.status !== "ACTIVE") {
    return { ok: false, message: "This client doesn't have an active Nutrition Plan to adjust." };
  }

  if (!params.goalDescription || !params.goalDescription.trim()) {
    return { ok: false, message: "A goal description is required to update the nutrition plan." };
  }

  await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: {
      nutritionGoals: params.goalDescription.trim(),
      ...(params.targetWeight != null ? { targetWeight: params.targetWeight } : {}),
    },
  });

  try {
    const result = await generateNutritionPlan(profile.id);
    const usedFallback = result.source === "fallback";
    return {
      ok: true,
      description: "Nutrition plan updated",
      message: usedFallback
        ? "Goal updated and the plan was regenerated (a starter template was used — full AI plan will refine shortly)."
        : "Goal updated and the nutrition plan was regenerated with new calorie/macro targets.",
    };
  } catch (err) {
    logger.error({ err, userId }, "Nutrition plan regeneration failed after Jerry goal update");
    return {
      ok: false,
      message: "The goal was saved, but regenerating the plan failed. Tell the client their coach will follow up.",
    };
  }
}

// ============================================================
// Nutrition adherence tracking — checklist check-offs, streak, trend
// ============================================================

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isSameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Records which of today's checklist items the client has checked off — upserted, so re-toggling just overwrites today's record. */
export async function recordNutritionCheckIn(
  userId: string,
  completedIndices: number[],
  totalItems: number
): Promise<void> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) {
    const err = new Error("Athlete profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const date = todayUtc();

  await prisma.nutritionCheckIn.upsert({
    where: { athleteProfileId_date: { athleteProfileId: profile.id, date } },
    create: { athleteProfileId: profile.id, date, completedIndices, totalItems },
    update: { completedIndices, totalItems },
  });
}

/**
 * Streak (consecutive days, ending today or yesterday, with every checklist
 * item checked), this week's adherence %, a 14-day trend, and today's
 * already-checked items (to restore checkbox state on page load) — all from
 * real persisted NutritionCheckIn rows, not a client-side-only toggle.
 */
export async function getNutritionProgress(userId: string): Promise<{
  todayCompletedIndices: number[];
  streak: number;
  weekAdherencePct: number;
  last14Days: Array<{ date: string; pct: number | null }>;
}> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  if (!profile) return { todayCompletedIndices: [], streak: 0, weekAdherencePct: 0, last14Days: [] };

  const today = todayUtc();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const records = await prisma.nutritionCheckIn.findMany({
    where: { athleteProfileId: profile.id, date: { gte: fourteenDaysAgo, lte: today } },
  });

  const recordFor = (d: Date) => records.find((r) => isSameUtcDate(new Date(r.date), d));

  const todayRecord = recordFor(today);
  const todayCompletedIndices = todayRecord?.completedIndices ?? [];

  let streak = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const rec = recordFor(d);
    if (rec && rec.totalItems > 0 && rec.completedIndices.length === rec.totalItems) {
      streak++;
    } else {
      break;
    }
  }

  let weekCompleted = 0;
  let weekTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const rec = recordFor(d);
    if (rec) {
      weekCompleted += rec.completedIndices.length;
      weekTotal += rec.totalItems;
    }
  }
  const weekAdherencePct = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

  const last14Days: Array<{ date: string; pct: number | null }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const rec = recordFor(d);
    last14Days.push({
      date: d.toISOString().split("T")[0],
      pct: rec && rec.totalItems > 0 ? Math.round((rec.completedIndices.length / rec.totalItems) * 100) : null,
    });
  }

  return { todayCompletedIndices, streak, weekAdherencePct, last14Days };
}
