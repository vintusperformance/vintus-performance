import { env } from "../config/env.js";
import { sendEmail } from "./resend.js";
import { logger } from "./logger.js";

/**
 * Admin/system notification helpers. Sends via the same Resend
 * infrastructure used everywhere else in the app (not a separate Gmail SMTP
 * account) — one email provider, one place to look when something doesn't
 * send.
 */

/** Send an admin notification email. */
export async function notifyAdmin(subject: string, body: string): Promise<void> {
  const messageId = await sendEmail(env.COACH_EMAIL, subject, body);
  if (!messageId) {
    logger.warn({ subject }, "Admin notification email failed to send");
  }
}

/**
 * Send a password reset email to a client.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  const subject = "Reset Your Vintus Performance Password";
  const body = `
    <p>We received a request to reset the password for your Vintus Performance account.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:#fff;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:6px;">Reset Password</a>
    </p>
    <p style="font-size:13px;color:#a3a3a3;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password will remain unchanged.</p>
  `;

  const messageId = await sendEmail(to, subject, body);
  if (!messageId) {
    logger.error({ to }, "Password reset email failed to send");
    throw new Error("Failed to send password reset email");
  }
  logger.info({ to }, "Password reset email sent");
}

/**
 * Notify admin of a new client signup.
 */
export async function notifyNewClient(data: {
  name: string;
  email: string;
  planTier: string;
  status: string;
}): Promise<void> {
  const tierDisplay: Record<string, string> = {
    PRIVATE_COACHING: "Private Coaching",
    TRAINING_30DAY: "30-Day Training",
    TRAINING_60DAY: "60-Day Training",
    TRAINING_90DAY: "90-Day Training",
    NUTRITION_4WEEK: "4-Week Nutrition",
    NUTRITION_8WEEK: "8-Week Nutrition",
  };

  const tier = tierDisplay[data.planTier] || data.planTier;
  const needsApproval = data.status === "PENDING_APPROVAL";

  const subject = needsApproval
    ? `New Client Needs Approval: ${data.name}`
    : `New Client Activated: ${data.name}`;

  const body = [
    `<strong>${needsApproval ? "New Client — Approval Required" : "New Client — Auto-Activated"}</strong>`,
    `<br><br><strong>Name:</strong> ${data.name}`,
    `<br><strong>Email:</strong> ${data.email}`,
    `<br><strong>Plan:</strong> ${tier}`,
    `<br><strong>Status:</strong> ${needsApproval ? "Pending Approval" : "Active"}`,
    needsApproval
      ? `<br><br>Log into the <a href="${env.FRONTEND_URL}/admin.html">Admin Dashboard</a> to review and approve this client.`
      : "",
  ].join("");

  await notifyAdmin(subject, body);
}

/**
 * Notify admin when a new lead completes the assessment form.
 * Fires BEFORE checkout — captures lead info even if they don't pay.
 */
export async function notifyNewLead(data: {
  name: string;
  email: string;
  phone: string | null;
  primaryGoal: string;
  experienceLevel: string;
  persona: string | null;
}): Promise<void> {
  const goalDisplay: Record<string, string> = {
    "build-muscle": "Build Muscle",
    "lose-fat": "Lose Fat",
    "endurance": "Endurance",
    "recomposition": "Recomposition",
    "well-rounded": "Well-Rounded Fitness",
  };

  const expDisplay: Record<string, string> = {
    "beginner": "Beginner",
    "intermediate": "Intermediate",
    "advanced": "Advanced",
    "elite": "Elite",
  };

  const subject = `New Lead: ${data.name} — ${goalDisplay[data.primaryGoal] || data.primaryGoal}`;

  const body = [
    `<strong>New Assessment Completed</strong>`,
    `<br>A potential client just completed the assessment form. They have NOT paid yet — follow up if they don't convert.`,
    `<br><br><strong>Name:</strong> ${data.name}`,
    `<br><strong>Email:</strong> ${data.email}`,
    data.phone ? `<br><strong>Phone:</strong> ${data.phone}` : "",
    `<br><strong>Goal:</strong> ${goalDisplay[data.primaryGoal] || data.primaryGoal}`,
    `<br><strong>Experience:</strong> ${expDisplay[data.experienceLevel] || data.experienceLevel}`,
    data.persona ? `<br><strong>AI Persona:</strong> ${data.persona}` : "",
  ].join("");

  await notifyAdmin(subject, body);
}
