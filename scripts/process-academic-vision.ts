/**
 * One-time batch script: run Claude Vision on all library images
 * that have academic context tags but no vision analysis yet.
 *
 * Usage:
 *   cd api-server
 *   npx tsx scripts/process-academic-vision.ts
 */

import { db } from "../db";
import { libraryTable } from "../db/schema/library";
import { sql, and } from "drizzle-orm";
import { processAcademicVisionForImage } from "../src/lib/claude/academic-vision";

async function main() {
  console.log("=== Academic Vision Batch Processor ===\n");

  // Find images with academic contexts that haven't been processed yet.
  const images = await db
    .select({
      id:          libraryTable.id,
      s3Key:       libraryTable.s3Key,
      contentType: libraryTable.contentType,
      contexts:    libraryTable.contexts,
      academicVision: libraryTable.academicVision,
    })
    .from(libraryTable)
    .where(
      sql`EXISTS (
        SELECT 1 FROM unnest(${libraryTable.contexts}) AS ctx
        WHERE ctx LIKE 'academic:%'
      )`
    );

  const unprocessed = images.filter(
    (img) => Object.keys(img.academicVision ?? {}).length === 0,
  );
  const already    = images.length - unprocessed.length;

  console.log(`Found ${images.length} images with academic contexts.`);
  console.log(`Already processed: ${already}`);
  console.log(`To process now:    ${unprocessed.length}\n`);

  let succeeded = 0;
  let failed    = 0;

  for (const img of unprocessed) {
    const subjects = img.contexts
      .filter((c) => c.startsWith("academic:"))
      .map((c) => c.replace("academic:", ""));

    console.log(`[${img.id.slice(0, 8)}] Processing subjects: ${subjects.join(", ")} (s3Key: ${img.s3Key.split("/").pop()})`);

    try {
      const results = await processAcademicVisionForImage(
        img.id,
        img.s3Key,
        img.contexts,
        undefined,
        img.contentType ?? "image/jpeg",
      );

      for (const [subject, r] of Object.entries(results)) {
        console.log(`  ✓ ${subject}: "${r.concept}"`);
      }

      if (Object.keys(results).length > 0) {
        succeeded++;
      } else {
        console.log("  ⚠ No results produced.");
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ Failed: ${String(err)}`);
      failed++;
    }

    // Small delay between images to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Done: ${succeeded} succeeded, ${failed} failed ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
