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
Level 1: when library_candidates exist, selected_image_id is REQUIRED — always use a library photo.
Level 2–6: you may set selected_image_id or null. When set, write passage + prompt from photo metadata; when null, write from topic only.
`.trim();

/** @deprecated */
export const WRITING_2020 = WRITING_2020_WITH_LIBRARY;

export function buildWriting2020Slice(hasLibraryCandidates: boolean): string {
  return hasLibraryCandidates ? WRITING_2020_WITH_LIBRARY : WRITING_2020_TEXT;
}
