import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * VERIFICATION NEEDED: endpoint paths, header names, and the exact response
 * shape below are reconstructed from secondhand/third-party documentation —
 * Runway's own docs site returned 403 to this environment's fetch tooling and
 * could not be confirmed first-party. Confirm against the real dashboard
 * (https://dev.runwayml.com) once RUNWAY_API_KEY is issued, before relying on
 * this in production. The async submit-then-poll shape (task id back
 * immediately, poll for a terminal status) is the industry-standard pattern
 * for this class of API and is unlikely to be wrong even if field names are.
 */
const RUNWAY_API_BASE_URL = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";

export function isRunwayConfigured(): boolean {
  return env.RUNWAY_ENABLED && !!env.RUNWAY_API_KEY;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
    "X-Runway-Version": RUNWAY_API_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Submits a text-to-video generation task. Returns the Runway task id to
 * poll, or null if unconfigured / the request failed. Never throws — a
 * generation failure must never crash the admin flow that triggered it.
 */
export async function submitVideoGenerationTask(
  prompt: string
): Promise<string | null> {
  if (!isRunwayConfigured()) {
    logger.info("Runway not configured — skipping video generation task");
    return null;
  }

  try {
    const response = await fetch(`${RUNWAY_API_BASE_URL}/text_to_video`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: "veo3.1_fast",
        promptText: prompt,
        // Runway only accepts 4, 6, or 8 (seconds) here — confirmed via a
        // live 400 validation response, not docs (their docs site 403'd
        // this environment's fetch tooling). 8 is the longest allowed.
        duration: 8,
        ratio: "1280:720",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        "Runway video generation task submission failed"
      );
      return null;
    }

    const data = (await response.json()) as { id?: string };
    if (!data.id) {
      logger.error({ data }, "Runway task submission response missing id");
      return null;
    }

    logger.info({ taskId: data.id }, "Runway video generation task submitted");
    return data.id;
  } catch (err) {
    logger.error({ err }, "Runway video generation task submission threw");
    return null;
  }
}

export interface RunwayTaskStatus {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  videoUrl: string | null;
  failureReason: string | null;
}

/**
 * Polls a previously submitted task. Never throws — treats any request
 * failure as a transient PENDING result so callers can retry on the next
 * poll rather than prematurely marking generation FAILED.
 */
export async function checkVideoGenerationStatus(
  taskId: string
): Promise<RunwayTaskStatus> {
  try {
    const response = await fetch(`${RUNWAY_API_BASE_URL}/tasks/${taskId}`, {
      method: "GET",
      headers: authHeaders(),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body, taskId },
        "Runway task status check failed"
      );
      return { status: "PENDING", videoUrl: null, failureReason: null };
    }

    const data = (await response.json()) as {
      status?: string;
      output?: string[];
      failure?: string;
      failureCode?: string;
    };

    if (data.status === "SUCCEEDED") {
      return {
        status: "SUCCEEDED",
        videoUrl: data.output?.[0] ?? null,
        failureReason: null,
      };
    }
    if (data.status === "FAILED") {
      return {
        status: "FAILED",
        videoUrl: null,
        failureReason: data.failure ?? data.failureCode ?? "Unknown failure",
      };
    }
    if (data.status === "RUNNING") {
      return { status: "RUNNING", videoUrl: null, failureReason: null };
    }
    return { status: "PENDING", videoUrl: null, failureReason: null };
  } catch (err) {
    logger.error({ err, taskId }, "Runway task status check threw");
    return { status: "PENDING", videoUrl: null, failureReason: null };
  }
}
