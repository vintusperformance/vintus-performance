import { z } from "zod";

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const verifySessionSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
});

export const setPasswordSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  sessionId: z.string().min(1, "sessionId is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
    .regex(/[0-9]/, "Password must contain at least 1 number"),
});

const injuryEntrySchema = z.object({
  area: z.string().min(1).max(100),
  severity: z.enum(["mild", "moderate", "severe"]),
  notes: z.string().max(500).optional(),
});

export const routineQuestionnaireSchema = z.object({
  // Existing fields
  wakeTime: z.string().regex(hhmmRegex, "wakeTime must be HH:MM format"),
  bedTime: z.string().regex(hhmmRegex, "bedTime must be HH:MM format"),
  mealsPerDay: z.number().int().min(1).max(8),
  hydrationLevel: z.enum(["low", "moderate", "good"]),
  supplementsUsed: z.string().optional(),
  recoveryPractices: z.array(
    z.enum(["foam-roll", "stretch", "sauna", "cold-plunge", "massage", "none"])
  ),
  typicalEnergyLevel: z.number().int().min(1).max(10),
  typicalSorenessLevel: z.number().int().min(1).max(10),
  typicalMoodLevel: z.number().int().min(1).max(10),
  typicalSleepQuality: z.number().int().min(1).max(10),

  // Physical Profile
  gender: z.enum(["male", "female"]).optional(),
  heightInches: z.number().int().min(36).max(96).optional(),
  weightLbs: z.number().min(50).max(600).optional(),
  bodyFatEstimate: z.enum(["under-15", "15-20", "20-25", "25-30", "30-plus", "unsure"]).optional(),

  // Training Background
  yearsTraining: z.number().int().min(0).max(50).optional(),
  currentProgram: z.string().max(500).optional(),
  benchPressMax: z.enum(["never-tested", "under-135", "135-185", "185-225", "225-275", "275-315", "315-plus"]).optional(),
  squatMax: z.enum(["never-tested", "under-135", "135-225", "225-315", "315-405", "405-495", "495-plus"]).optional(),
  deadliftMax: z.enum(["never-tested", "under-135", "135-225", "225-315", "315-405", "405-495", "495-plus"]).optional(),
  cardioBase: z.enum(["none", "light-walks", "can-run-1mi", "can-run-3mi", "can-run-5mi-plus"]).optional(),
  exercisesLoved: z.string().max(500).optional(),
  exercisesHated: z.string().max(500).optional(),

  // Lifestyle
  workType: z.enum(["desk", "on-feet", "physical-labor", "mixed", "remote", "student"]).optional(),
  sessionLength: z.number().int().min(15).max(120).optional(),
  dietaryApproach: z.enum(["no-restriction", "high-protein", "keto", "vegan", "vegetarian", "paleo", "iifym"]).optional(),
  alcoholFrequency: z.enum(["none", "rare", "occasional", "regular", "frequent", "prefer-not-to-say"]).optional(),
  caffeineDaily: z.enum(["none", "low", "moderate", "high"]).optional(),

  // Nutrition Profile
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very-active"]).optional(),
  nutritionGoals: z.string().max(1000).optional(),
  foodAllergies: z.string().max(500).optional(),
  foodsLoved: z.string().max(500).optional(),
  foodsHated: z.string().max(500).optional(),
  cookingSkill: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  mealPrepTime: z.enum(["minimal", "moderate", "extensive"]).optional(),
  foodBudget: z.enum(["budget-conscious", "moderate", "no-constraint"]).optional(),

  // Injuries & Health
  specificInjuries: z.array(injuryEntrySchema).max(10).optional(),
  chronicConditions: z.string().max(1000).optional(),
  medications: z.string().max(1000).optional(),
  previousPT: z.boolean().optional(),

  // Goal Specifics
  targetWeight: z.number().min(50).max(600).optional(),
  goalTimeline: z.enum(["30-days", "60-days", "90-days", "4-months", "6-months", "12-months", "event-date"]).optional(),
  eventDate: z.string().optional(), // ISO date string
  eventDescription: z.string().max(500).optional(),
});

// Lightweight intake for a client who already has an account and profile
// (e.g. a training-plan client adding a Nutrition Plan) — just the fields
// that actually drive calorie/macro calculation and meal planning, no
// password step and no re-asking training-specific questions.
export const nutritionIntakeSchema = z.object({
  gender: z.enum(["male", "female"]).optional(),
  heightInches: z.number().int().min(36).max(96).optional(),
  weightLbs: z.number().min(50).max(600).optional(),
  mealsPerDay: z.number().int().min(1).max(8).optional(),
  dietaryApproach: z.enum(["no-restriction", "high-protein", "keto", "vegan", "vegetarian", "paleo", "iifym"]).optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very-active"]).optional(),
  nutritionGoals: z.string().max(1000).optional(),
  foodAllergies: z.string().max(500).optional(),
  foodsLoved: z.string().max(500).optional(),
  foodsHated: z.string().max(500).optional(),
  cookingSkill: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  mealPrepTime: z.enum(["minimal", "moderate", "extensive"]).optional(),
  foodBudget: z.enum(["budget-conscious", "moderate", "no-constraint"]).optional(),
  chronicConditions: z.string().max(1000).optional(),
  medications: z.string().max(1000).optional(),
});

export const deviceSelectionSchema = z.object({
  provider: z.enum(["STRAVA", "GARMIN", "APPLE_HEALTH", "WHOOP", "OURA", "FITBIT"]),
});

export const waiverAcceptSchema = z.object({
  accepted: z.literal(true, { errorMap: () => ({ message: "Waiver must be accepted to continue" }) }),
});

export type VerifySession = z.infer<typeof verifySessionSchema>;
export type SetPassword = z.infer<typeof setPasswordSchema>;
export type RoutineQuestionnaire = z.infer<typeof routineQuestionnaireSchema>;
export type NutritionIntake = z.infer<typeof nutritionIntakeSchema>;
export type DeviceSelection = z.infer<typeof deviceSelectionSchema>;
export type WaiverAccept = z.infer<typeof waiverAcceptSchema>;
