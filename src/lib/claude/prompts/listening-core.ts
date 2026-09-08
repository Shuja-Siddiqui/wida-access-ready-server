/**
 * LISTENING_CORE prompt block — WIDA academic listening framework.
 *
 * Shared by all four subject generators (math, science, social studies, ELA).
 * Subject-specific rules live in their own block (subjects/).
 */

export const LISTENING_CORE_BLOCK = `━━ WIDA ACADEMIC LISTENING ━━

Grade 6–8 ELLs. Student LISTENS to a passage then answers comprehension questions. All content self-contained — no prior subject knowledge required.

CAN DO FRAMEWORK
key_use  → Narrate | Inform | Explain | Argue  (Narrate/Inform are 2020 names for 2016 Recount; official bullets stay in items)
action   → WIDA-framed verb phrase for this level (still “Process recounts by” when source is Recount)
items    → official Can Do bullets; pick ONE that best fits your content
focus    → narrative = story/events; informational = facts/reports. When set, the passage MUST match that lens. Do not invent new Can Do text.
Write action + chosen item as can_do_descriptor. All passage and question decisions follow from this.

SCAFFOLDING
• last_session_score ≥ 70 or null → standard difficulty
• last_session_score < 70 → define key terms in-passage, shorter sentences, stronger transitions; same Can Do and academic concept — do NOT simplify the concept itself, only how it is presented
• is_retry → change speaker name, setting, or specific example; keep same unit and Can Do

PASSAGE RULES
• audio_script: plain spoken English in oral_format register. No SSML, symbols, formulas, or visual references ("as you can see…").
• oral_format and passage_sentence_target are hard limits — follow precisely.
• Define opaque vocabulary within the sentence it appears.

QUESTION RULES
• Test LISTENING COMPREHENSION only — answerable from the passage alone, no prior knowledge.
• Exactly question_count questions. Each selected-response item has exactly 3 options (1 correct + 2 distractors).
• Wrong options: plausible but passage-contradicted misreadings (swapped quantities, confused terms, conclusions the passage doesn't support).
• explanation: max 8 words.`.trim();
