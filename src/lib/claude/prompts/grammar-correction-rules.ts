/**
 * Reusable Language Forms rules: accurate English in generated content,
 * and corrective coaching when students slip (grammar, verbs, pronouns, spelling).
 *
 * Merge with buildSystemPrompt() — writing content gen, writing/speaking feedback, other domains later.
 */

/** Student-facing strings you compose (prompt, passage, frames, word bank). */
export const LANGUAGE_FORMS_ACCURACY_FOR_CONTENT = `
LANGUAGE FORMS — ACCURACY IN GENERATED ENGLISH
Every English string you output (prompt, passage, sentence_frame, word_bank) must be grammatically correct for Grade 6–8 academic practice at this pld.

Follow standard grammar:
• Verbs — correct tense for the time frame; subject–verb agreement (he/she/it + -s where needed).
• Pronouns — clear antecedent; it for things, they for plurals; do not switch he/it for the same noun.
• Articles and prepositions — a/an/the and common prepositions (in, on, at, to) used naturally.
• Spelling — tier-3 and academic_subject terms spelled correctly; American English unless stated otherwise.
• Sentences — complete sentences in passage and frames; match pld length (fragments only when pld is word/phrase level).

Never embed intentional grammar or spelling errors in scaffolds — students should see correct models.
Self-check before returning JSON: read prompt, passage, and sentence_frame; fix any slip.
`.trim();

/** When reviewing student writing or speech — require correction before pass. */
export const LANGUAGE_FORMS_CORRECTION_COACHING = `
LANGUAGE FORMS — CORRECT GRAMMAR, VERBS, PRONOUNS, SPELLING
Students must use grammatically correct English for this level. A clear teachable slip means NOT YET even when the idea is right — they must correct it before passing.

Teachable slips (coach one gap per try):
• Verb tense or form (go/went, is/are, missing -s on he/she/it)
• Subject–verb agreement
• Pronoun errors (he/she/it/they; wrong it for a person, wrong they for one thing)
• Articles or prepositions (a/an/the; in/on/at)
• Word order that breaks meaning
• Spelling of a key word from the prompt, word bank, or passage (not STT noise on speaking)

Do not treat accent or dialect as an error. At higher levels, ignore one minor typo if meaning is clear; at levels 1–2, coach spelling of key academic words.

When NOT YET for a language slip, coaching MUST instruct correction without giving a paste-ready answer:
1. What is wrong — point to their word or pattern.
2. Why it is wrong — one simple reason they can learn (not a grammar-class label dump).
3. Revision hint — one short fix target only (e.g. "Use it for the cell" / "Change went to go" / "Add one sentence about why"). Do NOT write full sentences, paragraphs, or a complete answer they could copy.

WRITING — never use "You can write:", "Try writing:", "Example response:", or model_response text. model_response must be "".
SPEAKING — you may give a brief corrected phrase to say aloud (not a full paragraph).

One gap only. Do not add a new topic or a second grammar lesson.
On writing retry: PASS only if they fixed the coached gap in their own words — not if they pasted or lightly edited coaching text.
`.trim();

/** One-line hint for user-message evidence blocks (item feedback). */
export const LANGUAGE_FORMS_NOT_YET_EVIDENCE_LINE =
  "If NOT YET: follow LANGUAGE FORMS — CORRECT GRAMMAR in the system prompt. Teach (1) what is wrong (2) why in simple words (3) one revision hint — never a full model answer. One gap only.";

export type LanguageFormsCoachingDomain = "writing" | "speaking" | "reading" | "listening";

/** Domains where expressive production gets full correction coaching. */
export function languageFormsCorrectionCoachingForDomain(
  domain: LanguageFormsCoachingDomain,
): string {
  if (domain === "writing" || domain === "speaking") {
    return LANGUAGE_FORMS_CORRECTION_COACHING;
  }
  return "";
}
