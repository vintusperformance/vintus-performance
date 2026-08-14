import { z } from "zod";

export const nutritionGoalUpdateSchema = z.object({
  goalDescription: z.string().min(1).max(500),
  targetWeight: z.number().positive().max(1000).optional(),
});

export const macroCalculatorInputSchema = z.object({
  weightLbs: z.number().positive().max(1000),
  heightInches: z.number().int().positive().max(120),
  age: z.number().int().min(13).max(100),
  gender: z.enum(["male", "female"]),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very-active"]),
  goalDirection: z.enum(["lose", "maintain", "gain"]),
});

export type NutritionGoalUpdate = z.infer<typeof nutritionGoalUpdateSchema>;
export type MacroCalculatorInput = z.infer<typeof macroCalculatorInputSchema>;
