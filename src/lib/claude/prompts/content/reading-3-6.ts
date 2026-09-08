/** Reading levels 3–6: paragraph and extended print. Not listening. */

export const READING_CONTENT_3_6 = `
DOMAIN: READING  |  BAND: 3–6  |  student READS this passage only

Passage must make the Can Do demonstrable in print. Match text_format and passage_word_max.
Narrate → sequence/story. Inform → facts/main ideas. Explain → how/why in the text. Argue → position + stated evidence. If can_do.focus is set, the passage MUST match that lens.
If has_library_image: the passage is about that photo; questions still from the text.
Questions: exactly question_count, ONLY types in OUTPUT SCHEMA. Foils = plausible misreadings of THIS passage. Multiple choice: exactly 3 options (1 correct + 2 distractors).
L3: main idea + detail. L4: compare/infer from evidence. L5–6: purpose/relationships — still only this passage.
Vocabulary: 2–3 Tier-2 words from the passage.
exit_proximity → more inference, still this band.
`.trim();
