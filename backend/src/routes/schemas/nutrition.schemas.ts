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

export const shuffleMealSchema = z.object({
  index: z.number().int().min(0).max(20),
});

export const mealIdeasSearchSchema = z.object({
  index: z.number().int().min(0).max(20),
  calorieCap: z.number().int().min(100).max(2000),
  proteinG: z.number().min(0).max(300).optional(),
  carbsG: z.number().min(0).max(500).optional(),
  fatG: z.number().min(0).max(200).optional(),
});

export const applyMealIdeaSchema = z.object({
  index: z.number().int().min(0).max(20),
  item: z.object({
    title: z.string().min(1).max(200),
    foods: z.array(z.string().min(1).max(200)).min(1).max(20),
    instructions: z.string().max(1000).optional(),
    calories: z.number().min(0).max(5000),
    proteinG: z.number().min(0).max(500),
    carbsG: z.number().min(0).max(800),
    fatG: z.number().min(0).max(300),
  }),
});

export const groceryListQuerySchema = z.object({
  people: z.coerce.number().int().min(1).max(12).default(1),
});

export const addFavoriteSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  title: z.string().min(1).max(200),
  foods: z.array(z.string().min(1).max(200)).min(1).max(20),
  instructions: z.string().max(1000).optional(),
  calories: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(800),
  fatG: z.number().min(0).max(300),
});

export const removeFavoriteSchema = z.object({
  title: z.string().min(1).max(200),
});

export type NutritionGoalUpdate = z.infer<typeof nutritionGoalUpdateSchema>;
export type MacroCalculatorInput = z.infer<typeof macroCalculatorInputSchema>;
export type ShuffleMealInput = z.infer<typeof shuffleMealSchema>;
export type MealIdeasSearchInput = z.infer<typeof mealIdeasSearchSchema>;
export type ApplyMealIdeaInput = z.infer<typeof applyMealIdeaSchema>;
export type GroceryListQuery = z.infer<typeof groceryListQuerySchema>;
export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>;
export type RemoveFavoriteInput = z.infer<typeof removeFavoriteSchema>;
