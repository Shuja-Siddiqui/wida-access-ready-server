export const WRITING_2016_1_2 = `
CAN DO (2016) — WRITING 1–2
SOURCE OF TRUTH (this order; do not invent a different Can Do)
1. can_do.items + can_do.action — 2016 WRITING skill for THIS level and key_use. The student must practice these bullets.
2. can_do.key_language_use — 2020 purpose. Follow content_must and content_must_not (Narrate ≠ Inform ≠ Explain ≠ Argue).
3. can_do.content_portrayal.how_to_portray — item shape (labels vs copy words vs opinion). Picture on screen is decided by has_library_image, not by picture.use alone.
4. OUTPUT SCHEMA — JSON fields, task_type, min_sentences, whether word_bank / sentence_frame exist.
BUILD: If a photo is on, read image_description and image_tags FIRST. Then apply the Can Do skill TO that scene (name what is there, describe the place, etc.).
`.trim();

export const WRITING_2016_3_6 = `
CAN DO (2016) — WRITING 3–6
SOURCE OF TRUTH (this order; do not invent a different Can Do)
1. can_do.items + can_do.action — 2016 WRITING skill for THIS level and key_use. Practice these bullets (if two items, do the first unless how_to_portray says both).
2. can_do.key_language_use — 2020 purpose. Follow content_must and content_must_not. One primary key_use.
3. can_do.content_portrayal — from our content guide. how_to_portray is the item. picture.use / count / type control visuals.
4. OUTPUT SCHEMA — JSON shape. task_type is SIZE (paragraph vs report vs essay). If task_type wording fights can_do.items, the Can Do wins (example: L3 Narrate is a blog or dialogue, not a fact paragraph).
PICTURE vs GUIDE
• picture.use = not_needed → do NOT tell the student to look at a picture. Ignore a library photo as the writing topic. Stay on the session topic (or academic_subject).
• picture.use = required → the student writes FROM that visual type (often a graph/chart, not a classroom photo). If has_library_image, use only what is visible. If no photo, put a simple table/graph in visual or as numbers in the prompt.
SOURCES (only when how_to_portray or the Can Do asks for multiple sources)
• Put two short Grade 6–8 printed blurbs IN the prompt (invented for THIS topic). Do not add sources when the Can Do does not ask for them.
BUILD: Read items, key_language_use, content_portrayal. Write one prompt = this Can Do + this topic.
MATCH: One purpose, one topic, one Can Do cell. Prompt must ask for the Can Do (blog/dialogue vs fact paragraph vs compare vs claim+evidence vs sequence vs report vs argument).
Self-check: wrong key_use, extra theme, picture when not_needed, or missing sources/graph when portrayal requires them → START OVER.
`.trim();
