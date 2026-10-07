export const WRITING_2020_TEXT = `
WRITING — APPLY THE SIX FRAMEWORK PARTS (text-only — no library photo)
This call is writing (expressive). The student WRITES from topic and academic_subject.
Job from language_expectations + language_functions. English hardness from framework.pld only.
Do not say look, picture, photo, or what you see.
`.trim();

export const WRITING_2020_WITH_LIBRARY = `
WRITING — APPLY THE SIX FRAMEWORK PARTS (library photo may be used)
This call is writing (expressive). The student WRITES.
Job from language_expectations + language_functions. English hardness from framework.pld only.
Levels 1–2: when library_candidates exist, selected_image_id is REQUIRED — always use a library photo for this Standard Framework subject.
Write passage + prompt from that photo's metadata; do not describe a scene that is not in the selected photo.
When library_candidates is empty, write from topic only (no look/picture language).
`.trim();

/** @deprecated */
export const WRITING_2020 = WRITING_2020_WITH_LIBRARY;

export function buildWriting2020Slice(hasLibraryCandidates: boolean): string {
  return hasLibraryCandidates ? WRITING_2020_WITH_LIBRARY : WRITING_2020_TEXT;
}
