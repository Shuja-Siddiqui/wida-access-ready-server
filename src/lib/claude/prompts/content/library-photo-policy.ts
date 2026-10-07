/**
 * Canonical library-photo rules for content generation.
 * Import from here — do not duplicate this prose in other prompt files.
 */

export const LIBRARY_PHOTO_NO_LOOK =
  "When has_library_image is false: never say look / picture / photo / what you see / in this image.";

/** Core compose rules whenever a library photo anchors the session. */
export const LIBRARY_PHOTO_CORE = `
LIBRARY PHOTO (when has_library_image or selected_image_id is set)
• image_tags, image_concept, and image_description are planning metadata — ground composed text in 1–3 tag objects; do NOT list the scene like a caption.
• Write a connected mini-story or subject passage that USES tag objects as characters, setting, or evidence.
• Tasks must be answerable from composed text (heard or read), not from viewing the photo alone.
• Do not invent objects absent from image_tags. Do not copy image_description verbatim.
• Never say look / picture / photo / in this image / what you see.
`.trim();

export const ONE_PHOTO_L12_HEADER = `
ONE PHOTO (levels 1–2): one library photograph on screen when has_library_image is true.
Compare = two tag objects in the text, not two image files.
${LIBRARY_PHOTO_NO_LOOK}
`.trim();
