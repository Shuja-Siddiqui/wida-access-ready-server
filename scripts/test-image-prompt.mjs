#!/usr/bin/env node
/**
 * Smoke tests for Image Factory prompt step (Phase 1).
 *
 * Unit (no server):
 *   node scripts/test-image-prompt.mjs --unit
 *
 * API (server + super-admin token):
 *   set AUTH_TOKEN=...
 *   node scripts/test-image-prompt.mjs --api
 */

function resolveNextComplexityStep(last, override, max = 4) {
  if (override != null && Number.isFinite(override)) {
    return Math.min(max, Math.max(0, Math.floor(override)));
  }
  return Math.min(max, Math.max(0, last + 1));
}

function runUnitTests() {
  console.log("Unit: resolveNextComplexityStep");
  const cases = [
    [0, null, 1],
    [4, null, 4],
    [2, 0, 0],
    [1, 3, 3],
  ];
  for (const [last, override, expected] of cases) {
    const got = resolveNextComplexityStep(last, override);
    if (got !== expected) {
      console.error(`FAIL last=${last} override=${override}: expected ${expected}, got ${got}`);
      process.exit(1);
    }
    console.log(`  OK last=${last} override=${override} → ${got}`);
  }
  console.log("Unit tests passed.");
}

async function runApiTest() {
  const token = process.env.AUTH_TOKEN;
  if (!token) {
    console.error("Set AUTH_TOKEN (super admin bearer token) for --api test.");
    process.exit(1);
  }

  const poolsRes = await fetch("http://127.0.0.1:8080/api/admin/images/pools", {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("GET /pools →", poolsRes.status);
  if (!poolsRes.ok) {
    console.error(await poolsRes.text());
    process.exit(1);
  }
  const poolsJson = await poolsRes.json();
  console.log("Pools sample:", JSON.stringify(poolsJson.data?.pools?.slice(0, 2), null, 2));

  const promptRes = await fetch("http://127.0.0.1:8080/api/admin/images/generate-prompt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: "math",
      level: 1,
      keyUse: "Inform",
      focus: "simple fraction blocks",
    }),
  });
  console.log("POST /generate-prompt →", promptRes.status);
  const promptJson = await promptRes.json();
  if (!promptRes.ok) {
    console.error(promptJson);
    process.exit(1);
  }
  console.log("Prompt result:", {
    jobId: promptJson.data?.jobId,
    complexityStep: promptJson.data?.complexityStep,
    hfPrompt: promptJson.data?.hfPrompt?.slice(0, 120) + "...",
    suggestedObjects: promptJson.data?.suggestedObjects,
  });
  console.log("API smoke test passed.");
}

const mode = process.argv.includes("--api") ? "api" : "unit";
if (mode === "api") {
  runApiTest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runUnitTests();
}
