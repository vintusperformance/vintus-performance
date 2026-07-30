import { google } from "googleapis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

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

export function isGoogleSheetsConfigured(): boolean {
  return (
    env.GOOGLE_SHEETS_ENABLED &&
    !!env.GOOGLE_CLIENT_ID &&
    !!env.GOOGLE_CLIENT_SECRET &&
    !!env.GOOGLE_REFRESH_TOKEN &&
    !!env.GOOGLE_SHEETS_SPREADSHEET_ID
  );
}

/**
 * Appends a row to the given tab of the CRM spreadsheet. Postgres remains the
 * system of record for enforcement (e.g. the one-time free-consult check) —
 * this is a live, human-readable mirror only. Silently no-ops if not
 * configured, and never throws, so a Sheets failure can never block a real
 * booking, lead, or survey submission from completing.
 */
export async function appendSheetRow(tabName: string, values: (string | number)[]): Promise<void> {
  if (!isGoogleSheetsConfigured()) {
    logger.info({ tabName }, "Google Sheets not configured — skipping row append");
    return;
  }

  try {
    const auth = getOAuthClient();
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${tabName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    });

    logger.info({ tabName }, "Row appended to Google Sheets CRM");
  } catch (err) {
    logger.error({ err, tabName }, "Failed to append row to Google Sheets");
  }
}
