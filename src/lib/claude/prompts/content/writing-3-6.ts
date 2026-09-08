/** Writing levels 3–6: connected and organized text. Not oral frames. */

export const WRITING_CONTENT_3_6 = `
DOMAIN: WRITING  |  BAND: 3–6  |  student WRITES organized text

Prompt: one task matching task_type and writing_format. NEVER mention word bank or sentence frame in the prompt.
If has_library_image: write about that photo. If not: topic only.
Follow OUTPUT SCHEMA for word_bank / sentence_frame (usually null at higher levels).
echo min_sentences (floor, not cap).
L3: one paragraph, details. L4: two paragraphs. L5–6: intro/body/conclusion or argue with reasons.
exit_proximity → richer prompt, still writing.
Do not generate a speaking oral scaffold as the main task.
`.trim();
