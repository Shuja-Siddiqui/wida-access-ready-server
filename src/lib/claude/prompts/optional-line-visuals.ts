/**
 * Optional keyboard-mark diagrams when no library photo is shown.
 * Library-photo rules live in content/library-photo-policy.ts.
 */

export const OPTIONAL_LINE_VISUALS_BLOCK = `━━ OPTIONAL LINE VISUALS ━━
When has_library_image is false and a few keyboard marks would help (especially L1–2), you MAY add:
  visual          → one short mark string for the item stem
  option_diagrams → array same length as options; string or null per choice
Allowed: stroke counts, plus/equals, simple 2D outlines named in text.
Never: photos, people, scenes, or diagrams harder than the words.`.trim();

export function parseVisual(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseOptionDiagrams(value: unknown): (string | null)[] | undefined {
  return Array.isArray(value) ? (value as (string | null)[]) : undefined;
}
