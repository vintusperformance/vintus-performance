import { ExerciseIllustrationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { generateImage, isImageGenConfigured } from "../lib/image-gen.js";
import {
  STARTER_EXERCISE_CUES,
  buildIllustrationPrompt,
  getStarterCue,
} from "../data/exercise-illustration-prompts.js";

/**
 * Exercise Illustration Service — admin-triggered generation with a
 * mandatory human approval gate. An illustration is never shown to a client
 * until an admin explicitly approves it (see workout.routes' own
 * /exercise-illustrations endpoint, which filters to status APPROVED only).
 * Generate-once-then-reuse: one row per exerciseName, shared by every
 * client. Unlike the video pilot it replaces, generation is synchronous —
 * one request produces a final NEEDS_REVIEW or FAILED result, no polling.
 */

export function listStarterExercises() {
  return STARTER_EXERCISE_CUES.map((c) => c.exerciseName);
}

/**
 * Client-facing lookup — one APPROVED illustration url per exercise name.
 * Never includes GENERATING/NEEDS_REVIEW/REJECTED/FAILED rows.
 */
export async function getApprovedIllustrationMap(): Promise<Record<string, string>> {
  const illustrations = await prisma.exerciseIllustration.findMany({
    where: { status: ExerciseIllustrationStatus.APPROVED, imageUrl: { not: null } },
    select: { exerciseName: true, imageUrl: true },
  });

  const map: Record<string, string> = {};
  for (const i of illustrations) {
    if (i.imageUrl) map[i.exerciseName] = i.imageUrl;
  }
  return map;
}

export async function listExerciseIllustrations(status?: ExerciseIllustrationStatus) {
  return prisma.exerciseIllustration.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Generates (or regenerates) the illustration for one exercise. Errors if
 * the exercise isn't in the starter metadata list (buildIllustrationPrompt
 * needs cue data) or the image API isn't configured. Synchronous — resolves
 * once the image is ready, with the row already at its final status.
 */
export async function generateExerciseIllustration(exerciseName: string) {
  if (!isImageGenConfigured()) {
    throw new Error("Image generation is not configured — set OPENAI_ENABLED and OPENAI_API_KEY");
  }

  const cue = getStarterCue(exerciseName);
  if (!cue) {
    throw new Error(
      `No illustration-prompt metadata for "${exerciseName}" — add it to exercise-illustration-prompts.ts first`
    );
  }

  const prompt = buildIllustrationPrompt(cue);
  const result = await generateImage(prompt);

  if (!result.imageUrl) {
    logger.error({ exerciseName, reason: result.failureReason }, "Exercise illustration generation failed");
    return prisma.exerciseIllustration.upsert({
      where: { exerciseName },
      create: { exerciseName, prompt, status: ExerciseIllustrationStatus.FAILED, rejectionNote: result.failureReason },
      update: { prompt, status: ExerciseIllustrationStatus.FAILED, rejectionNote: result.failureReason, imageUrl: null },
    });
  }

  logger.info({ exerciseName }, "Exercise illustration generated");
  return prisma.exerciseIllustration.upsert({
    where: { exerciseName },
    create: { exerciseName, prompt, status: ExerciseIllustrationStatus.NEEDS_REVIEW, imageUrl: result.imageUrl },
    update: { prompt, status: ExerciseIllustrationStatus.NEEDS_REVIEW, imageUrl: result.imageUrl, rejectionNote: null },
  });
}

export async function approveExerciseIllustration(id: string) {
  const illustration = await prisma.exerciseIllustration.findUnique({ where: { id } });
  if (!illustration) throw new Error("Exercise illustration not found");
  if (illustration.status !== ExerciseIllustrationStatus.NEEDS_REVIEW) {
    throw new Error(`Cannot approve an illustration with status ${illustration.status}`);
  }

  return prisma.exerciseIllustration.update({
    where: { id },
    data: { status: ExerciseIllustrationStatus.APPROVED, approvedAt: new Date() },
  });
}

/** Rejects an illustration with a note. Does not auto-regenerate — the admin can hand-edit and re-trigger. */
export async function rejectExerciseIllustration(id: string, note: string) {
  const illustration = await prisma.exerciseIllustration.findUnique({ where: { id } });
  if (!illustration) throw new Error("Exercise illustration not found");

  return prisma.exerciseIllustration.update({
    where: { id },
    data: { status: ExerciseIllustrationStatus.REJECTED, rejectionNote: note },
  });
}

/**
 * Permanently deletes an illustration row. Only allowed for REJECTED or
 * FAILED — never lets an admin accidentally delete something a client could
 * currently be seeing (APPROVED) or that's mid-flight (GENERATING/NEEDS_REVIEW).
 */
export async function deleteExerciseIllustration(id: string) {
  const illustration = await prisma.exerciseIllustration.findUnique({ where: { id } });
  if (!illustration) throw new Error("Exercise illustration not found");
  if (
    illustration.status !== ExerciseIllustrationStatus.REJECTED &&
    illustration.status !== ExerciseIllustrationStatus.FAILED
  ) {
    throw new Error(`Cannot delete an illustration with status ${illustration.status} — only REJECTED or FAILED`);
  }

  await prisma.exerciseIllustration.delete({ where: { id } });
  return { deleted: true };
}

/** Re-submits the same stored prompt for a fresh generation attempt. */
export async function regenerateExerciseIllustration(id: string) {
  const illustration = await prisma.exerciseIllustration.findUnique({ where: { id } });
  if (!illustration) throw new Error("Exercise illustration not found");
  if (!isImageGenConfigured()) {
    throw new Error("Image generation is not configured — set OPENAI_ENABLED and OPENAI_API_KEY");
  }

  const result = await generateImage(illustration.prompt);

  if (!result.imageUrl) {
    return prisma.exerciseIllustration.update({
      where: { id },
      data: { status: ExerciseIllustrationStatus.FAILED, rejectionNote: result.failureReason },
    });
  }

  return prisma.exerciseIllustration.update({
    where: { id },
    data: { status: ExerciseIllustrationStatus.NEEDS_REVIEW, imageUrl: result.imageUrl, rejectionNote: null },
  });
}
