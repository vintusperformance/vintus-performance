/**
 * Message template library for Vintus Performance.
 * Templates use {{variable}} interpolation.
 * Each template has a cooldown (hours) and channel compatibility.
 */

export interface MessageTemplate {
  id: string;
  category: string;
  channel: "SMS" | "EMAIL" | "BOTH";
  content: string;
  cooldownHours: number;
  tags: string[];
}

/**
 * Full template library grouped by MessageCategory.
 * Also exported flat for the AI service fallback.
 */
export const messageTemplates: Record<string, MessageTemplate[]> = {
  // ============================================================
  // WELCOME — 10 templates
  // ============================================================
  WELCOME: [
    {
      id: "welcome-sms-1",
      category: "WELCOME",
      channel: "SMS",
      content: "Welcome to Vintus, {{firstName}}. Your plan is built and ready. Let the structure do its job. If anything isn't working, text this number.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message"],
    },
    {
      id: "welcome-sms-2",
      category: "WELCOME",
      channel: "SMS",
      content: "{{firstName}}, you're in. Your first week is built. Show up and follow the plan. If you run into an issue, text this number.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message"],
    },
    {
      id: "welcome-sms-3",
      category: "WELCOME",
      channel: "SMS",
      content: "Everything is set, {{firstName}}. Day one starts now. Consistency from here. If anything looks off, text this number.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message"],
    },
    {
      id: "welcome-sms-4",
      category: "WELCOME",
      channel: "SMS",
      content: "{{firstName}} — your programming is live. The plan adapts to you. Your job is to show up. If anything isn't working, text this number.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message"],
    },
    {
      id: "welcome-sms-5",
      category: "WELCOME",
      channel: "SMS",
      content: "You've made the decision. Now we execute. Your first session is queued, {{firstName}}. If something isn't right with it, text this number.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message", "training-specific"],
    },
    {
      id: "welcome-email-1",
      category: "WELCOME",
      channel: "EMAIL",
      content: "Welcome to Vintus Performance, {{firstName}}. Your personalized training plan is live and adapting to your goals, schedule, and readiness from day one. Here's what to expect: a daily check-in to calibrate your plan, structured sessions designed for your experience level, and adaptive adjustments based on how you recover. Show up consistently — the system does the rest.",
      cooldownHours: 720,
      tags: ["onboarding", "first-email", "training-specific"],
    },
    {
      id: "welcome-email-2",
      category: "WELCOME",
      channel: "EMAIL",
      content: "{{firstName}}, your Vintus programming is ready. Your first week is structured around your training days, with sessions tailored to your equipment and experience level. Each session has a clear purpose — nothing is filler. Log your daily readiness check-in each morning and the plan will adapt in real time. Stay disciplined. Stay dominant.",
      cooldownHours: 720,
      tags: ["onboarding", "first-email", "training-specific"],
    },
    {
      id: "welcome-email-3",
      category: "WELCOME",
      channel: "EMAIL",
      content: "Good to have you, {{firstName}}. Your plan is calibrated and waiting. Over the coming weeks, your programming will adapt based on your adherence, your check-ins, and your performance. Your only job is to show up and log your sessions. The programming and the progression are handled. We don't guess.",
      cooldownHours: 720,
      tags: ["onboarding", "first-email"],
    },
    {
      id: "welcome-sms-6",
      category: "WELCOME",
      channel: "SMS",
      content: "{{firstName}}, the foundation is laid. Your plan is personalized, adaptive, and ready to go. If something's not working, text this number. Stay disciplined. Stay dominant.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message"],
    },
    {
      id: "welcome-sms-7",
      category: "WELCOME",
      channel: "SMS",
      content: "Ready when you are, {{firstName}}. Your training starts now. No guesswork — just structured progression. If anything isn't working, text this number.",
      cooldownHours: 720,
      tags: ["onboarding", "first-message", "training-specific"],
    },
  ],

  // ============================================================
  // WORKOUT_COMPLETED — 15 templates
  // ============================================================
  WORKOUT_COMPLETED: [
    {
      id: "wc-1",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "That's another one logged. Consistency compounds.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-2",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "Session done. Tomorrow's plan is adjusted based on today's output.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-3",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "Solid work yesterday. Recovery is what turns it into progress - hydrate and eat well today.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-4",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "{{firstName}}, session complete. Your data is logged and your next session is calibrated.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-5",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "Done. That's another session banked this week.",
      cooldownHours: 48,
      tags: ["post-workout", "metrics"],
    },
    {
      id: "wc-6",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "Another one in the books. The plan adapts — you just keep showing up.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-7",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "Session logged. The plan moves forward.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-8",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "Good work, {{firstName}}. Your next session builds on what you just did.",
      cooldownHours: 48,
      tags: ["post-workout"],
    },
    {
      id: "wc-9",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "Completed. Your body is adapting. Trust the timeline.",
      cooldownHours: 72,
      tags: ["post-workout"],
    },
    {
      id: "wc-10",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "That's the work. Recovery is the other half - sleep, hydration, nutrition.",
      cooldownHours: 48,
      tags: ["post-workout", "recovery"],
    },
    {
      id: "wc-11",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "Done and logged. This is the part that compounds.",
      cooldownHours: 72,
      tags: ["post-workout"],
    },
    {
      id: "wc-12",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "{{workoutTitle}} — complete. The data shapes your next workout automatically.",
      cooldownHours: 24,
      tags: ["post-workout", "specific"],
    },
    {
      id: "wc-13",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "Logged. Steady beats dramatic.",
      cooldownHours: 72,
      tags: ["post-workout"],
    },
    {
      id: "wc-14",
      category: "WORKOUT_COMPLETED",
      channel: "SMS",
      content: "Session logged. Take the win, and recover well.",
      cooldownHours: 48,
      tags: ["post-workout", "evening"],
    },
    {
      id: "wc-15",
      category: "WORKOUT_COMPLETED",
      channel: "BOTH",
      content: "{{firstName}}, that session matters more than you think. Progress logged.",
      cooldownHours: 72,
      tags: ["post-workout"],
    },
  ],

  // ============================================================
  // WORKOUT_MISSED — 12 templates
  // ============================================================
  WORKOUT_MISSED: [
    {
      id: "wm-1",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "Noticed yesterday's session didn't happen. No stress — today's plan is recalibrated.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-2",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "Life happens. Plan's been shifted to keep you on track without overload.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-3",
      category: "WORKOUT_MISSED",
      channel: "SMS",
      content: "Missed session noted. Your plan has been adjusted — no catching up needed.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-4",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "{{firstName}}, yesterday didn't go as planned. That's fine — the system adapts. Today is what matters.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-5",
      category: "WORKOUT_MISSED",
      channel: "SMS",
      content: "Session missed. Your plan is restructured. Just pick up where we left off.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-6",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "No judgment. The plan accounts for this. Tomorrow's session is ready when you are.",
      cooldownHours: 48,
      tags: ["missed"],
    },
    {
      id: "wm-7",
      category: "WORKOUT_MISSED",
      channel: "SMS",
      content: "Missed one. The plan is adjusted so you don't need to compensate. Just resume.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-8",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "Yesterday's session didn't happen — noted. Your week is re-balanced automatically.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-9",
      category: "WORKOUT_MISSED",
      channel: "SMS",
      content: "One missed session isn't a setback. The plan is already recalibrated, {{firstName}}.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-10",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "The plan has shifted to accommodate yesterday. No need to double up — just show up today.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-11",
      category: "WORKOUT_MISSED",
      channel: "SMS",
      content: "Missed session logged. Your program adapts — no guilt, just recalibration.",
      cooldownHours: 24,
      tags: ["missed"],
    },
    {
      id: "wm-12",
      category: "WORKOUT_MISSED",
      channel: "BOTH",
      content: "{{firstName}}, everything okay? Yesterday's session was missed. Plan is adjusted — ready when you are.",
      cooldownHours: 48,
      tags: ["missed", "concern"],
    },
  ],

  // ============================================================
  // ESCALATION — 8 templates
  // ============================================================
  ESCALATION: [
    {
      id: "esc-1",
      category: "ESCALATION",
      channel: "BOTH",
      content: "A few sessions missed this week, {{firstName}}. Everything good? Let's recalibrate — book a quick check-in: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-2",
      category: "ESCALATION",
      channel: "BOTH",
      content: "{{firstName}}, noticed a pattern of missed sessions. Want to talk through what's going on? {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-3",
      category: "ESCALATION",
      channel: "BOTH",
      content: "Hey {{firstName}} — haven't seen you in a few sessions. No pressure, but I'm here if you want to adjust the plan: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-4",
      category: "ESCALATION",
      channel: "SMS",
      content: "{{firstName}}, want to make sure the plan still fits your schedule. Worth a quick conversation: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-5",
      category: "ESCALATION",
      channel: "BOTH",
      content: "Checking in, {{firstName}}. A few missed sessions — want to adjust things? Quick call might help: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-6",
      category: "ESCALATION",
      channel: "EMAIL",
      content: "{{firstName}} — your training has paused. That's okay, but let's make sure the plan still serves you. A quick 10-minute call can recalibrate everything: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-7",
      category: "ESCALATION",
      channel: "SMS",
      content: "Haven't seen activity in a bit, {{firstName}}. Let's regroup — 10 minutes to recalibrate: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
    {
      id: "esc-8",
      category: "ESCALATION",
      channel: "BOTH",
      content: "{{firstName}}, want to make sure this is still working for you. Book a quick check-in: {{bookingLink}}",
      cooldownHours: 72,
      tags: ["escalation"],
    },
  ],

  // ============================================================
  // MOTIVATION — 15 templates
  // ============================================================
  MOTIVATION: [
    {
      id: "mot-1",
      category: "MOTIVATION",
      channel: "SMS",
      content: "The days you least want to train are often the ones that matter most.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-2",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Your plan is set for today. Show up and let the structure do its job.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-3",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Progress is quiet. It compounds in the sessions nobody sees.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-4",
      category: "MOTIVATION",
      channel: "SMS",
      content: "You don't need to feel motivated. You need to be disciplined. That's the difference.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-5",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Your body adapts to the demands you place on it. The plan decides which ones.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-6",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Consistency isn't glamorous. It's just effective.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-7",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Today's plan is programmed for a reason. Trust it, {{firstName}}.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-8",
      category: "MOTIVATION",
      channel: "SMS",
      content: "There are no shortcuts. But there is structure, and structure wins.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-9",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Every session logged is data. Every rep is a signal. Keep showing up.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-10",
      category: "MOTIVATION",
      channel: "SMS",
      content: "{{firstName}}, your plan doesn't need motivation. It needs execution.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-11",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Identity is built through action. Follow the plan today.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-12",
      category: "MOTIVATION",
      channel: "SMS",
      content: "The compound effect of consistent training is real. Stay the course.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-13",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Good morning, {{firstName}}. Today's plan is ready when you are.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-14",
      category: "MOTIVATION",
      channel: "SMS",
      content: "You chose this. That decision is worth honoring.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "mot-15",
      category: "MOTIVATION",
      channel: "SMS",
      content: "Rest when the plan says rest. Push when the plan says push. Trust the system.",
      cooldownHours: 168,
      tags: ["morning"],
    },
  ],

  // ============================================================
  // RECOVERY_TIP — 10 templates
  // ============================================================
  RECOVERY_TIP: [
    {
      id: "rt-1",
      category: "RECOVERY_TIP",
      channel: "BOTH",
      content: "Recovery reminder: 7-9 hours of sleep is where the real gains happen.",
      cooldownHours: 168,
      tags: ["evening", "sleep"],
    },
    {
      id: "rt-2",
      category: "RECOVERY_TIP",
      channel: "SMS",
      content: "Hydration matters more than most people account for. Keep water within reach today.",
      cooldownHours: 168,
      tags: ["morning", "hydration"],
    },
    {
      id: "rt-3",
      category: "RECOVERY_TIP",
      channel: "SMS",
      content: "If you're sore from yesterday, light movement beats sitting still. A 15-min walk works.",
      cooldownHours: 168,
      tags: ["morning", "mobility"],
    },
    {
      id: "rt-4",
      category: "RECOVERY_TIP",
      channel: "BOTH",
      content: "Sleep is your #1 recovery tool. Prioritize it like you prioritize your training.",
      cooldownHours: 168,
      tags: ["evening", "sleep"],
    },
    {
      id: "rt-5",
      category: "RECOVERY_TIP",
      channel: "SMS",
      content: "Get protein in after training. Don't overthink the window - just don't skip it.",
      cooldownHours: 168,
      tags: ["post-workout", "nutrition"],
    },
    {
      id: "rt-6",
      category: "RECOVERY_TIP",
      channel: "BOTH",
      content: "{{firstName}}, your body rebuilds between sessions, not during them. Protect the downtime.",
      cooldownHours: 168,
      tags: ["rest-day"],
    },
    {
      id: "rt-7",
      category: "RECOVERY_TIP",
      channel: "SMS",
      content: "Foam rolling for 10 minutes tonight will pay dividends tomorrow. Worth the time.",
      cooldownHours: 168,
      tags: ["evening", "mobility"],
    },
    {
      id: "rt-8",
      category: "RECOVERY_TIP",
      channel: "BOTH",
      content: "Stress affects recovery more than most people account for. Five minutes of slow breathing before bed helps.",
      cooldownHours: 168,
      tags: ["evening", "stress"],
    },
    {
      id: "rt-9",
      category: "RECOVERY_TIP",
      channel: "SMS",
      content: "On rest days, light mobility work keeps you primed for the next session.",
      cooldownHours: 168,
      tags: ["rest-day", "mobility"],
    },
    {
      id: "rt-10",
      category: "RECOVERY_TIP",
      channel: "BOTH",
      content: "Your sleep score was {{sleepScore}} — if that's trending down, it's worth addressing before volume goes up.",
      cooldownHours: 48,
      tags: ["morning", "data"],
    },
  ],

  // ============================================================
  // CHECK_IN — 8 templates
  // ============================================================
  CHECK_IN: [
    {
      id: "ci-1",
      category: "CHECK_IN",
      channel: "SMS",
      content: "Quick 30-second check-in will help tune today's plan: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["morning"],
    },
    {
      id: "ci-2",
      category: "CHECK_IN",
      channel: "SMS",
      content: "{{firstName}}, a quick readiness check-in helps your plan adapt. Energy, sleep, soreness — takes 30 seconds: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["morning"],
    },
    {
      id: "ci-3",
      category: "CHECK_IN",
      channel: "SMS",
      content: "Morning, {{firstName}}. Drop a quick check-in so your plan can adjust for today: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["morning"],
    },
    {
      id: "ci-4",
      category: "CHECK_IN",
      channel: "SMS",
      content: "No check-in logged yet today. A quick log keeps your plan dialed in: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["afternoon", "reminder"],
    },
    {
      id: "ci-5",
      category: "CHECK_IN",
      channel: "SMS",
      content: "Your plan adapts best with daily data. Quick check-in before your session? {{checkInLink}}",
      cooldownHours: 24,
      tags: ["morning"],
    },
    {
      id: "ci-6",
      category: "CHECK_IN",
      channel: "SMS",
      content: "30 seconds: energy, sleep, soreness. That's all the system needs to optimize your day: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["morning"],
    },
    {
      id: "ci-7",
      category: "CHECK_IN",
      channel: "SMS",
      content: "{{firstName}} — your daily check-in shapes today's workout intensity. Worth the 30 seconds: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["morning"],
    },
    {
      id: "ci-8",
      category: "CHECK_IN",
      channel: "SMS",
      content: "The more data your plan has, the better it adapts. Quick check-in when you get a moment: {{checkInLink}}",
      cooldownHours: 24,
      tags: ["afternoon"],
    },
  ],

  // ============================================================
  // SYSTEM — 3 templates (kept for system notifications)
  // ============================================================
  SYSTEM: [
    {
      id: "sys-1",
      category: "SYSTEM",
      channel: "BOTH",
      content: "Your weekly plan has been updated. Check your dashboard for this week's sessions.",
      cooldownHours: 168,
      tags: ["system"],
    },
    {
      id: "sys-2",
      category: "SYSTEM",
      channel: "BOTH",
      content: "Plan adjustment: today's session has been modified based on your readiness data.",
      cooldownHours: 24,
      tags: ["system", "adjustment"],
    },
    {
      id: "sys-3",
      category: "SYSTEM",
      channel: "EMAIL",
      content: "Your subscription is active and your plan is current. Nothing needed on your end.",
      cooldownHours: 720,
      tags: ["system"],
    },
  ],

  // ============================================================
  // HUMOR — 3 templates
  // ============================================================
  HUMOR: [
    {
      id: "humor-1",
      category: "HUMOR",
      channel: "SMS",
      content: "Rest day. Yes, that means rest. Put the dumbbells down, {{firstName}}.",
      cooldownHours: 168,
      tags: ["rest-day"],
    },
    {
      id: "humor-2",
      category: "HUMOR",
      channel: "SMS",
      content: "Your plan says recovery today. Fight the urge to 'just do a quick one.'",
      cooldownHours: 168,
      tags: ["rest-day"],
    },
    {
      id: "humor-3",
      category: "HUMOR",
      channel: "SMS",
      content: "Reminder: the gym will be there tomorrow. Today, be horizontal.",
      cooldownHours: 168,
      tags: ["rest-day"],
    },
  ],

  // ============================================================
  // EDUCATION — 3 templates
  // ============================================================
  EDUCATION: [
    {
      id: "edu-1",
      category: "EDUCATION",
      channel: "BOTH",
      content: "Progressive overload doesn't always mean more weight. More reps, better form, and shorter rest all count.",
      cooldownHours: 168,
      tags: ["education"],
    },
    {
      id: "edu-2",
      category: "EDUCATION",
      channel: "BOTH",
      content: "Zone 2 cardio builds the aerobic base that powers everything else. It should feel easy — that's the point.",
      cooldownHours: 168,
      tags: ["education", "endurance"],
    },
    {
      id: "edu-3",
      category: "EDUCATION",
      channel: "BOTH",
      content: "RPE 7 means you could do 3 more reps. RPE 9 means maybe 1 more. Calibrate accordingly.",
      cooldownHours: 168,
      tags: ["education"],
    },
  ],

  // ============================================================
  // ACCOUNTABILITY — 3 templates
  // ============================================================
  ACCOUNTABILITY: [
    {
      id: "acc-1",
      category: "ACCOUNTABILITY",
      channel: "SMS",
      content: "{{firstName}}, you committed to {{trainingDaysPerWeek}} days this week. Today is one of them.",
      cooldownHours: 168,
      tags: ["morning"],
    },
    {
      id: "acc-2",
      category: "ACCOUNTABILITY",
      channel: "SMS",
      content: "Your adherence this week: {{adherenceRate}}. The plan works when you work the plan.",
      cooldownHours: 168,
      tags: ["morning", "metrics"],
    },
    {
      id: "acc-3",
      category: "ACCOUNTABILITY",
      channel: "SMS",
      content: "Session scheduled for today, {{firstName}}. The structure is there — your job is to show up.",
      cooldownHours: 168,
      tags: ["morning"],
    },
  ],

  // ============================================================
  // CHECKIN_RESPONSE — Post-check-in personalized SMS (8 templates)
  // ============================================================
  CHECKIN_RESPONSE: [
    // Low readiness (supportive tone)
    {
      id: "cr-low-1",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Noted, {{firstName}}. Energy at {{perceivedEnergy}}, soreness at {{perceivedSoreness}}. Today's plan accounts for where you are.",
      cooldownHours: 20,
      tags: ["checkin-response", "low-readiness"],
    },
    {
      id: "cr-low-2",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Noted, {{firstName}}. Sleep at {{sleepQualityManual}}. Recovery is part of the plan, not a break from it.",
      cooldownHours: 20,
      tags: ["checkin-response", "low-readiness"],
    },
    // High readiness (energized tone)
    {
      id: "cr-high-1",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Energy {{perceivedEnergy}}, mood {{perceivedMood}} — solid. Your session has a clear runway today, {{firstName}}.",
      cooldownHours: 20,
      tags: ["checkin-response", "high-readiness"],
    },
    {
      id: "cr-high-2",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Readiness is high today, {{firstName}}. Today is a day to push. The plan reflects that.",
      cooldownHours: 20,
      tags: ["checkin-response", "high-readiness"],
    },
    // Mixed readiness (balanced tone)
    {
      id: "cr-mix-1",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "{{firstName}}, mixed readiness today. The plan is calibrated for it.",
      cooldownHours: 20,
      tags: ["checkin-response", "mixed-readiness"],
    },
    {
      id: "cr-mix-2",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Mixed signals today — that's normal. Your programming adapts to exactly this, {{firstName}}.",
      cooldownHours: 20,
      tags: ["checkin-response", "mixed-readiness"],
    },
    // Generic fallback
    {
      id: "cr-gen-1",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Check-in logged, {{firstName}}. Your day is calibrated.",
      cooldownHours: 20,
      tags: ["checkin-response", "generic"],
    },
    {
      id: "cr-gen-2",
      category: "CHECKIN_RESPONSE",
      channel: "SMS",
      content: "Data received, {{firstName}}. Your plan is adjusting — show up and let the structure work.",
      cooldownHours: 20,
      tags: ["checkin-response", "generic"],
    },
  ],

  // ============================================================
  // DAILY_WORKOUT_ALERT — morning texts (training + rest days)
  // ============================================================
  DAILY_WORKOUT_ALERT: [
    { id: "dwa-1", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Day {{dayNumber}} of {{totalDays}}. Today: {{sessionTitle}} - {{duration}} min. Time to work, {{firstName}}.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-2", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "{{firstName}}, Day {{dayNumber}}. {{sessionTitle}} is loaded. {{duration}} minutes. Show up.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-3", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Day {{dayNumber}} - {{sessionTitle}}. {{duration}} min. The thinking is already done.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-4", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Training day, {{firstName}}. Day {{dayNumber}}: {{sessionTitle}}. Get it done.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-5", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Day {{dayNumber}} of {{totalDays}}. {{sessionTitle}} — {{duration}} min. The work is already decided.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-6", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "{{firstName}}, your Day {{dayNumber}} session is ready. {{sessionTitle}}. Time to work.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-7", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Day {{dayNumber}}. {{sessionTitle}} - {{duration}} min. Consistency is the whole strategy.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-8", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "{{sessionTitle}} today, {{firstName}}. Day {{dayNumber}} of {{totalDays}} is on the board.", cooldownHours: 20, tags: ["daily", "training-day"] },
    { id: "dwa-rest-1", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Day {{dayNumber}} of {{totalDays}}. Rest day. Recovery is part of the process, {{firstName}}.", cooldownHours: 20, tags: ["daily", "rest-day"] },
    { id: "dwa-rest-2", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "{{firstName}}, Day {{dayNumber}}. Rest day - hydrate, move lightly, recover.", cooldownHours: 20, tags: ["daily", "rest-day"] },
    { id: "dwa-rest-3", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Day {{dayNumber}}. No session today. Let your body rebuild - that's the point of it.", cooldownHours: 20, tags: ["daily", "rest-day"] },
    { id: "dwa-rest-4", category: "DAILY_WORKOUT_ALERT", channel: "SMS" as const, content: "Rest day, {{firstName}}. Day {{dayNumber}} of {{totalDays}}. Growth happens in recovery.", cooldownHours: 20, tags: ["daily", "rest-day"] },
  ],

  // ============================================================
  // PC_DAILY_PUSH — Private Coaching only. Always-auto-send morning
  // message: encouragement + {{tasksLine}}, a pre-built sentence covering
  // today's training session and (when available) nutrition guidance.
  // ============================================================
  PC_DAILY_PUSH: [
    { id: "pcdp-1", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Stay disciplined. Stay dominant. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-2", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Your only competition is yesterday. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-3", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The plan is set. The thinking is already done. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-4", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Whatever yesterday looked like, this is a clean page. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-5", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Precision over guesswork, every day. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-6", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, good morning. Glad to have you in this. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-7", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Steady beats dramatic, every time. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-8", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Your health is the asset the rest of it runs on. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-9", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, discipline is just a decision you already made. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-10", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. High standards aren't loud. They're just kept. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-11", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This is what holding the line looks like. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-12", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the bar stays where you set it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-13", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Excellence is a habit, not a mood. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-14", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. You don't need to feel ready. You just need to be disciplined. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-15", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, some days are easy. Discipline covers the rest. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-16", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Standards over moods, every time. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "discipline"] },
    { id: "pcdp-17", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. We don't guess. We execute. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-18", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the system already made today's decisions. Just follow it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-19", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Trust the plan more than the mood you woke up in. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-20", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the guesswork's been removed. That's the whole point. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-21", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. A good system makes today simple. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-22", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The plan doesn't care how you feel. Follow it anyway. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-23", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, structure beats willpower on the hard days. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-24", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Everything's already mapped out for you. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "systems"] },
    { id: "pcdp-25", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Every day like this is who you're becoming. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-26", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This is what building a different life actually looks like. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-27", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this is the version of you that gets built quietly. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-28", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Small, unremarkable days like this add up to something real. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-29", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Nobody sees this part. It matters anyway. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-30", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the person you're becoming is built one ordinary morning at a time. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-31", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is the work behind the person people eventually notice. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-32", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. You're not chasing a moment. You're building a standard. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-33", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, nothing special about this morning. That's exactly the point. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-34", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Real change looks boring from the inside. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "identity"] },
    { id: "pcdp-35", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Everything you're building depends on this holding up. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-36", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the energy for everything else starts here. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-37", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This is the infrastructure behind the career. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-38", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Protect this the way you'd protect anything that matters. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-39", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this is what funds the rest of your output. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-40", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. High performance starts before the workday does. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-41", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this is the part of the job nobody schedules for you. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-42", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. You can't outsource this one. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "executive-performance"] },
    { id: "pcdp-43", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Quiet mornings like this are where it's actually won. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-44", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Nothing dramatic here. Just another brick. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-45", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, no fanfare needed. Just the work. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-46", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This one won't make headlines. It still counts. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-47", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Unspectacular and repeated beats occasional and impressive. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-48", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this is the boring part that actually works. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-49", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Consistency doesn't need an audience. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-50", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Ordinary effort, repeated, is the whole strategy. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-51", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Slow and unglamorous, exactly as designed. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "quiet-consistency"] },
    { id: "pcdp-52", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. New day, same standard. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-53", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, yesterday's done. This morning doesn't care what happened before it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-54", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. A fresh 24 hours, no explanation needed. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-55", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Start where you are, not where you wish you were. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-56", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, no need to catch up on anything. Just begin here. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-57", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This morning is its own clean start. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-58", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Nothing to carry over. Just the work in front of you. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-59", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, a new day asks one question: what now? {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-60", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. The clock starts over every morning. Use it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "fresh-start"] },
    { id: "pcdp-61", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This isn't a sprint. Move like you know that. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-62", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Real results are slow on purpose. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-63", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, patience is a competitive advantage most people don't have. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-64", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Overnight results are somebody else's marketing. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-65", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Think in years. Act this morning. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-66", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the long game rewards people who keep showing up for it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-67", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is a marathon dressed up as an ordinary morning. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-68", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Compounding takes time. Time takes mornings like this. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-69", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the timeline is longer than it feels some days. Stay on it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-70", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Slow, steady, and correct beats fast and wrong. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "patience"] },
    { id: "pcdp-71", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. One day, handled well, is the whole job. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-72", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Just this morning. That's the only ask. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-73", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, you only have to get through today. Do that part well. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-74", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. One session at a time is still a plan. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-75", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Focus here. The rest can wait its turn. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-76", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this morning gets your full attention. Nothing else does yet. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-77", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Handle what's in front of you first. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-78", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. One well-run morning changes the shape of the day. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-79", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, everything else can wait until this part is done. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-80", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Start narrow. Widen out later. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "presence"] },
    { id: "pcdp-81", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. The strategy is handled on my end. Execution is yours. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-82", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is between you and the plan. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-83", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, morning. No noise, just the next right step. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-84", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This is your lane. Stay in it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-85", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Nothing to overthink here. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-86", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, morning. Let the plan carry the weight. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-87", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Simple morning. Run it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-88", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, good morning. Let's get into it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "coach-voice"] },
    { id: "pcdp-89", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Not a diet, not a guess. A system. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-90", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Guessing is the expensive way to train. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-91", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, no winging it today. It's already been figured out. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-92", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Precision beats effort when effort's aimed wrong. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-93", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This plan was built on purpose, not guessed at. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-94", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, exact numbers, exact plan, no guesswork required. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-95", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The details were handled so you don't have to. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-96", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Deliberate, not accidental. That's the plan. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-97", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this is engineered, not improvised. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-98", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Nothing here is a default. It was built for your situation. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "precision"] },
    { id: "pcdp-99", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This is a promise worth keeping to yourself. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-100", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. You said you'd do this. Here's today's chance. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-101", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this is what keeping your word to yourself looks like. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-102", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. The standard holds whether or not anyone's watching. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-103", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is the commitment, not the mood. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-104", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, you don't owe today your excitement. Just your follow-through. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-105", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. A commitment kept quietly is still kept. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-106", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Intentions are easy. This part is the actual commitment. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "commitment"] },
    { id: "pcdp-107", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. This is where the day gets decided. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-108", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. How this morning goes sets the tone for the rest of it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-109", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, mornings like this are where the real work happens. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-110", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Win the first hour before the day starts asking for it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-111", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is the part of the day that belongs to you. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-112", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, everything downstream starts with this morning. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-113", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Set the tone here, and the day tends to follow. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
    { id: "pcdp-114", category: "PC_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is your first decision of the day. Make it count. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "private-coaching", "morning-ritual"] },
  ],

  // ============================================================
  // PC_AFTERNOON_CHECKIN — Private Coaching only. Always-auto-send
  // ~7pm message asking how the day went and prompting the client to
  // log today's check-in. {{checkInLink}} points straight to the dashboard.
  // ============================================================
  PC_AFTERNOON_CHECKIN: [
    { id: "pcac-1", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Hey {{firstName}}, how'd today go? Log a quick check-in so the plan can account for it: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-2", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, a quick read on today helps calibrate what's next. Check in here: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-3", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Evening, {{firstName}}. However today went, log it. That's how the plan stays accurate: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-4", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, 30 seconds on how today went is all it takes. Check in: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-5", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Hey {{firstName}}, checking in on your day. A quick log when you get a minute: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-6", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, a day that isn't logged is a day the plan can't see. Quick check-in: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-7", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Evening check-in, {{firstName}}. However today went, log it. Accurate beats flattering: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-8", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, strong day or hard one, the log matters the same. Quick check-in here: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-9", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Hey {{firstName}}, how's it going today? Log it so the plan stays current: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-10", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, a minute now saves guesswork later. Check in on today: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-11", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Evening, {{firstName}}. Worth a quick check-in on how today went: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-12", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, how's today shaping up? A quick check-in keeps the plan accurate: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-13", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Hey {{firstName}}, whatever today looks like, it's worth logging. Check in here: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-14", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, before the day gets away from you, a quick check-in: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-15", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "Evening, {{firstName}}. Take 30 seconds and log how today went: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
    { id: "pcac-16", category: "PC_AFTERNOON_CHECKIN", channel: "SMS" as const, content: "{{firstName}}, the plan gets sharper with today's read. Log it here: {{checkInLink}}", cooldownHours: 20, tags: ["evening", "private-coaching"] },
  ],

  // ============================================================
  // TRAINING_DAILY_PUSH — Training-tier only (30/60/90-day), no active
  // nutrition plan. Always-auto-send morning message. {{tasksLine}} is a
  // pre-built "Day X of Y: <session>" or rest-day sentence.
  // ============================================================
  TRAINING_DAILY_PUSH: [
    { id: "tdp-1", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The program is running exactly as built. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-2", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Structure carries the load. You just execute. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-3", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the plan is set. Show up and follow it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-4", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Every day in this program has a purpose. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-5", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Progress happens on schedule, not by accident. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-6", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the program doesn't skip days. Neither should you. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-7", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is what committing to a program looks like. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-8", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Hard days and easy days are both programmed on purpose. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-9", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the structure is built. Trust it and move. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-10", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Consistency inside the program is the whole point. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-11", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. No guesswork here, just the next session. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-12", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the plan accounts for everything except whether you show up. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-13", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This program was built to be followed, not improvised. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-14", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Every session moves you toward the finish line. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-15", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the work is scheduled. All that's left is doing it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-16", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Programs work when they're run start to finish. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-17", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. You came here for structure. Run it as written. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-18", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, discipline inside a program beats motivation outside one. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-19", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is a system, not a suggestion. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-20", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Stay on schedule. The adaptation takes care of itself. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-21", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, this program has a start and an end. Everything between is execution. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-22", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Precision over guesswork, start to finish. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-23", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Today's session is already accounted for in the plan. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-24", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, finishing this program starts with today. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
    { id: "tdp-25", category: "TRAINING_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The plan works when you work the plan. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "training"] },
  ],

  // ============================================================
  // NUTRITION_DAILY_PUSH — Nutrition-tier only (4/8-week), standalone
  // purchase (no Training or Private Coaching subscription active).
  // Always-auto-send morning message. {{tasksLine}} is a pre-built
  // "Day X of Y. Today's target: ..." macro sentence.
  // ============================================================
  NUTRITION_DAILY_PUSH: [
    { id: "ndp-1", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Not a diet. A precision system. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-2", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Today's numbers are already calculated for you. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-3", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, fueling right is part of the plan, not separate from it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-4", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Precision beats guesswork, meal by meal. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-5", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. The targets are set. No math required. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-6", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, what you eat today is programmed, not improvised. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-7", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Nutrition is a system here, not willpower. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-8", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Hitting today's numbers is the whole job. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-9", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the plan already did the thinking. Just follow it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-10", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Consistency with food compounds the same way training does. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-11", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. These numbers came from your body, not a template. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-12", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, what you eat is the most controllable variable you have. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-13", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The numbers are set. Execution is yours. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-14", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. No guesswork on what to eat next. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-15", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the plan handles the calculations. You handle the follow-through. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-16", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Fueling on purpose, not by accident. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-17", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. Today's nutrition is dialed in, just execute it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-18", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the targets don't change based on how today feels. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-19", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. This is a system built around your numbers, not a generic plan. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-20", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. A repeatable week of eating beats a perfect day. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-21", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, the targets are set. The sample meals show one way to hit them. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-22", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. Precision over guesswork, every meal. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-23", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Morning, {{firstName}}. The targets are fixed. The food choices are yours to make well. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-24", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "{{firstName}}, hitting your targets today is simpler than it feels. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
    { id: "ndp-25", category: "NUTRITION_DAILY_PUSH", channel: "SMS" as const, content: "Good morning, {{firstName}}. The plan is built. Today is about following it. {{tasksLine}} {{dashboardLink}}", cooldownHours: 20, tags: ["morning", "nutrition"] },
  ],

  // ============================================================
  // WORKOUT_NOT_LOGGED — evening follow-up nudges
  // ============================================================
  WORKOUT_NOT_LOGGED: [
    { id: "wnl-1", category: "WORKOUT_NOT_LOGGED", channel: "SMS" as const, content: "{{firstName}}, Day {{dayNumber}} isn't logged yet. Get it in if you can, or log it as missed.", cooldownHours: 20, tags: ["follow-up"] },
    { id: "wnl-2", category: "WORKOUT_NOT_LOGGED", channel: "SMS" as const, content: "Your session today isn't logged, {{firstName}}. Log it either way so the plan stays accurate.", cooldownHours: 20, tags: ["follow-up"] },
    { id: "wnl-3", category: "WORKOUT_NOT_LOGGED", channel: "SMS" as const, content: "Day {{dayNumber}} - no log yet. If you did the work, log it so the plan stays accurate.", cooldownHours: 20, tags: ["follow-up"] },
    { id: "wnl-4", category: "WORKOUT_NOT_LOGGED", channel: "SMS" as const, content: "{{firstName}}, just checking — did you get today's session in? Your Day {{dayNumber}} isn't tracked.", cooldownHours: 20, tags: ["follow-up"] },
    { id: "wnl-5", category: "WORKOUT_NOT_LOGGED", channel: "SMS" as const, content: "Day {{dayNumber}} workout not logged. The plan can't adapt if we don't have data. Log it, {{firstName}}.", cooldownHours: 20, tags: ["follow-up"] },
    { id: "wnl-6", category: "WORKOUT_NOT_LOGGED", channel: "SMS" as const, content: "Hey {{firstName}} - today's session isn't logged. A missed day logged is better than a blank one.", cooldownHours: 20, tags: ["follow-up"] },
  ],

  // ============================================================
  // PLAN_MILESTONE — special day-number messages
  // ============================================================
  PLAN_MILESTONE: [
    { id: "pm-day1", category: "PLAN_MILESTONE", channel: "SMS" as const, content: "Day 1 of {{totalDays}}, {{firstName}}. This is where it starts. No looking back.", cooldownHours: 720, tags: ["milestone", "day-1"] },
    { id: "pm-quarter", category: "PLAN_MILESTONE", channel: "SMS" as const, content: "25% done, {{firstName}}. Day {{dayNumber}} of {{totalDays}}. The foundation is being built.", cooldownHours: 720, tags: ["milestone", "quarter"] },
    { id: "pm-half", category: "PLAN_MILESTONE", channel: "SMS" as const, content: "Halfway. Day {{dayNumber}} of {{totalDays}}. This is the stretch where it gets decided, {{firstName}}.", cooldownHours: 720, tags: ["milestone", "halfway"] },
    { id: "pm-three-quarter", category: "PLAN_MILESTONE", channel: "SMS" as const, content: "75% complete, {{firstName}}. Day {{dayNumber}} of {{totalDays}}. The finish line is in sight.", cooldownHours: 720, tags: ["milestone", "three-quarter"] },
    { id: "pm-almost", category: "PLAN_MILESTONE", channel: "SMS" as const, content: "{{firstName}}, 2 days left. Day {{dayNumber}} of {{totalDays}}. Finish what you started.", cooldownHours: 720, tags: ["milestone", "almost-done"] },
    { id: "pm-final", category: "PLAN_MILESTONE", channel: "SMS" as const, content: "Day {{totalDays}} - the last day of your {{planTierDisplay}} program, {{firstName}}. Time to decide what's next.", cooldownHours: 720, tags: ["milestone", "final-day"] },
  ],

  // ============================================================
  // PLAN_ENDING — warnings before plan expires
  // ============================================================
  PLAN_ENDING: [
    { id: "pe-3day", category: "PLAN_ENDING", channel: "SMS" as const, content: "{{firstName}}, your {{planTierDisplay}} program ends in 3 days. Make the most of what's left.", cooldownHours: 72, tags: ["plan-ending"] },
    { id: "pe-1day", category: "PLAN_ENDING", channel: "SMS" as const, content: "{{firstName}}, tomorrow is your last day. One more session to close this chapter strong.", cooldownHours: 24, tags: ["plan-ending"] },
  ],

  // ============================================================
  // PLAN_COMPLETED — renewal prompt
  // ============================================================
  PLAN_COMPLETED: [
    { id: "pc-1", category: "PLAN_COMPLETED", channel: "SMS" as const, content: "{{firstName}}, your {{planTierDisplay}} program is complete. Ready for the next level? Take a look here: {{renewalLink}}", cooldownHours: 720, tags: ["plan-complete"] },
  ],

  // ============================================================
  // RENEWAL_FOLLOWUP — no response follow-up
  // ============================================================
  RENEWAL_FOLLOWUP: [
    { id: "rf-1", category: "RENEWAL_FOLLOWUP", channel: "SMS" as const, content: "{{firstName}}, following up on your program ending. If you want to keep going, take a look here: {{renewalLink}}", cooldownHours: 720, tags: ["renewal"] },
  ],

  // ============================================================
  // ASSESSMENT_FOLLOWUP_1 — ~48h after an abandoned assessment
  //
  // EMAIL only: the recipient completed the intake but never subscribed, so
  // they have not given SMS consent. Deliberately no offer, no price, and no
  // discount -- this is a coach following up on what they told us, not a
  // drip campaign. {{primaryGoalText}} and {{blockerText}} come from their
  // own intake answers, so the specificity is real rather than implied.
  // ============================================================
  ASSESSMENT_FOLLOWUP_1: [
    {
      id: "af1-1",
      category: "ASSESSMENT_FOLLOWUP_1",
      channel: "EMAIL" as const,
      content:
        "{{firstName}},\n\nYou finished the assessment a couple of days ago. I read it.\n\nYou said the goal is {{primaryGoalText}}, and that the thing getting in the way is {{blockerText}}. That second part is the one that actually decides the outcome. Most people in your position aren't short on effort. They're short on a plan that survives a real week.\n\nYour results are still here if you want to look again: {{resultsLink}}\n\nIf you have a question about any of it, reply to this email. It comes to me.\n\nAnthony\nVintus Performance",
      cooldownHours: 8760,
      tags: ["assessment-recovery", "first-touch"],
    },
    {
      id: "af1-2",
      category: "ASSESSMENT_FOLLOWUP_1",
      channel: "EMAIL" as const,
      content:
        "{{firstName}},\n\nYou put real detail into that assessment, so here's the honest read.\n\nWanting {{primaryGoalText}} isn't the hard part. {{blockerText}} is. That's a structural problem, not a discipline problem, and it doesn't resolve by trying harder next Monday.\n\nYour results are saved here: {{resultsLink}}\n\nIf something in there didn't match how your week actually runs, tell me. Reply to this email.\n\nAnthony\nVintus Performance",
      cooldownHours: 8760,
      tags: ["assessment-recovery", "first-touch"],
    },
  ],

  // ============================================================
  // ASSESSMENT_FOLLOWUP_2 — ~day 7, final touch
  //
  // Points at the free consultation, which is already enforced one-time
  // per person by email match on Lead (see leads.service.ts). Still no
  // price and no offer language -- the consultation IS the next step.
  // Closes the sequence: nothing is sent after this one.
  // ============================================================
  ASSESSMENT_FOLLOWUP_2: [
    {
      id: "af2-1",
      category: "ASSESSMENT_FOLLOWUP_2",
      channel: "EMAIL" as const,
      content:
        "{{firstName}},\n\nLast note from me on this.\n\nIf {{blockerText}} is still the sticking point, a short call is usually faster than another month of figuring it out alone. No pitch. I'll ask about your schedule, your travel, and how you sleep, and tell you what I'd change first.\n\nYou can book it here: {{consultationLink}}\n\nIf the timing isn't right, that's a fine answer. Your results stay available either way: {{resultsLink}}\n\nAnthony\nVintus Performance",
      cooldownHours: 8760,
      tags: ["assessment-recovery", "final-touch"],
    },
    {
      id: "af2-2",
      category: "ASSESSMENT_FOLLOWUP_2",
      channel: "EMAIL" as const,
      content:
        "{{firstName}},\n\nI'll leave this one here.\n\nYou told me the goal is {{primaryGoalText}}. If that's still true and the week keeps winning, the fastest thing I can do is look at your actual calendar with you and tell you where the training goes.\n\nThat conversation is here if you want it: {{consultationLink}}\n\nNo follow-up after this. Your results stay up: {{resultsLink}}\n\nAnthony\nVintus Performance",
      cooldownHours: 8760,
      tags: ["assessment-recovery", "final-touch"],
    },
  ],
};

/**
 * Flat fallback format for ai.service.ts compatibility.
 * Maps category → array of { id, content }.
 */
export const fallbackTemplates: Record<string, { id: string; content: string }[]> =
  Object.fromEntries(
    Object.entries(messageTemplates).map(([category, templates]) => [
      category,
      templates.map((t) => ({ id: t.id, content: t.content })),
    ])
  );
