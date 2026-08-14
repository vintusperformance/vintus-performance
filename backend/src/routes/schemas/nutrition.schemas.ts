import { z } from "zod";

export const nutritionGoalUpdateSchema = z.object({
  goalDescription: z.string().min(1).max(500),
  targetWeight: z.number().positive().max(1000).optional(),
});

export type NutritionGoalUpdate = z.infer<typeof nutritionGoalUpdateSchema>;
