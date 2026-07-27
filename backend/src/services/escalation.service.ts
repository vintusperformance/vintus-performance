import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Escalation Service — handles progressive escalation when clients miss workouts
 * or show concerning patterns. Levels: 1 (nudge), 2 (concern), 3 (book call).
 *
 * This only records the event and computes level — it does not send messages.
 * Per standing policy, anything client-facing is queue-for-approval, not
 * auto-send, so message dispatch stays a separate, explicit step.
 */

/** Create an escalation event for a user */
export async function createEscalation(
  userId: string,
  triggerReason: string,
  level: number
): Promise<{ id: string; level: number }> {
  const event = await prisma.escalationEvent.create({
    data: {
      userId,
      triggerReason,
      escalationLevel: level,
    },
  });

  logger.info({ userId, triggerReason, level, escalationId: event.id }, "Escalation event created");

  return { id: event.id, level: event.escalationLevel };
}

/** Resolve an escalation event */
export async function resolveEscalation(
  escalationId: string,
  resolution: string
): Promise<void> {
  await prisma.escalationEvent.update({
    where: { id: escalationId },
    data: { resolvedAt: new Date(), resolution },
  });

  logger.info({ escalationId, resolution }, "Escalation event resolved");
}

/** Get recent escalation events for a user */
export async function getEscalationHistory(
  userId: string
): Promise<unknown[]> {
  return prisma.escalationEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/** Get the current escalation level for a user (based on unresolved events in last 30 days) */
export async function getCurrentEscalationLevel(
  userId: string
): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const unresolvedCount = await prisma.escalationEvent.count({
    where: {
      userId,
      createdAt: { gte: thirtyDaysAgo },
      resolvedAt: null,
    },
  });

  return Math.min(unresolvedCount + 1, 3);
}
