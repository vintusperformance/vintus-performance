import { ExerciseVideoStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  submitVideoGenerationTask,
  checkVideoGenerationStatus,
  isRunwayConfigured,
} from "../lib/runway.js";
import {
  STARTER_EXERCISE_CUES,
  buildVideoPrompt,
  getStarterCue,
  type TrainerGender,
} from "../data/exercise-video-prompts.js";

/**
 * Exercise Video Service — admin-triggered generation with a mandatory human
 * approval gate. A video is never shown to a client until an admin explicitly
 * approves it (see workout.routes' /exercise-videos endpoint, which filters
 * to status APPROVED only). Generate-once-then-reuse: two rows per
 * exerciseName (one per TrainerGender), never one per client.
 */

export function listStarterExercises() {
  return STARTER_EXERCISE_CUES.map((c) => c.exerciseName);
}

/**
 * Client-facing lookup — one APPROVED video url per exercise name, picking
 * whichever clip's trainerGender is the *opposite* of the client's own
 * gender when both exist, falling back to whichever is approved if only one
 * gender has been generated so far (so the feature doesn't disappear during
 * partial library rollout). clientGender may be null/undefined (gender is
 * an optional onboarding field) — falls back to any approved video.
 * Never includes GENERATING/NEEDS_REVIEW/REJECTED/FAILED rows.
 */
export async function getApprovedVideoMap(
  clientGender?: string | null
): Promise<Record<string, string>> {
  const videos = await prisma.exerciseVideo.findMany({
    where: { status: ExerciseVideoStatus.APPROVED, videoUrl: { not: null } },
    select: { exerciseName: true, trainerGender: true, videoUrl: true },
  });

  const opposite = clientGender === "male" ? "female" : clientGender === "female" ? "male" : null;

  // Track which gender is currently chosen per exercise so an opposite-gender
  // match found later in iteration order can still override an earlier
  // same-gender fallback pick.
  const chosenGender: Record<string, string> = {};
  const map: Record<string, string> = {};

  for (const v of videos) {
    if (!v.videoUrl) continue;
    const alreadyOptimal = chosenGender[v.exerciseName] === opposite;
    if (alreadyOptimal) continue;

    const isOpposite = opposite !== null && v.trainerGender === opposite;
    if (map[v.exerciseName] === undefined || isOpposite) {
      map[v.exerciseName] = v.videoUrl;
      chosenGender[v.exerciseName] = v.trainerGender;
    }
  }

  return map;
}

