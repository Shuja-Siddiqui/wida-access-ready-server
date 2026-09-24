/** Writing library-image passage rules — connected narrative scaled by ELP level. */

export const WRITING_IMAGE_PASSAGE_RULES = `
IMAGE-CONNECTED PASSAGE (required when selected_image_id is set)
• Pick selected_image_id FIRST from library_candidates using id, tags, concept, and description.
• passage MUST be a short connected narrative or informational text about THAT photo — not a generic topic paragraph.
• Build the text FROM the chosen candidate: weave tag names, concept, and description into one coherent scene the student can write from.
• The writing prompt must logically follow the passage (student uses passage ideas + what they see).
• selected_image_id null → passage MUST be null. Never say look / picture / photo / what you see.
• Use exact tag strings naturally. Do not invent objects absent from tags and description.
`.trim();

/** Hard limits for passage length and complexity — scales with integer level. */
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

export function writingPassageSchemaHint(level: number): string {
  const lv = Math.max(1, Math.min(6, Math.floor(level)));
  if (lv <= 1) return "2–3 short sentences tied to selected_image_id tags/description";
  if (lv === 2) return "3–4 sentences — mini-story or ordered facts from the image";
  if (lv === 3) return "4–5 sentences — one relationship (compare, cause, or explain)";
  if (lv === 4) return "5–6 sentences — richer connectors and detail";
  if (lv === 5) return "6–7 sentences — informational, subject-aligned context";
  return "6–8 sentences — dense context narrative from the image metadata";
}
