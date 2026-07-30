import { google } from "googleapis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function parseServiceAccountKey(): ServiceAccountKey | null {
  if (!env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY) return null;
  try {
    const parsed = JSON.parse(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch (err) {
    logger.error({ err }, "GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY is not valid JSON");
    return null;
  }
}

function getAuthClient() {
  const key = parseServiceAccountKey();
  if (!key) return null;
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function isGoogleSheetsConfigured(): boolean {
  return (
    env.GOOGLE_SHEETS_ENABLED &&
    !!env.GOOGLE_SHEETS_SPREADSHEET_ID &&
    !!parseServiceAccountKey()
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
  const auth = getAuthClient();
  if (!isGoogleSheetsConfigured() || !auth) {
    logger.info({ tabName }, "Google Sheets not configured — skipping row append");
    return;
  }

  try {
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
