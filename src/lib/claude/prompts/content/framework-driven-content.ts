/**
 * Framework-first build order + format selection (interpretive + expressive).
 */

export const FRAMEWORK_INTERPRETIVE_BUILD_ORDER = `
BUILD ORDER (listening / reading)
1. Job = framework.language_functions (+ language_expectations). Hardness = framework.pld + complexity_instruction.
2. Academic world = academic_unit, content_standards, tier3_vocabulary; scenario_example (if any) is tone-only — invent a new scene.
3. Choose question type(s) from available_question_formats that best assess the functions — not a fixed template per key use.
4. Questions test comprehension of language in the passage/audio — not memorized facts or photo labels alone.
`.trim();

export const FRAMEWORK_EXPRESSIVE_BUILD_ORDER = `
BUILD ORDER (speaking / writing)
1. Job = framework.language_functions + key_language_use. Hardness = framework.pld + complexity_instruction.
2. Academic world = academic_unit, content_standards, tier3_vocabulary; scenario_example is tone-only — invent a new scene.
3. Choose prompt shape, scaffolds, response length, and formats from framework — not a fixed template per key use.
`.trim();

export const FRAMEWORK_FORMAT_SELECTION = `
FORMAT SELECTION
• available_question_formats / available_prompt_types = UI-capable types — choose what best fits framework.language_functions.
• Vary formats across questions when several types fit equally well; do not default to one habit (e.g. agree/disagree only).
`.trim();
