import type { PaidSessionType } from "@prisma/client";

/**
 * Paid Session catalog — the single source of truth for pricing and headcount
 * bounds. Mirrors what's displayed on features.html; if one changes, fix both.
 * Server always computes the charge from this table — never from client input.
 */
export interface PaidSessionConfig {
  label: string;
  durationMinutes: number;
  perPersonCents: number; // price per person; for flat-priced types this IS the total (headcount locked to 1)
  minHeadcount: number;
  maxHeadcount: number;
}

export const PAID_SESSION_CATALOG: Record<PaidSessionType, PaidSessionConfig> = {
  THIRTY_MIN: {
    label: "30-Minute Meeting",
    durationMinutes: 30,
    perPersonCents: 8500, // $85/person
    minHeadcount: 1,
    maxHeadcount: 6,
  },
  SIXTY_MIN_1ON1: {
    label: "60-Min Training Session — 1-on-1",
    durationMinutes: 60,
    perPersonCents: 15000, // $150 flat
    minHeadcount: 1,
    maxHeadcount: 1,
  },
  SIXTY_MIN_1ON2: {
    label: "60-Min Training Session — 1-on-2",
    durationMinutes: 60,
    perPersonCents: 11000, // $110/person
    minHeadcount: 1,
    maxHeadcount: 2,
  },
  SIXTY_MIN_GROUP: {
    label: "60-Min Training Session — Group",
    durationMinutes: 60,
    perPersonCents: 6500, // $65/person
    minHeadcount: 3,
    maxHeadcount: 6,
  },
};

export function computeSessionTotalCents(sessionType: PaidSessionType, headcount: number): number {
  const config = PAID_SESSION_CATALOG[sessionType];
  return config.perPersonCents * headcount;
}

export function isValidHeadcount(sessionType: PaidSessionType, headcount: number): boolean {
  const config = PAID_SESSION_CATALOG[sessionType];
  return Number.isInteger(headcount) && headcount >= config.minHeadcount && headcount <= config.maxHeadcount;
}
