/** Speaking levels 3–6: extended oral discourse. Not L1 taps. Not writing essays. */

export const SPEAKING_CONTENT_3_6 = `
DOMAIN: SPEAKING  |  BAND: 3–6  |  student SPEAKS a longer turn

Write one prompt sized to response_length (3–5 sentences, paragraph, or extended). Match discourse_type.
If has_library_image: speak about THAT photo. If not: topic only — do not invent a photo.
Pick exactly one allowed_prompt_type. Follow OUTPUT SCHEMA for scaffold (often null at 4–6). Return every schema key.
echo target_seconds. L3: sequence words. L4: organized paragraph. L5–6: claim+reason, story (Narrate), or ordered report (Inform).
exit_proximity → push toward the next level's discourse, still speaking.
Do not generate listening questions or a writing word bank.
`.trim();
