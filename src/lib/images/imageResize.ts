/**
 * imageResize.ts
 * Server-side image resizing helpers using Sharp.
 *
 * Generates two variants for every uploaded library image:
 *   • thumbnail  — 200 px wide, JPEG q70  (grid cards, list view)
 *   • medium     — 600 px wide, JPEG q82  (lightbox / full-screen view)
 *
 * Both preserve aspect ratio and never upscale smaller originals.
 */

import sharp from "sharp";

export interface ImageVariants {
  thumbnail: Buffer; // 200 px wide, JPEG
  medium:    Buffer; // 600 px wide, JPEG
}

/**
 * Generate thumbnail + medium JPEG buffers from an arbitrary image buffer.
 * Safe to call with any image format sharp supports (JPEG, PNG, WebP, GIF, AVIF…).
 */
export async function generateImageVariants(original: Buffer): Promise<ImageVariants> {
  const [thumbnail, medium] = await Promise.all([
    sharp(original)
      .resize({ width: 200, withoutEnlargement: true })
      .jpeg({ quality: 70, progressive: true })
      .toBuffer(),
    sharp(original)
      .resize({ width: 600, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer(),
  ]);

  return { thumbnail, medium };
}
