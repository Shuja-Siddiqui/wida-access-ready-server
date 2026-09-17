/** Writing levels 1–2: academic WIDA expressive tasks; text-only (no library photos). */

export const WRITING_CONTENT_1_2 = `
DOMAIN: WRITING  |  BAND: 1–2  |  Grade 6–8 ELL  |  ACCESS-style PRACTICE  |  ACADEMIC WIDA

There is NO library photo. Write from the session topic and academic_subject only.
Do NOT say look, picture, photo, or "what do you see".

BUILD ORDER
1. Apply the six 2020 framework parts. The job is language_functions + key_language_use. English hardness is pld.level.
2. Write one open writing prompt on THIS topic in the academic subject world.
   • pld.level 1: a few simple sentences about this topic is enough.
   • pld.level 2: connected sentences with linking words that carry out the functions (how/why or claim+reason).
3. Default: word_bank and sentence_frame are null. Add them only if this pld cannot be practiced without that help.
4. Prompt must NEVER say word bank, sentence frame, "use the bank," or "start here."
5. Self-check: Level 2 prompt that only asks to name objects → START OVER.

Return ONLY the JSON in OUTPUT SCHEMA.
`.trim();