export async function listExerciseVideos(status?: ExerciseVideoStatus) {
  return prisma.exerciseVideo.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Kicks off generation for one exercise + trainer gender (two independent
 * rows exist per exercise — one male, one female). Errors if the exercise
 * isn't in the starter metadata list (buildVideoPrompt needs cue data) or
 * Runway isn't configured. Creates the row as GENERATING; a caller must poll
 * separately via pollPendingGenerations since generation is async on
 * Runway's side.
 */
export async function generateExerciseVideo(exerciseName: string, trainerGender: TrainerGender) {
  if (!isRunwayConfigured()) {
    throw new Error("Runway is not configured — set RUNWAY_ENABLED and RUNWAY_API_KEY");
  }

  const cue = getStarterCue(exerciseName);
  if (!cue) {
    throw new Error(
      `No video-prompt metadata for "${exerciseName}" — add it to exercise-video-prompts.ts first`
    );
  }

  const prompt = buildVideoPrompt(cue, trainerGender);
  const taskId = await submitVideoGenerationTask(prompt);
  if (!taskId) {
    throw new Error("Runway task submission failed — check server logs");
  }

  const record = await prisma.exerciseVideo.upsert({
    where: { exerciseName_trainerGender: { exerciseName, trainerGender } },
    create: {
      exerciseName,
      trainerGender,
      prompt,
      runwayTaskId: taskId,
      status: ExerciseVideoStatus.GENERATING,
    },
    update: {
      prompt,
      runwayTaskId: taskId,
      status: ExerciseVideoStatus.GENERATING,
      videoUrl: null,
      rejectionNote: null,
    },
  });

  logger.info({ exerciseName, trainerGender, taskId }, "Exercise video generation started");
  return record;
}

/**
 * Polls Runway for every row currently GENERATING and updates status/videoUrl
 * accordingly. Intended to be called on an interval (cron) or on-demand from
 * the admin review screen — safe to call repeatedly, no-ops on rows that
 * aren't GENERATING or that have no runwayTaskId.
 */
export async function pollPendingGenerations() {
  const pending = await prisma.exerciseVideo.findMany({
    where: { status: ExerciseVideoStatus.GENERATING, runwayTaskId: { not: null } },
  });

  const results = [];
  for (const video of pending) {
    const taskId = video.runwayTaskId;
    if (!taskId) continue;

    const result = await checkVideoGenerationStatus(taskId);

    if (result.status === "SUCCEEDED") {
      const updated = await prisma.exerciseVideo.update({
        where: { id: video.id },
        data: {
          status: ExerciseVideoStatus.NEEDS_REVIEW,
          videoUrl: result.videoUrl,
        },
      });
      results.push(updated);
      logger.info({ exerciseName: video.exerciseName }, "Exercise video generation succeeded");
    } else if (result.status === "FAILED") {
      const updated = await prisma.exerciseVideo.update({
        where: { id: video.id },
        data: {
          status: ExerciseVideoStatus.FAILED,
          rejectionNote: result.failureReason,
        },
      });
      results.push(updated);
      logger.error(
        { exerciseName: video.exerciseName, reason: result.failureReason },
        "Exercise video generation failed"
      );
    }
    // PENDING/RUNNING: leave as-is, check again next poll.
  }

  return results;
}

export async function approveExerciseVideo(id: string) {
  const video = await prisma.exerciseVideo.findUnique({ where: { id } });
  if (!video) throw new Error("Exercise video not found");
  if (video.status !== ExerciseVideoStatus.NEEDS_REVIEW) {
    throw new Error(`Cannot approve a video with status ${video.status}`);
  }

  return prisma.exerciseVideo.update({
    where: { id },
    data: { status: ExerciseVideoStatus.APPROVED, approvedAt: new Date() },
  });
}

/**
 * Rejects a video with a note and immediately kicks off a fresh generation
 * attempt using the same stored prompt (a coach can hand-edit the prompt
 * between reject and regenerate via a separate call if the wording itself
 * needs to change — this just re-submits what's on file).
 */
export async function rejectExerciseVideo(id: string, note: string) {
  const video = await prisma.exerciseVideo.findUnique({ where: { id } });
  if (!video) throw new Error("Exercise video not found");

  return prisma.exerciseVideo.update({
    where: { id },
    data: { status: ExerciseVideoStatus.REJECTED, rejectionNote: note },
  });
}

/**
 * Permanently deletes a video row. Only allowed for REJECTED or FAILED —
 * never lets an admin accidentally delete something a client could
 * currently be seeing (APPROVED) or that's mid-flight (GENERATING/NEEDS_REVIEW).
 */
export async function deleteExerciseVideo(id: string) {
  const video = await prisma.exerciseVideo.findUnique({ where: { id } });
  if (!video) throw new Error("Exercise video not found");
  if (video.status !== ExerciseVideoStatus.REJECTED && video.status !== ExerciseVideoStatus.FAILED) {
    throw new Error(`Cannot delete a video with status ${video.status} — only REJECTED or FAILED`);
  }

  await prisma.exerciseVideo.delete({ where: { id } });
  return { deleted: true };
}

export async function regenerateExerciseVideo(id: string) {
  const video = await prisma.exerciseVideo.findUnique({ where: { id } });
  if (!video) throw new Error("Exercise video not found");
  if (!isRunwayConfigured()) {
    throw new Error("Runway is not configured — set RUNWAY_ENABLED and RUNWAY_API_KEY");
  }

  const taskId = await submitVideoGenerationTask(video.prompt);
  if (!taskId) {
    throw new Error("Runway task submission failed — check server logs");
  }

  return prisma.exerciseVideo.update({
    where: { id },
    data: {
      status: ExerciseVideoStatus.GENERATING,
      runwayTaskId: taskId,
      videoUrl: null,
    },
  });
}
