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
} from "../data/exercise-video-prompts.js";

/**
 * Exercise Video Service — admin-triggered generation with a mandatory human
 * approval gate. A video is never shown to a client until an admin explicitly
 * approves it (see exercise-video.routes / client player, which filter to
 * status APPROVED only). Generate-once-then-reuse: one row per exerciseName.
 */

export function listStarterExercises() {
  return STARTER_EXERCISE_CUES.map((c) => c.exerciseName);
}

/**
 * Client-facing lookup — every APPROVED video, keyed by exercise name. Never
 * includes GENERATING/NEEDS_REVIEW/REJECTED/FAILED rows; those must never
 * reach a client regardless of what the admin screens show.
 */
export async function getApprovedVideoMap(): Promise<Record<string, string>> {
  const videos = await prisma.exerciseVideo.findMany({
    where: { status: ExerciseVideoStatus.APPROVED, videoUrl: { not: null } },
    select: { exerciseName: true, videoUrl: true },
  });

  const map: Record<string, string> = {};
  for (const v of videos) {
    if (v.videoUrl) map[v.exerciseName] = v.videoUrl;
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
 * Kicks off generation for one exercise. Errors if the exercise isn't in the
 * starter metadata list (buildVideoPrompt needs cue data) or Runway isn't
 * configured. Creates the row as GENERATING; a caller must poll separately
 * via pollExerciseVideo since generation is async on Runway's side.
 */
export async function generateExerciseVideo(exerciseName: string) {
  if (!isRunwayConfigured()) {
    throw new Error("Runway is not configured — set RUNWAY_ENABLED and RUNWAY_API_KEY");
  }

  const cue = getStarterCue(exerciseName);
  if (!cue) {
    throw new Error(
      `No video-prompt metadata for "${exerciseName}" — add it to exercise-video-prompts.ts first`
    );
  }

  const prompt = buildVideoPrompt(cue);
  const taskId = await submitVideoGenerationTask(prompt);
  if (!taskId) {
    throw new Error("Runway task submission failed — check server logs");
  }

  const record = await prisma.exerciseVideo.upsert({
    where: { exerciseName },
    create: {
      exerciseName,
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

  logger.info({ exerciseName, taskId }, "Exercise video generation started");
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
