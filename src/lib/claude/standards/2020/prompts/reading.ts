/** @deprecated Domain rules live in prompts/content/reading-{band}.ts */
export const READING_2020 = `
READING — APPLY THE SIX FRAMEWORK PARTS (interpretive)
This call is reading (interpretive). The student READS a passage and answers comprehension questions.
Job from language_expectations + language_functions. English hardness from framework.pld only.
Questions must assess whether the student understood the language in framework.language_functions — not a different skill.
Passage length follows text_format and passage_word_max. Choose question types from available_question_formats using framework.language_functions.
When has_library_image: write a story or subject passage grounded in image_tags — the photo is visual support; do not caption the scene or copy image_description.
`.trim();
