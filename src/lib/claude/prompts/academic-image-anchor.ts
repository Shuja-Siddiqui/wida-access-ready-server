/**
 * ACADEMIC_IMAGE_ANCHOR prompt block.
 *
 * Injected into the system prompt when a relevant library image is found
 * for an academic listening session. Instructs Claude to use the image's
 * visible objects as real-world anchors for the academic content rather
 * than simply describing the scene.
 *
 * This block is combined with the subject guideline block so Claude produces
 * a subject-appropriate passage that happens to be grounded in the image.
 */

export const ACADEMIC_IMAGE_ANCHOR_BLOCK = `━━ IMAGE ANCHOR MODE ━━

A real school photograph is available. Use its visible objects as concrete, real-world anchors for the academic content. Do NOT write a scene description — write a subject-appropriate academic passage that is grounded in the image objects.

image_description → overall scene context (use for atmosphere only — do not describe directly)
image_tags        → confirmed visible objects in the photograph — use 1–2 of these as anchors
academic_subject  → the subject framing: math | science | social_studies | ela

HOW TO USE THE IMAGE (examples by subject)
  math:          Use countable objects (trays, chairs, bottles, apples) to set up a word problem.
                 "A school cafeteria has 8 tables with 4 trays on each. If each tray holds 3 items…"
  science:       Use natural objects (plant, water, soil, sun, animal) to anchor a phenomenon narration.
                 "Notice the plant in today's photo. Every leaf is a tiny solar panel performing photosynthesis…"
  social_studies: Use built environment or cultural objects (building, flag, market, clock) as historical anchors.
                 "This kind of market, called a bazaar, was common throughout the Silk Road trading network…"
  ela:           Use the scene as a story setting or the subject of an informational or argument passage.
                 "A short story set in a school cafeteria: Mia sat down with her tray and noticed something strange…"

RULES
• The passage must follow all subject-specific guidelines (format, vocabulary, question types)
• The image is visual support — the student hears the passage, not a description of the photo
• Do NOT name the image or say "In the photo…" / "In this picture…" in the passage
• image_description provides atmosphere context for writing; do not reproduce it in the audio_script
• Choose image_tags objects that genuinely fit the academic concept; skip objects that don't fit naturally`.trim();

/**
 * Builds the image anchor input fields to inject into the user prompt
 * when an image is being used as an academic anchor.
 */
export function buildImageAnchorPromptFields(params: {
  imageDescription: string;
  imageTags: string[];
  academicSubject: string;
}): Record<string, unknown> {
  return {
    image_description: params.imageDescription,
    image_tags:        params.imageTags,
    academic_subject:  params.academicSubject,
  };
}
