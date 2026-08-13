import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { completeSessionSchema, skipSessionSchema, rescheduleSessionSchema, swapExerciseSchema, rebuildPreferencesSchema } from "./schemas/workout.schemas.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { updateAdherence } from "../services/adherence.service.js";
import {
  adjustForMissedStrengthDay,
  adjustForMissedEnduranceDay,
  getSwapAlternatives,
  applyExerciseSwap,
  rebuildPlanFromPreferences,
} from "../services/workout.service.js";
import { getWeekView } from "../services/dashboard.service.js";
import { getApprovedVideoMap } from "../services/exercise-video.service.js";

const router = Router();

// All workout routes require authentication
router.use(authenticate);

// GET /workout/exercise-videos — approved "show me how" demo clips, keyed by
// exercise name. Not per-user data, but the choice of male vs. female clip
// per exercise depends on the requesting client's own gender (opposite-sex
// match), so this does read their profile.
router.get(
  "/exercise-videos",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const profile = await prisma.athleteProfile.findUnique({
        where: { userId },
        select: { gender: true },
      });
      const videos = await getApprovedVideoMap(profile?.gender);
      res.status(200).json({ success: true, data: videos });
    } catch (err) {
      next(err);
    }
  }
);

// POST /workout/:sessionId/complete — mark session completed
router.post(
  "/:sessionId/complete",
  validate(completeSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;

      // Verify session belongs to this user
      const profile = await prisma.athleteProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        res.status(404).json({ success: false, error: "Athlete profile not found" });
        return;
      }

      const session = await prisma.workoutSession.findFirst({
        where: {
          id: sessionId,
          workoutPlan: { athleteProfileId: profile.id },
        },
        include: { workoutPlan: true },
      });

      if (!session) {
        res.status(404).json({ success: false, error: "Workout session not found" });
        return;
      }

      if (session.status === "COMPLETED") {
        res.status(409).json({ success: false, error: "Session already completed" });
        return;
      }

      const { actualDuration, rpe, athleteNotes } = req.body;

      // Estimate TSS from RPE and duration
      const estimatedTSS = Math.round(actualDuration * (rpe / 10) * 1.5);

      // Atomically update only if status is still SCHEDULED — prevents race
      // conditions where two concurrent requests could double-count TSS.
      const updateResult = await prisma.workoutSession.updateMany({
        where: { id: sessionId, status: "SCHEDULED" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          actualDuration,
          rpe,
          athleteNotes: athleteNotes ?? null,
          actualTSS: estimatedTSS,
        },
      });

      if (updateResult.count === 0) {
        // Another request already completed (or changed) this session
        res.status(409).json({ success: false, error: "Session already completed" });
        return;
      }

      // Re-fetch the updated session for the response
      const updated = await prisma.workoutSession.findUnique({
        where: { id: sessionId },
      });

      // Update plan actualTSS
      await prisma.workoutPlan.update({
        where: { id: session.workoutPlanId },
        data: {
          actualTSS: { increment: estimatedTSS },
        },
      });

      // Update adherence for this week
      await updateAdherence(userId, session.scheduledDate);

      logger.info(
        { userId, sessionId, rpe, actualDuration },
        "Workout session completed"
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /workout/:sessionId/skip — mark session skipped
router.post(
  "/:sessionId/skip",
  validate(skipSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;

      const profile = await prisma.athleteProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        res.status(404).json({ success: false, error: "Athlete profile not found" });
        return;
      }

      const session = await prisma.workoutSession.findFirst({
        where: {
          id: sessionId,
          workoutPlan: { athleteProfileId: profile.id },
        },
      });

      if (!session) {
        res.status(404).json({ success: false, error: "Workout session not found" });
        return;
      }

      if (session.status === "COMPLETED") {
        res.status(409).json({ success: false, error: "Cannot skip a completed session" });
        return;
      }

      const updated = await prisma.workoutSession.update({
        where: { id: sessionId },
        data: {
          status: "SKIPPED",
          athleteNotes: req.body.reason ?? null,
        },
      });

      // Update adherence for this week
      await updateAdherence(userId, session.scheduledDate);

      logger.info({ userId, sessionId }, "Workout session skipped");

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /workout/:sessionId/reschedule — move a scheduled workout to a new date
router.post(
  "/:sessionId/reschedule",
  validate(rescheduleSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;
      const { newDate } = req.body;

      const profile = await prisma.athleteProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        res.status(404).json({ success: false, error: "Athlete profile not found" });
        return;
      }

      const session = await prisma.workoutSession.findFirst({
        where: {
          id: sessionId,
          workoutPlan: { athleteProfileId: profile.id },
        },
        include: { workoutPlan: true },
      });

      if (!session) {
        res.status(404).json({ success: false, error: "Workout session not found" });
        return;
      }

      if (session.status !== "SCHEDULED") {
        res.status(409).json({ success: false, error: "Can only reschedule scheduled workouts" });
        return;
      }

      // Validate newDate is today or future
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const targetDate = new Date(newDate + "T00:00:00.000Z");

      if (targetDate < today) {
        res.status(400).json({ success: false, error: "Cannot reschedule to a past date" });
        return;
      }

      // Validate newDate is within plan date range
      const plan = session.workoutPlan;
      if (targetDate < new Date(plan.startDate) || targetDate > new Date(plan.endDate)) {
        res.status(400).json({ success: false, error: "Date is outside your current plan range" });
        return;
      }

      const oldDateStr = new Date(session.scheduledDate).toISOString().split("T")[0];

      const updated = await prisma.workoutSession.update({
        where: { id: sessionId },
        data: {
          scheduledDate: targetDate,
          originalDate: session.originalDate ?? session.scheduledDate,
        },
      });

      // Log the adjustment
      await prisma.adjustmentLog.create({
        data: {
          workoutPlanId: session.workoutPlanId,
          triggerEvent: "manual_reschedule",
          triggerData: { sessionId, fromDate: oldDateStr, toDate: newDate } as unknown as Prisma.InputJsonValue,
          adjustmentType: "reschedule",
          description: `Manually rescheduled "${session.title}" from ${oldDateStr} to ${newDate}.`,
          affectedSessions: [sessionId],
        },
      });

      logger.info({ userId, sessionId, fromDate: oldDateStr, toDate: newDate }, "Workout manually rescheduled");

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /workout/:sessionId/replan — mark missed + trigger adaptive replanning
router.post(
  "/:sessionId/replan",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;

      const profile = await prisma.athleteProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        res.status(404).json({ success: false, error: "Athlete profile not found" });
        return;
      }

      const session = await prisma.workoutSession.findFirst({
        where: {
          id: sessionId,
          workoutPlan: { athleteProfileId: profile.id },
        },
        include: { workoutPlan: true },
      });

      if (!session) {
        res.status(404).json({ success: false, error: "Workout session not found" });
        return;
      }

      if (session.status === "COMPLETED") {
        res.status(409).json({ success: false, error: "Cannot replan a completed session" });
        return;
      }

      if (session.status === "MISSED") {
        res.status(409).json({ success: false, error: "Session already marked as missed" });
        return;
      }

      // Determine session type and call appropriate adjustment
      const sType = session.sessionType;

      if (sType.startsWith("STRENGTH")) {
        await adjustForMissedStrengthDay(session.workoutPlanId, sessionId);
      } else if (sType.startsWith("ENDURANCE")) {
        await adjustForMissedEnduranceDay(session.workoutPlanId, sessionId);
      } else {
        // HIIT, MOBILITY_RECOVERY, ACTIVE_RECOVERY, REST, CUSTOM — just mark missed
        await prisma.workoutSession.update({
          where: { id: sessionId },
          data: { status: "MISSED" },
        });

        await prisma.adjustmentLog.create({
          data: {
            workoutPlanId: session.workoutPlanId,
            triggerEvent: "missed_workout",
            triggerData: { sessionId, sessionType: sType } as unknown as Prisma.InputJsonValue,
            adjustmentType: "skip_no_replan",
            description: `Marked ${sType} session as missed. No replanning needed for this session type.`,
            affectedSessions: [sessionId],
          },
        });
      }

      // Update adherence
      await updateAdherence(userId, session.scheduledDate);

      logger.info({ userId, sessionId, sessionType: sType }, "Workout replanned after miss");

      // Return updated week data so frontend can re-render
      const weekData = await getWeekView(userId, 0);

      res.status(200).json({ success: true, data: weekData });
    } catch (err) {
      next(err);
    }
  }
);

// GET /workout/:sessionId/main/:index/alternatives — pre-approved swap options
router.get(
  "/:sessionId/main/:index/alternatives",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;
      const index = parseInt(req.params.index as string, 10);

      if (isNaN(index) || index < 0) {
        res.status(400).json({ success: false, error: "Invalid exercise index" });
        return;
      }

      const data = await getSwapAlternatives(userId, sessionId, index);

      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// POST /workout/:sessionId/main/:index/swap — apply a pre-approved swap
router.post(
  "/:sessionId/main/:index/swap",
  validate(swapExerciseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;
      const index = parseInt(req.params.index as string, 10);

      if (isNaN(index) || index < 0) {
        res.status(400).json({ success: false, error: "Invalid exercise index" });
        return;
      }

      const updated = await applyExerciseSwap(userId, sessionId, index, req.body.exercise);

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /workout/rebuild-preferences — "Edit My Preferences": set standing
// rest days and/or swap two upcoming days, then rebuild the remaining plan
// around it so it still tracks toward the client's actual goal.
router.post(
  "/rebuild-preferences",
  validate(rebuildPreferencesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const profile = await prisma.athleteProfile.findUnique({ where: { userId } });

      if (!profile) {
        res.status(404).json({ success: false, error: "Athlete profile not found" });
        return;
      }

      const result = await rebuildPlanFromPreferences(profile.id, req.body);

      logger.info(
        { userId, profileId: profile.id, ...result },
        "Client rebuilt plan from Edit My Preferences"
      );

      // Return updated week data so the frontend can re-render immediately
      const weekData = await getWeekView(userId, 0);

      res.status(200).json({ success: true, data: { ...result, week: weekData } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
