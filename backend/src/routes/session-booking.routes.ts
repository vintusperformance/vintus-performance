import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate.js";
import { createSessionBookingSchema } from "./schemas/session-booking.schemas.js";
import * as sessionBookingService from "../services/session-booking.service.js";

const router = Router();

// POST /session-bookings — public — creates booking + Stripe Checkout session
router.post(
  "/",
  validate(createSessionBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sessionBookingService.createSessionBooking(req.body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
