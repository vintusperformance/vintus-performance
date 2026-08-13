import { z } from "zod";

export const completeSessionSchema = z.object({
  actualDuration: z.number().int().min(1).max(600),
  rpe: z.number().int().min(1).max(10),
  athleteNotes: z.string().optional(),
});

export const skipSessionSchema = z.object({
  reason: z.string().optional(),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const rescheduleSessionSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
});

export const swapExerciseSchema = z.object({
  exercise: z.string().min(1).max(120),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

export const rebuildPreferencesSchema = z
  .object({
    restDays: z.array(z.number().int().min(0).max(6)).max(6).optional(),
    swapDateA: isoDate.optional(),
    swapDateB: isoDate.optional(),
  })
  .refine((data) => data.restDays !== undefined || (data.swapDateA && data.swapDateB), {
    message: "Provide restDays and/or a pair of days to swap",
  })
  .refine((data) => (data.swapDateA && data.swapDateB) || (!data.swapDateA && !data.swapDateB), {
    message: "swapDateA and swapDateB must be provided together",
  });

export type CompleteSession = z.infer<typeof completeSessionSchema>;
export type SkipSession = z.infer<typeof skipSessionSchema>;
export type RescheduleSession = z.infer<typeof rescheduleSessionSchema>;
export type SwapExercise = z.infer<typeof swapExerciseSchema>;
export type RebuildPreferences = z.infer<typeof rebuildPreferencesSchema>;
