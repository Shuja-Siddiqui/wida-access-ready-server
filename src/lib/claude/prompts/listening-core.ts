/**
 * LISTENING_CORE prompt block — academic listening (no WIDA year).
 * 2016 Can Do rules for academic listening live in standards/2016/prompts/listening.ts
 */

export const LISTENING_CORE_BLOCK = `━━ WIDA ACADEMIC LISTENING ━━

Grade 6–8 ELLs. Student LISTENS to a passage then answers comprehension questions. All content self-contained — no prior subject knowledge required.

SCAFFOLDING
• last_session_score ≥ 70 or null → standard difficulty
• last_session_score < 70 → define key terms in-passage, shorter sentences, stronger transitions; do NOT simplify the academic concept itself, only how it is presented
• is_retry → change speaker name, setting, or specific example; keep same unit

PASSAGE RULES
• audio_script: plain spoken English in oral_format register. No SSML, symbols, formulas, or visual references ("as you can see…").
• oral_format and passage_sentence_target are hard limits — follow precisely.
• Define opaque vocabulary within the sentence it appears.

QUESTION RULES
• Test LISTENING COMPREHENSION only — answerable from the passage alone, no prior knowledge.
• Exactly question_count questions. Each selected-response item has exactly 3 options (1 correct + 2 distractors).
• Wrong options: plausible but passage-contradicted misreadings (swapped quantities, confused terms, conclusions the passage doesn't support).
• explanation: max 8 words.`.trim();
