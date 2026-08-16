import { ExerciseIllustrationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { generateImage, isImageGenConfigured } from "../lib/image-gen.js";
import {
  STARTER_EXERCISE_CUES,
  buildIllustrationPrompt,
  buildGenericIllustrationPrompt,
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

export interface IllustrationBoardRow {
  exerciseName: string;
  usageCount: number;
  status: ExerciseIllustrationStatus | "NOT_GENERATED";
  id: string | null;
  imageUrl: string | null;
  rejectionNote: string | null;
  updatedAt: Date | null;
  isCurated: boolean;
}

/**
 * The one spreadsheet-style admin view: every exercise name that needs a
 * decision, in one list. Client plans are freeform AI text, not drawn from
 * the curated ~24, so the row set is a union of three sources — names
 * actually used in real WorkoutSessions (with a usage count, so the
 * highest-impact gaps sort first), the curated starter list (may not be in
 * any session yet), and existing ExerciseIllustration rows of any status
 * (so REJECTED/FAILED attempts stay visible instead of disappearing).
 * Matching across sources is case-insensitive so "Push-Up" and "push-up"
 * collapse into one row.
 */
export async function getIllustrationBoard(): Promise<IllustrationBoardRow[]> {
  const sessions = await prisma.workoutSession.findMany({ select: { content: true } });

  const usageCounts = new Map<string, number>();
  const displayNames = new Map<string, string>();

  for (const session of sessions) {
    const content = session.content as
      | { warmup?: Array<{ exercise?: string }>; main?: Array<{ exercise?: string }>; cooldown?: Array<{ exercise?: string }> }
      | null;
    if (!content || typeof content !== "object") continue;

    const namesInSession = new Set<string>();
    for (const section of ["warmup", "main", "cooldown"] as const) {
      const items = Array.isArray(content[section]) ? content[section]! : [];
      for (const item of items) {
        const name = typeof item?.exercise === "string" ? item.exercise.trim() : "";
        if (name) namesInSession.add(name);
      }
    }

    for (const name of namesInSession) {
      const key = name.toLowerCase();
      usageCounts.set(key, (usageCounts.get(key) || 0) + 1);
      if (!displayNames.has(key)) displayNames.set(key, name);
    }
  }

  for (const name of listStarterExercises()) {
    const key = name.toLowerCase();
    if (!displayNames.has(key)) displayNames.set(key, name);
  }

  const illustrations = await prisma.exerciseIllustration.findMany();
  const illustrationByKey = new Map(illustrations.map((i) => [i.exerciseName.toLowerCase(), i]));
  for (const illustration of illustrations) {
    const key = illustration.exerciseName.toLowerCase();
    if (!displayNames.has(key)) displayNames.set(key, illustration.exerciseName);
  }

  const curatedKeys = new Set(listStarterExercises().map((n) => n.toLowerCase()));

  const rows: IllustrationBoardRow[] = [];
  for (const [key, fallbackDisplayName] of displayNames) {
    const illustration = illustrationByKey.get(key);
    rows.push({
      exerciseName: illustration ? illustration.exerciseName : fallbackDisplayName,
      usageCount: usageCounts.get(key) || 0,
      status: illustration ? illustration.status : "NOT_GENERATED",
      id: illustration ? illustration.id : null,
      imageUrl: illustration ? illustration.imageUrl : null,
      rejectionNote: illustration ? illustration.rejectionNote : null,
      updatedAt: illustration ? illustration.updatedAt : null,
      isCurated: curatedKeys.has(key),
    });
  }

  rows.sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return a.exerciseName.localeCompare(b.exerciseName);
  });

  return rows;
}

/**
 * Generates (or regenerates) the illustration for one exercise. Uses the
 * curated cue-based prompt when this exercise is one of the ~24 starter
 * exercises (better prompt, more consistent results); falls back to a
 * generic name-only prompt for anything else, since client plans use
 * freeform AI-generated exercise names that were never going to fit inside
 * a hand-curated list. Errors only if the image API isn't configured.
 * Synchronous — resolves once the image is ready, with the row already at
 * its final status.
 */
export async function generateExerciseIllustration(exerciseName: string) {
  if (!isImageGenConfigured()) {
    throw new Error("Image generation is not configured — set OPENAI_ENABLED and OPENAI_API_KEY");
  }

  const cue = getStarterCue(exerciseName);
  const prompt = cue ? buildIllustrationPrompt(cue) : buildGenericIllustrationPrompt(exerciseName);
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
