import { Router } from "express";
import type { Request, Response } from "express";
import { getAuthUrl, exchangeCodeForRefreshToken } from "../lib/google-calendar.js";
import { logger } from "../lib/logger.js";

const router = Router();

// One-time setup only — not gated behind admin JWT auth because Google's
// OAuth redirect is a plain browser navigation with no Authorization header.
// Safe to leave open: completing this flow only returns a refresh token to
// whoever's browser hits /callback — it is never stored automatically. A
// human still has to copy it into Railway's GOOGLE_REFRESH_TOKEN manually.

// GET /api/v1/google-calendar/auth — visit this in a browser to start setup.
router.get("/auth", (_req: Request, res: Response) => {
  res.redirect(getAuthUrl());
});

// GET /api/v1/google-calendar/callback — Google redirects here after consent.
router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("Missing ?code from Google — try the /auth link again.");
    return;
  }

  try {
    const refreshToken = await exchangeCodeForRefreshToken(code);
    logger.info("Google Calendar OAuth completed, refresh token issued");
    res.send(
      `<pre style="font-family: monospace; white-space: pre-wrap; padding: 2rem;">` +
        `Success. Copy this value into Railway's GOOGLE_REFRESH_TOKEN variable:\n\n${refreshToken}\n\n` +
        `Then set GOOGLE_CALENDAR_ENABLED=true, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and ` +
        `GOOGLE_REDIRECT_URI to the same values used for this authorization, and redeploy.</pre>`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Google Calendar OAuth exchange failed");
    res.status(500).send(`OAuth exchange failed: ${message}`);
  }
});

export default router;
