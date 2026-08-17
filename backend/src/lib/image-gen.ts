import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Endpoint, size/quality/output_format/output_compression parameters below
 * are confirmed against OpenAI's live gpt-image-1 API reference (checked
 * 2026-08). 1024x1024 is gpt-image-1's smallest supported square size (no
 * 512x512 option exists for this model) so pixel dimensions can't be
 * shrunk -- but output_format defaults to lossless PNG, which is what
 * actually filled the production Postgres volume (images are stored as
 * base64 text, see the storage note below). webp at compression=80 cuts
 * real file size well below PNG with no meaningful visual quality loss --
 * important since an admin visually reviews every image for correct form
 * before approval, so quality itself (kept at "medium") isn't touched.
 */
const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export function isImageGenConfigured(): boolean {
  return env.OPENAI_ENABLED && !!env.OPENAI_API_KEY;
}

export interface ImageGenResult {
  imageUrl: string | null;
  failureReason: string | null;
}

/**
 * Generates one image synchronously (unlike the old Runway video pipeline,
 * OpenAI's image API returns the result in the same request — no task id to
 * poll). Never throws — a generation failure must never crash the admin flow
 * that triggered it, same discipline as the video lib it replaces.
 *
 * Returns a data: URI (when the API responds with base64) rather than a
 * hosted URL where possible — no CDN/object storage is provisioned for this
 * feature yet, and provider-hosted image URLs are often short-lived, which
 * would silently break an already-approved illustration. A data URI is
 * self-contained and never expires. Revisit with real object storage if the
 * illustration library grows well past the curated ~24-exercise set.
 */
export async function generateImage(prompt: string): Promise<ImageGenResult> {
  if (!isImageGenConfigured()) {
    logger.info("Image generation not configured — skipping");
    return { imageUrl: null, failureReason: "Image generation is not configured" };
  }

  try {
    const response = await fetch(`${OPENAI_API_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        quality: "medium",
        output_format: "webp",
        output_compression: 80,
        n: 1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Image generation request failed");
      return { imageUrl: null, failureReason: `HTTP ${response.status}: ${body.slice(0, 300)}` };
    }

    const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (!first) {
      logger.error({ data }, "Image generation response missing data");
      return { imageUrl: null, failureReason: "Image generation response had no image data" };
    }

    if (first.b64_json) {
      return { imageUrl: `data:image/webp;base64,${first.b64_json}`, failureReason: null };
    }
    if (first.url) {
      return { imageUrl: first.url, failureReason: null };
    }
    return { imageUrl: null, failureReason: "Image generation response had neither b64_json nor url" };
  } catch (err) {
    logger.error({ err }, "Image generation request threw");
    return { imageUrl: null, failureReason: (err as Error).message };
  }
}
