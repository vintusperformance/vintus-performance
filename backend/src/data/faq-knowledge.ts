// ============================================================
// FAQ_KNOWLEDGE — grounded facts about Vintus Performance's
// plans, billing, and policies. Injected into Coach Jerry's
// system prompt so client-facing answers stay accurate instead
// of improvised. Keep this file the single source of truth —
// update it here, not by editing the prompt-building code.
// ============================================================

export const FAQ_KNOWLEDGE = `
PLANS & PRICING:
- Private Coaching: $997/month, recurring subscription, cancel anytime from Settings.
- 30-Day Training Plan: $99 one-time.
- 60-Day Training Plan: $149 one-time.
- 90-Day Training Plan: $199 one-time.
- 4-Week Nutrition Plan: $229 one-time.
- 8-Week Nutrition Plan: $399 one-time.
- All plans are delivered digitally through the client's private Vintus Performance dashboard — not a PDF, not email attachments.

ADD-ONS:
- Calorie & Macro Calculator: $23 one-time, Training Plan clients only (30/60/90-Day). Delivers daily calorie and macro targets as a new dashboard tab — numbers only, no meal plan, no check-ins, recalculable anytime. Not available to Private Coaching or Nutrition Plan clients, who already have full nutrition guidance bundled in or purchased. Bought from the "Add-Ons" button on the dashboard.

PAID SESSIONS (one-off, no subscription — booked via /paid-session, not the dashboard):
- 30-Minute Meeting: $85/person, 1-6 people, video call.
- 60-Min Training Session (1-on-1): $150 flat, 1 person, video call.
- 60-Min Training Session (1-on-2): $110/person, 1-2 people, video call.
- 60-Min Training Session (Group): $65/person, 3-6 people, video call.
- Booked by selecting a time on the calendar, a survey on how to help them, then Stripe checkout — headcount for per-person sessions determines the total charge. Confirmation email is sent after payment with the meeting method and how to reach Anthony directly.
- One-time plans (Training/Nutrition) are billed once for the stated access period, then access is retained for a short renewal-decision window after the period ends before deactivation.
- Private Coaching bills automatically every month until the client cancels.

MANAGING A SUBSCRIPTION:
- Clients can view or cancel their subscription anytime from their account Settings page.
- If a one-time plan is ending, the client will be prompted about renewal; there is no automatic charge for one-time plans.

REFUNDS:
- All Vintus purchases are final — Private Coaching, one-time Training/Nutrition Plans, Add-Ons, and Paid Sessions alike. No refunds, in whole or in part, regardless of reason or how much was used/attended.
- Private Coaching: canceling in Settings stops future billing only — it does not refund the current or any prior billing period. This is stated in the waiver clients accept during onboarding.
- Never imply a refund is possible or "case by case" — the policy is settled: no refunds.

TEXT MESSAGES (SMS):
- Clients opt in via a checkbox during signup/assessment. Message frequency varies (workout reminders, check-ins, appointment/account notices).
- Message and data rates may apply. Reply STOP to opt out anytime, HELP for help.
- SMS consent is never required to make a purchase.

WHAT'S INCLUDED:
- Training plans include a structured workout program and nutrition guidelines.
- Nutrition plans are personalized around the client's body, schedule, training demands, and goals.
- Private Coaching includes ongoing AI-assisted plan generation, adherence tracking, and direct coach access.

THINGS JERRY SHOULD NOT INVENT:
- Do not quote equipment requirements, specific exercise prescriptions, or injury protocols beyond what's in the client's own plan/profile — that's outside this knowledge base.
- If a client asks something not covered here and it's not in their personal athlete context, say so plainly rather than guessing.
`.trim();
