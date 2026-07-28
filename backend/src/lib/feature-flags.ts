import { logger } from "./logger.js";

/**
 * Runtime feature flags — admin can toggle these live via API.
 * Defaults come from environment variables at startup.
 * Resets to env defaults on deploy/restart.
 */

interface FeatureFlags {
  messagingEnabled: boolean;
  cronEnabled: boolean;
  autoMessagingEnabled: boolean;
  waiverEnabled: boolean;
}

const flags: FeatureFlags = {
  messagingEnabled: process.env.MESSAGING_ENABLED === "true",
  cronEnabled: process.env.CRON_ENABLED === "true",
  autoMessagingEnabled: process.env.AUTO_MESSAGING_ENABLED === "true",
  waiverEnabled: process.env.WAIVER_ENABLED === "true",
};

export function getFlags(): FeatureFlags {
  return { ...flags };
}

export function setFlag(key: keyof FeatureFlags, value: boolean): void {
  const oldValue = flags[key];
  flags[key] = value;
  logger.info({ key, oldValue, newValue: value }, "Feature flag toggled by admin");
}

/**
 * Check if messaging is enabled (used by twilio.ts and resend.ts).
 */
export function isMessagingEnabled(): boolean {
  return flags.messagingEnabled;
}

/**
 * Check if cron is enabled (used by cron.service.ts).
 */
export function isCronEnabled(): boolean {
  return flags.cronEnabled;
}

/**
 * Check if auto-messaging is enabled (used by cron.service.ts triggerOrQueue).
 */
export function isAutoMessagingEnabled(): boolean {
  return flags.autoMessagingEnabled;
}

/**
 * Check if the Private Coaching liability waiver step is required during
 * onboarding. Off by default — see WAIVER_ENABLED in env.ts.
 */
export function isWaiverEnabled(): boolean {
  return flags.waiverEnabled;
}
