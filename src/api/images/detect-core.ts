/**
 * Shared detection logic — Grounding DINO sidecar only.
 *
 * POST /detect on the Python sidecar (DINO_SIDECAR_URL, default http://localhost:8000).
 */

import { config } from "../../config";
import { logger } from "../../config/logger";
import { verifyDetections } from "../../lib/visionVerify";

const SIDECAR_TIMEOUT_MS = 180_000; // CPU batches can be slow over the network

function sidecarUrl(): string {
  return config.dino.sidecarUrl;
}

function sidecarHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  if (config.dino.sidecarToken) {
    headers.Authorization = `Bearer ${config.dino.sidecarToken}`;
  }
  return headers;
}

// ── Sidecar health check ──────────────────────────────────────────────────────

async function isSidecarReady(): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarUrl()}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { ready?: boolean };
    return json.ready === true;
  } catch {
    return false;
  }
}

/**
 * Wait up to `maxWaitMs` for the sidecar to become ready.
 * Returns true if ready, false if timed out.
 */
async function waitForSidecar(maxWaitMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isSidecarReady()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── Grounding DINO sidecar ────────────────────────────────────────────────────

async function detectViaSidecar(
  imageDataUri: string,
  labels: string[],
): Promise<NormalisedDetection[]> {
  const res = await fetch(`${sidecarUrl()}/detect`, {
    method: "POST",
    headers: sidecarHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ image: imageDataUri, labels }),
    signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Grounding DINO sidecar /detect failed (${res.status}): ${txt}`);
  }
  const data = (await res.json()) as { detections: NormalisedDetection[] };
  return data.detections ?? [];
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface NormalisedDetection {
  label:  string;
  score:  number;
  box:    { x: number; y: number; width: number; height: number };
  /** "dino" for Grounding DINO boxes, "claude" for Claude-estimated boxes. Absent on legacy rows. */
  source?: "dino" | "claude";
}

export type DetectionModel = "grounding_dino";

export interface DetectionResult {
  detections: NormalisedDetection[];
  model: DetectionModel;
}

let _sidecarReady: boolean | null = null;

/**
 * Detect objects in a base64 data-URI image using Grounding DINO.
 * Throws if the sidecar is not running.
 */
export async function runDetection(
  imageDataUri: string,
  labels: string[],
): Promise<DetectionResult> {
  const ready = _sidecarReady ?? await waitForSidecar();
  _sidecarReady = ready;

  if (!ready) {
    throw new Error(
      `Grounding DINO sidecar is not ready at ${sidecarUrl()}. Start or deploy the sidecar and retry.`,
    );
  }

  try {
    logger.info({ labels }, "detect: using Grounding DINO sidecar");
    const raw = await detectViaSidecar(imageDataUri, labels);
    logger.info({ found: raw.map((d) => d.label) }, "detect: DINO done, running Claude verification");

    const detections = await verifyDetections(imageDataUri, raw);
    logger.info({ found: detections.map((d) => d.label) }, "detect: done");
    return { detections, model: "grounding_dino" };
  } catch (err) {
    _sidecarReady = null; // re-check next call
    throw err;
  }
}
