import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as dashboardService from "../services/dashboard.service.js";
import { prisma } from "../lib/prisma.js";
import {
  getActiveNutritionPlan,
  generateNutritionPlan,
  recordNutritionCheckIn,
  getNutritionProgress,
  executeNutritionGoalUpdate,
  calculateMacroCalculatorTargets,
  shuffleMeal,
  searchMealIdeas,
  applyMealIdea,
  getGroceryList,
} from "../services/nutrition.service.js";
import {
  nutritionGoalUpdateSchema,
  macroCalculatorInputSchema,
  shuffleMealSchema,
  mealIdeasSearchSchema,
  applyMealIdeaSchema,
  groceryListQuerySchema,
} from "./schemas/nutrition.schemas.js";
import {
  getUpcomingWeeklyCall,
  bookWeeklyCoachingCall,
  cancelWeeklyCoachingCall,
} from "../services/session-booking.service.js";
import { bookWeeklyCallSchema } from "./schemas/session-booking.schemas.js";

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// GET /dashboard/overview — full dashboard data
router.get(
  "/overview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const data = await dashboardService.getOverview(userId);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/nutrition — active nutrition plan, null if none (non-nutrition tiers)
router.get(
  "/nutrition",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const plan = await getActiveNutritionPlan(userId);

      res.status(200).json({
        success: true,
        data: plan,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/nutrition/regenerate — client-triggered regen of their nutrition plan
router.post(
  "/nutrition/regenerate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
      if (!profile) {
        res.status(404).json({ success: false, error: "Profile not found" });
        return;
      }

      const [nutritionSub, subscription] = await Promise.all([
        prisma.nutritionSubscription.findUnique({ where: { userId } }),
        prisma.subscription.findUnique({ where: { userId }, select: { planTier: true, status: true } }),
      ]);
      const isConciergeEligible = subscription?.planTier === "PRIVATE_COACHING" && subscription?.status === "ACTIVE";
      if (!nutritionSub && !isConciergeEligible) {
        res.status(400).json({ success: false, error: "No active nutrition plan or Private Coaching membership found for this account" });
        return;
      }

      const result = await generateNutritionPlan(profile.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/nutrition/update-goal — "Edit My Preferences" for
// nutrition clients: same executeNutritionGoalUpdate the Jerry chat tool
// already uses, so the client-facing form and the AI adjustment path share
// one code path instead of drifting apart.
router.post(
  "/nutrition/update-goal",
  validate(nutritionGoalUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const result = await executeNutritionGoalUpdate(userId, req.body);

      if (!result.ok) {
        res.status(400).json({ success: false, error: result.message });
        return;
      }

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/addons/macro-calculator/calculate — computes and saves
// calorie/macro targets for a client who's purchased the $23 add-on.
// Recalculable anytime; each call overwrites the saved inputs/targets.
router.post(
  "/addons/macro-calculator/calculate",
  validate(macroCalculatorInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const addon = await prisma.macroCalculatorAddon.findUnique({ where: { userId } });
      if (!addon) {
        res.status(403).json({ success: false, error: "You haven't purchased the Calorie & Macro Calculator yet" });
        return;
      }

      const input = req.body as {
        weightLbs: number; heightInches: number; age: number;
        gender: "male" | "female"; activityLevel: string; goalDirection: "lose" | "maintain" | "gain";
      };
      const targets = calculateMacroCalculatorTargets(input);

      const updated = await prisma.macroCalculatorAddon.update({
        where: { userId },
        data: {
          calories: targets.dailyCalories,
          proteinGrams: targets.proteinG,
          carbGrams: targets.carbsG,
          fatGrams: targets.fatG,
          weightLbs: input.weightLbs,
          heightInches: input.heightInches,
          age: input.age,
          gender: input.gender,
          activityLevel: input.activityLevel,
          goalDirection: input.goalDirection,
        },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/nutrition/progress — streak, this week's adherence, 14-day trend, today's checked items
router.get(
  "/nutrition/progress",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const data = await getNutritionProgress(userId);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/nutrition/checkin — records today's checked-off meal items
router.post(
  "/nutrition/checkin",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const completedIndices = req.body?.completedIndices;
      const totalItems = parseInt(req.body?.totalItems, 10);

      if (!Array.isArray(completedIndices) || completedIndices.some((i) => typeof i !== "number") || isNaN(totalItems)) {
        res.status(400).json({
          success: false,
          error: "completedIndices must be an array of numbers, totalItems must be a number",
        });
        return;
      }

      await recordNutritionCheckIn(userId, completedIndices, totalItems);

      res.status(200).json({ success: true, data: {} });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/nutrition/shuffle-meal — swap one checklist slot for a
// different meal idea that still hits that slot's own calorie/macro numbers.
router.post(
  "/nutrition/shuffle-meal",
  validate(shuffleMealSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { index } = req.body as { index: number };
      const result = await shuffleMeal(userId, index);

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/nutrition/meal-ideas — search up to 3 calorie-capped
// alternatives for one checklist slot ("Meal Ideas" button). Non-persisting —
// the client browses, then applies one via /meal-ideas/apply.
router.post(
  "/nutrition/meal-ideas",
  validate(mealIdeasSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const result = await searchMealIdeas(userId, req.body);

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/nutrition/meal-ideas/apply — persists a chosen Meal Ideas candidate
router.post(
  "/nutrition/meal-ideas/apply",
  validate(applyMealIdeaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const result = await applyMealIdea(userId, req.body);

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/nutrition/grocery-list?people=N — weekly grocery list, the
// plan's sample day scaled to 7 days and household size. Pure read.
router.get(
  "/nutrition/grocery-list",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const parsed = groceryListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: "Invalid people count" });
        return;
      }

      const result = await getGroceryList(userId, parsed.data.people);

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/weekly-call — the client's upcoming weekly coaching call, if any
router.get(
  "/weekly-call",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const booking = await getUpcomingWeeklyCall(userId);

      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/weekly-call — book the included weekly call (Private Coaching only)
router.post(
  "/weekly-call",
  validate(bookWeeklyCallSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const booking = await bookWeeklyCoachingCall(userId, req.body.scheduledDate, req.body.scheduledTime);

      res.status(201).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /dashboard/weekly-call/:id — cancel an upcoming weekly call
router.delete(
  "/weekly-call/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      await cancelWeeklyCoachingCall(userId, req.params.id as string);

      res.status(200).json({ success: true, data: {} });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/week/:weekOffset — week plan + sessions
router.get(
  "/week/:weekOffset",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const weekOffset = parseInt(req.params.weekOffset as string, 10);

      // 12 weeks ahead covers a full 90-day Training plan generated upfront
      // at purchase -- keep in sync with calendar.js's matching cap.
      if (isNaN(weekOffset) || weekOffset < -52 || weekOffset > 12) {
        res.status(400).json({
          success: false,
          error: "weekOffset must be a number between -52 and 12",
        });
        return;
      }

      const data = await dashboardService.getWeekView(userId, weekOffset);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/full-plan — every day of a fixed-term Training plan, start
// date to expiration, in one response (not paginated week by week)
router.get(
  "/full-plan",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const data = await dashboardService.getFullPlan(userId);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/workout/:sessionId — full workout content
router.get(
  "/workout/:sessionId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params.sessionId as string;

      const data = await dashboardService.getWorkoutDetail(userId, sessionId);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/history — paginated past workouts
router.get(
  "/history",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const clampedPage = Math.max(page, 1);
      const clampedLimit = Math.min(Math.max(limit, 1), 100);

      const data = await dashboardService.getWorkoutHistory(userId, clampedPage, clampedLimit);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /dashboard/milestone/acknowledge — dismiss a 30-day milestone report
router.post(
  "/milestone/acknowledge",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const milestoneDay = parseInt(req.body?.milestoneDay, 10);

      if (isNaN(milestoneDay) || milestoneDay < 30) {
        res.status(400).json({
          success: false,
          error: "milestoneDay must be a number >= 30",
        });
        return;
      }

      await dashboardService.acknowledgeMilestone(userId, milestoneDay);

      res.status(200).json({ success: true, data: {} });
    } catch (err) {
      next(err);
    }
  }
);

// GET /dashboard/daily-summary?days=14 — graded daily performance data
router.get(
  "/daily-summary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 14, 7), 30);

      const data = await dashboardService.getDailySummary(userId, days);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
