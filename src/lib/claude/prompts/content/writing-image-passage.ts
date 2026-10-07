/** Domain-specific library-photo notes + passage length targets. Core rules: library-photo-policy.ts */

import { LIBRARY_PHOTO_CORE } from "./library-photo-policy";

export const LIBRARY_IMAGE_STORY_PASSAGE_RULES = LIBRARY_PHOTO_CORE;

export const WRITING_IMAGE_PASSAGE_RULES = `
IMAGE-CONNECTED PASSAGE (when selected_image_id is set)
• Pick selected_image_id FIRST from library_candidates.
${LIBRARY_PHOTO_CORE.split("\n").slice(1).join("\n")}
• The writing prompt must logically follow the passage.
`.trim();

export const LIBRARY_IMAGE_READING_EXTRA = `
READING: passage is what the student reads; questions from THIS passage only — not picture-only answers.
`.trim();

export const LIBRARY_IMAGE_LISTENING_EXTRA = `
LISTENING: audio_script uses the same story rules; questions from heard text only — not picture-only answers.
`.trim();

export const LIBRARY_IMAGE_SPEAKING_EXTRA = `
SPEAKING: photo is visual support; student responds to the oral language task, not a "what do you see" scene description.
`.trim();

export const LIBRARY_IMAGE_SCENE_NOTE =
  "Ground composed text in 1–3 tag objects as story or evidence — not tap targets or picture-only answers.";

export const LIBRARY_IMAGE_READING_PASSAGE_RULES = `${LIBRARY_PHOTO_CORE}\n${LIBRARY_IMAGE_READING_EXTRA}`;
export const LIBRARY_IMAGE_LISTENING_PASSAGE_RULES = `${LIBRARY_PHOTO_CORE}\n${LIBRARY_IMAGE_LISTENING_EXTRA}`;
export const LIBRARY_IMAGE_SPEAKING_PASSAGE_RULES = `${LIBRARY_PHOTO_CORE}\n${LIBRARY_IMAGE_SPEAKING_EXTRA}`;

export function buildWritingPassageSentenceTarget(level: number, keyUse: string): string {
  const lv = Math.max(1, Math.min(6, Math.floor(level)));

  const baseByLevel: Record<number, string> = {
    1: "2–3 very short sentences (~25–45 words). Simple present. One clear who / where / what.",
    2: "3–4 short sentences (~45–65 words). Mini-story or fact sequence (first, then, last).",
    3: "4–5 sentences (~65–85 words). One compare, cause, or explain relationship.",
    4: "5–6 sentences (~85–105 words). More detail; use because / but / also connectors.",
    5: "6–7 sentences (~105–125 words). Informational tone; subject vocabulary allowed.",
    6: "6–8 sentences (~120–140 words). Dense academic context the student writes from.",
  };

  const kuNote: Record<string, string> = {
    Narrate: "Shape: short event or story using tag objects as who/where/what happened.",
    Inform:  "Shape: factual report of what is in the scene — names and properties, not a writing task.",
    Explain: "Shape: function, process, or why/how the tag objects matter in this setting.",
    Argue:   "Shape: two visible ideas or sides grounded in tags; the prompt will ask for a position.",
  };

  const ku = kuNote[keyUse] ?? "Ground every sentence in the selected candidate tags, concept, and description.";
  return `${baseByLevel[lv] ?? baseByLevel[6]} ${ku}`;
}

export function buildLevel1PassageFromLibraryMeta(meta: {
  tags: string[];
  description?: string | null;
  imageConcept?: string | null;
}): string {
  const concept = meta.imageConcept?.trim()
    || meta.description?.trim()
    || meta.tags.slice(0, 3).join(", ")
    || "this scene";
  const who = meta.tags[0] ?? "Someone";
  const where = meta.tags[1] ?? "a familiar place";
  const what = meta.tags[2] ?? concept.replace(/\.$/, "");
  return `${who} is at ${where}. ${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
}

export function writingPassageSchemaHint(level: number): string {
  const lv = Math.floor(level);
  if (lv <= 1) return "2–3 short sentences";
  if (lv <= 2) return "3–4 short sentences";
  return "4–6 sentences";
}
