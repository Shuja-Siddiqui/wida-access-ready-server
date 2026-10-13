/**
 * Shared optional line-visual guidance for every domain.
 * Library photos win when present. Keyboard-mark diagrams are a fallback only.
 */

/** When a library photo is shown, generated text must be about that photo. */
export const LIBRARY_IMAGE_GROUNDS_CONTENT = `━━ LIBRARY PHOTO IS THE TOPIC ━━
has_library_image = true → the student can see a real library photo.
  image_tags, image_description, and image_concept describe THAT photo.
  Your passage / prompt / questions MUST be about what is in the photo.
  If the topic field conflicts with the photo (example: topic is maps, photo is plant and animal cells), IGNORE the topic field and write about the photo.
  Do not invent objects that are not in the tags or description.
has_library_image = false → no photo; follow the topic field as usual.`.trim();

export const OPTIONAL_LINE_VISUALS_BLOCK = `━━ OPTIONAL LINE VISUALS ━━
has_library_image = true  → a real library photo is already on screen. Do not invent a replacement picture. Tiny option marks are still allowed if they help a choice. Text MUST match the photo (see LIBRARY PHOTO IS THE TOPIC).
has_library_image = false → no library photo. If a few keyboard marks would help the student (especially levels 1–2), you MAY add them. If words are enough, omit visuals.

Allowed marks: repeated strokes for counts, plus/equals, simple 2D outlines named in text, short groups the student can compare.
Never: photos, people, scenes, ASCII landscapes, or a diagram that is harder than the words.

JSON (all optional — omit any field you do not need):
  visual            → one short mark string for the whole item (prompt or question stem)
  option_diagrams   → array the same length as options; string or null per choice`.trim();

export function parseVisual(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseOptionDiagrams(value: unknown): (string | null)[] | undefined {
  return Array.isArray(value) ? (value as (string | null)[]) : undefined;
}
