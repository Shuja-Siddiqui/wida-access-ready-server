#!/usr/bin/env node
/**
 * Run one Image Factory cycle against a running API server (HTTP + internal job key).
 *
 * Usage:
 *   node --env-file=.env scripts/image-factory-once.mjs
 *
 * Requires:
 *   - API server running (default http://localhost:8080)
 *   - INTERNAL_JOB_API_KEY
 *   - A super_admin must have opened Image Factory since server boot
 *   - HF_TOKEN or FLUX sidecar
 *
 * Optional env:
 *   IMAGE_FACTORY_CRON_API_URL=http://localhost:8080
 *   IMAGE_FACTORY_CRON_SUBJECT=science
 *   IMAGE_FACTORY_CRON_LEVEL=3
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

const API_BASE = (process.env.IMAGE_FACTORY_CRON_API_URL
  || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, "");
const JOB_KEY = process.env.INTERNAL_JOB_API_KEY?.trim();
const SUBJECT = process.env.IMAGE_FACTORY_CRON_SUBJECT?.trim();
const LEVEL = Number(process.env.IMAGE_FACTORY_CRON_LEVEL || 0);

if (!JOB_KEY) {
  console.error("INTERNAL_JOB_API_KEY is required");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "X-Internal-Job-Key": JOB_KEY,
};

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `HTTP ${res.status} on ${path}`);
  }
  return json.data ?? json;
}

function pickPool(pools) {
  let candidates = pools;
  if (SUBJECT) candidates = candidates.filter((p) => p.subject === SUBJECT);
  if (LEVEL >= 1 && LEVEL <= 6) candidates = candidates.filter((p) => p.level === LEVEL);
  if (candidates.length === 0) {
    throw new Error("No pool matches IMAGE_FACTORY_CRON_SUBJECT / LEVEL");
  }
  candidates.sort((a, b) => {
    if (a.libraryImageCount !== b.libraryImageCount) {
      return a.libraryImageCount - b.libraryImageCount;
    }
    const aT = a.lastGeneratedAt ? Date.parse(a.lastGeneratedAt) : 0;
    const bT = b.lastGeneratedAt ? Date.parse(b.lastGeneratedAt) : 0;
    return aT - bT;
  });
  return candidates[0];
}

async function main() {
  console.log(`Image Factory once → ${API_BASE}`);

  const status = await api("GET", "/admin/images/generate-status");
  if (!status.activeSource) {
    throw new Error("No image generation backend (HF_TOKEN or FLUX sidecar)");
  }
  console.log(`Backend: ${status.activeSource}`);

  const { pools } = await api("GET", "/admin/images/pools");
  const pool = pickPool(pools);
  console.log(`Pool: ${pool.subject} L${pool.level} (${pool.libraryImageCount} images)`);

  const prompt = await api("POST", "/admin/images/generate-prompt", {
    subject: pool.subject,
    level: pool.level,
  });
  console.log(`Prompt job: ${prompt.jobId}`);

  const generated = await api("POST", "/admin/images/generate-from-prompt", {
    prompt: prompt.hfPrompt,
    jobId: prompt.jobId,
  });
  console.log(`Generated via ${generated.source}`);

  const detect = await api("POST", "/admin/images/detect-generated", {
    jobId: prompt.jobId,
    image: generated.image,
  });
  console.log(`DINO: ${detect.detections.length} boxes, tags: ${detect.confirmedTags.join(", ")}`);

  const ingest = await api("POST", "/admin/images/ingest-generated", {
    jobId: prompt.jobId,
    image: generated.image,
    detections: detect.detections,
    generationBackend: generated.source,
  });

  console.log(`Ingested library image: ${ingest.libraryImageId}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
