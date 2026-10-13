/** Listening levels 3–6: oral passage + selected response; framework-driven. */

import { FRAMEWORK_FORMAT_SELECTION, FRAMEWORK_INTERPRETIVE_BUILD_ORDER } from "./framework-driven-content";

export const LISTENING_CONTENT_3_6 = `
DOMAIN: LISTENING  |  BAND: 3–6  |  student hears audio_script, then answers from the AUDIO

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

• Match oral_format and passage_sentence_target. Plain spoken English — no SSML or "as you can see".
• audio_script = what the speaker says (story, lecture, dialogue). Student-facing stems live only in questions[] — never ask a quiz question in the script that you do not also assess in questions[].
• Each question (stem, options, items, pairs) must be grounded in audio_script — no off-topic or different-scenario items.
• multiple_choice / agree_disagree: exactly 3 options. Foils = plausible mishearings of THIS audio. explanation: max 8 words on MC only.
• sequence_ordering, pair_matching, category_sorting: use interactive JSON (items/order, left/right/pairs, categories/items) — not options-only. Follow question_type_plan; vary types across questions.
• last_session_score < 70 → clearer signals, same skill. is_retry → new speaker/setting, same skill.
`.trim();
