import { z } from "zod";

export const createSessionBookingSchema = z.object({
  sessionType: z.enum(["THIRTY_MIN", "SIXTY_MIN_1ON1", "SIXTY_MIN_1ON2", "SIXTY_MIN_GROUP"]),
  headcount: z.number().int().min(1).max(6),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Must be a valid email address"),
  phone: z.string().optional(),
  meetingPreference: z.string().min(1, "Meeting preference is required"),
  coachingContext: z.string().max(2000).optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  scheduledTime: z.string().min(1, "Scheduled time is required"),
  successUrl: z.string().url("successUrl must be a valid URL"),
  cancelUrl: z.string().url("cancelUrl must be a valid URL"),
});

export type CreateSessionBookingInput = z.infer<typeof createSessionBookingSchema>;
