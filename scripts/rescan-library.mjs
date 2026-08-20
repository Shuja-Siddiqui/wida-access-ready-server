/**
 * One-time script: re-run Grounding DINO + Claude Vision verification on all
 * library images using the API server's detect endpoint (which includes both
 * DINO and the Claude verification pass).
 *
 * Usage:
 *   # Make sure both the DINO sidecar and API server are running, then:
 *   node --env-file=.env scripts/rescan-library.mjs
 *
 * The script routes through the API server so it automatically picks up any
 * changes to detection logic (including Claude verification).
 */

import pg from "pg";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET    = process.env.S3_BUCKET_NAME;
const API_PORT  = process.env.PORT ?? 8080;
// Route through the API server so Claude verification is included
const DETECT_URL = `http://localhost:${API_PORT}/api/images/detect`;
const DELAY_MS  = 200; // short — Claude calls already add per-image latency

async function s3ToBase64(s3Key, contentType = "image/jpeg") {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  const mime = resp.ContentType ?? contentType;
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function detectAndVerify(imageDataUri, labels) {
  const res = await fetch(DETECT_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ image: imageDataUri, labels }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API /detect failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  return json.detections ?? [];
}

async function main() {
  // Check DINO sidecar is ready
  try {
    const health = await fetch("http://localhost:8000/health");
    const { ready } = await health.json();
    if (!ready) {
      console.error("DINO sidecar is not ready yet — wait for the model to load and retry");
      process.exit(1);
    }
  } catch {
    console.error("Cannot reach DINO sidecar at http://localhost:8000 — is it running?");
    process.exit(1);
  }

  // Check API server is reachable and healthy
  try {
    const apiHealth = await fetch(`http://localhost:${API_PORT}/api/healthz`, { signal: AbortSignal.timeout(3000) });
    if (!apiHealth.ok) {
      console.error(`API server health check failed (${apiHealth.status}) — is it running?`);
      process.exit(1);
    }
  } catch {
    console.error(`Cannot reach API server at http://localhost:${API_PORT}/api/healthz — is it running?`);
    process.exit(1);
  }

  console.log(`Routing detections through API server at ${DETECT_URL} (includes Claude verification)\n`);

  const { rows } = await pool.query(
    `SELECT id, s3_key, tags, content_type FROM library WHERE s3_key IS NOT NULL ORDER BY created_at`
  );
  console.log(`Found ${rows.length} library images to re-scan\n`);

  let ok = 0, failed = 0;
  const CONCURRENCY = 2; // process 2 images at a time to stay within time limits

  async function processRow(row) {
    const { id, s3_key, tags, content_type } = row;
    if (!tags?.length) {
      console.log(`[SKIP] ${id} — no tags`);
      return;
    }

    process.stdout.write(`[SCAN] ${id} (${tags.length} tags)… `);
    try {
      const dataUri    = await s3ToBase64(s3_key, content_type ?? "image/jpeg");
      const detections = await detectAndVerify(dataUri, tags);

      await pool.query(
        `UPDATE library SET detection_results = $1 WHERE id = $2`,
        [JSON.stringify({ detections, model: "grounding_dino" }), id]
      );
      console.log(`✓ ${detections.length} boxes`);
      ok++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  // Process CONCURRENCY images at a time
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processRow));
    if (i + CONCURRENCY < rows.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone — ${ok} rescanned, ${failed} failed`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
