import { google } from "googleapis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const TIMEZONE = "America/New_York";

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
  if (env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
}

export function isGoogleCalendarConfigured(): boolean {
  return (
    env.GOOGLE_CALENDAR_ENABLED &&
    !!env.GOOGLE_CLIENT_ID &&
    !!env.GOOGLE_CLIENT_SECRET &&
    !!env.GOOGLE_REFRESH_TOKEN
  );
}

/**
 * One-time setup only — builds the URL Anthony visits to grant access.
 * Requests both Calendar and Sheets scopes together so a single refresh
 * token covers both integrations — re-run this flow if either is missing.
 */
export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even on repeat authorization
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

/** One-time setup only — exchanges the OAuth callback code for a refresh token. */
export async function exchangeCodeForRefreshToken(code: string): Promise<string> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned — if you've authorized this app before, revoke access at " +
        "https://myaccount.google.com/permissions and try again (Google only issues a refresh " +
        "token on first-time consent)."
    );
  }
  return tokens.refresh_token;
}

interface CreateEventInput {
  summary: string;
  description: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // "H:MM", 24h, America/New_York
  durationMinutes: number;
  attendeeEmail: string;
}

/** Creates a real event on Anthony's Google Calendar. Silently no-ops if not configured. */
export async function createCalendarEvent(input: CreateEventInput): Promise<void> {
  if (!isGoogleCalendarConfigured()) {
    logger.info(
      { summary: input.summary },
      "Google Calendar not configured — skipping event creation"
    );
    return;
  }

  const [hourStr, minuteStr] = input.scheduledTime.split(":");
  const hour = String(hourStr).padStart(2, "0");
  const minute = String(minuteStr).padStart(2, "0");
  const startDateTime = `${input.scheduledDate}T${hour}:${minute}:00`;

  const startMinutes = parseInt(hourStr ?? "0", 10) * 60 + parseInt(minuteStr ?? "0", 10);
  const endMinutes = startMinutes + input.durationMinutes;
  const endHour = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
  const endMinute = String(endMinutes % 60).padStart(2, "0");
  const endDateTime = `${input.scheduledDate}T${endHour}:${endMinute}:00`;

  try {
    const auth = getOAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.insert({
      calendarId: env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: startDateTime, timeZone: TIMEZONE },
        end: { dateTime: endDateTime, timeZone: TIMEZONE },
        attendees: [{ email: input.attendeeEmail }],
      },
    });

    logger.info({ summary: input.summary, attendeeEmail: input.attendeeEmail }, "Google Calendar event created");
  } catch (err) {
    // A calendar-sync failure should never block a paid booking from completing.
    logger.error({ err, summary: input.summary }, "Failed to create Google Calendar event");
  }
}
