import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Application
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Auth
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith("sk_", "STRIPE_SECRET_KEY must start with sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with whsec_"),
  STRIPE_PRICE_PRIVATE_COACHING: z.string().startsWith("price_", "STRIPE_PRICE_PRIVATE_COACHING must be a Stripe Price ID"),
  STRIPE_PRICE_TRAINING_30DAY: z.string().startsWith("price_", "STRIPE_PRICE_TRAINING_30DAY must be a Stripe Price ID"),
  STRIPE_PRICE_TRAINING_60DAY: z.string().startsWith("price_", "STRIPE_PRICE_TRAINING_60DAY must be a Stripe Price ID"),
  STRIPE_PRICE_TRAINING_90DAY: z.string().startsWith("price_", "STRIPE_PRICE_TRAINING_90DAY must be a Stripe Price ID"),
  STRIPE_PRICE_NUTRITION_4WEEK: z.string().startsWith("price_", "STRIPE_PRICE_NUTRITION_4WEEK must be a Stripe Price ID"),
  STRIPE_PRICE_NUTRITION_8WEEK: z.string().startsWith("price_", "STRIPE_PRICE_NUTRITION_8WEEK must be a Stripe Price ID"),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC", "TWILIO_ACCOUNT_SID must start with AC"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  TWILIO_PHONE_NUMBER: z.string().min(1, "TWILIO_PHONE_NUMBER is required"),

  // Resend
  RESEND_API_KEY: z.string().startsWith("re_", "RESEND_API_KEY must start with re_"),
  RESEND_FROM_EMAIL: z.string().email("RESEND_FROM_EMAIL must be a valid email"),

  // Coach notifications (Private Coaching monthly renewal reminders, etc.)
  COACH_EMAIL: z.string().email("COACH_EMAIL must be a valid email").default("anthony@vintusperformance.org"),
  // Optional — shown to clients in paid-session confirmation emails so they can reach Anthony directly.
  // Left unset until a real number is provided (never fabricate one).
  COACH_PHONE: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters"),

  // Feature toggles (string "true" → true, anything else → false)
  MESSAGING_ENABLED: z.string().default("false").transform((val) => val === "true"),
  CRON_ENABLED: z.string().default("false").transform((val) => val === "true"),
  // Gates the liability waiver step in onboarding. Stays off until the draft at
  // legal/private-coaching-waiver-DRAFT.md has been reviewed by an attorney.
  WAIVER_ENABLED: z.string().default("false").transform((val) => val === "true"),

  // Google Calendar — creates a real event on Anthony's calendar when a paid
  // session's payment clears. Stays off until the one-time OAuth authorization
  // (GET /api/v1/admin/google-calendar/auth) has been completed and the
  // resulting refresh token set below.
  GOOGLE_CALENDAR_ENABLED: z.string().default("false").transform((val) => val === "true"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),

  // Live CRM mirror — every survey submission and lead gets appended as a row
  // to a Google Sheet. Authenticates independently via a dedicated service
  // account (not the Calendar OAuth client) — the sheet must be shared with
  // that service account's client_email as an Editor. Off by default.
  // Postgres remains the system of record — this is a read-friendly mirror only.
  GOOGLE_SHEETS_ENABLED: z.string().default("false").transform((val) => val === "true"),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.log("FATAL: Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.log(`  -> ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
