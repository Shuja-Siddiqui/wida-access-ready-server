#!/usr/bin/env node
/**
 * Quick HF Inference smoke test (no full server needed).
 *
 * Usage:
 *   set HF_TOKEN=hf_...   (Windows)
 *   node scripts/test-hf-image.mjs "A simple classroom illustration"
 */

import "dotenv/config";

const token = process.env.HF_TOKEN ?? process.env.HUGGINGFACE_API_TOKEN ?? "";
const model = process.env.HF_IMAGE_MODEL ?? "black-forest-labs/FLUX.1-schnell";
const prompt = process.argv.slice(2).join(" ") || "Simple flat educational classroom illustration with desk and notebook, no text";

if (!token) {
  console.error("Set HF_TOKEN in api-server/.env or the environment.");
  process.exit(1);
}

const useFal = model.toLowerCase().includes("flux.1-schnell");
const url = useFal
  ? "https://router.huggingface.co/fal-ai/fal-ai/flux/schnell"
  : `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(model)}`;
const width = Number(process.env.HF_IMAGE_WIDTH ?? 768);
const height = Number(process.env.HF_IMAGE_HEIGHT ?? 512);
const steps = Number(process.env.HF_IMAGE_STEPS ?? 4);
const body = useFal
  ? { prompt, image_size: { width, height }, num_inference_steps: steps }
  : {
      inputs: prompt,
      parameters: {
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: Number(process.env.HF_IMAGE_GUIDANCE_SCALE ?? 0),
      },
    };

console.log("POST", url);
console.log("prompt:", prompt.slice(0, 120));

let attempt = 0;
while (attempt < 10) {
  attempt++;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let buf;
    if (ct.includes("application/json")) {
      const json = await res.json();
      const imgUrl = json.images?.[0]?.url;
      if (!imgUrl) {
        console.error("No image URL in response", JSON.stringify(json).slice(0, 300));
        process.exit(1);
      }
      const imgRes = await fetch(imgUrl);
      buf = Buffer.from(await imgRes.arrayBuffer());
    } else {
      buf = Buffer.from(await res.arrayBuffer());
    }
    const out = `hf-test-${Date.now()}.jpg`;
    await import("node:fs/promises").then((fs) => fs.writeFile(out, buf));
    console.log("OK — saved", out, `(${buf.length} bytes)`);
    process.exit(0);
  }

  if (res.status === 503) {
    const json = await res.json().catch(() => ({}));
    const wait = Math.ceil((json.estimated_time ?? 20) * 1000);
    console.log(`Model loading (503), retry in ${wait}ms…`);
    await new Promise((r) => setTimeout(r, wait));
    continue;
  }

  console.error("Failed", res.status, await res.text());
  process.exit(1);
}

console.error("Timed out waiting for model.");
process.exit(1);
