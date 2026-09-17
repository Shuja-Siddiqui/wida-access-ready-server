/**
 * Academic content layer shared by listening, speaking, reading, and writing.
 *
 * Key language use is the WIDA skill goal. These guidelines are the
 * academic WORLD used to practice that skill.
 */

import {
  ACADEMIC_SUBJECT_LABELS,
  nextKeyUse,
  nextSubject,
  pickSubjectForKeyUse,
  prominenceForSubject,
  type AcademicSubject,
} from "../content";
import { buildMathSessionContext } from "./academicMathEngine";
import { buildScienceSessionContext } from "./academicScienceEngine";
import { buildSocialStudiesSessionContext } from "./academicSocialStudiesEngine";
import { buildElaSessionContext } from "./academicElaEngine";

export { ACADEMIC_SUBJECT_LABELS, nextKeyUse, nextSubject, pickSubjectForKeyUse };
export type { AcademicSubject };

const ACADEMIC_WORLD: Record<AcademicSubject, string> = {
  math: `━━ ACADEMIC WORLD: Mathematics (Grade 6–8 Common Core) ━━
Content must be a real-world math situation with specific numbers (quantities, prices, distances, times).
Describe relationships; do not require the student to compute a final numeric answer unless the domain task itself is calculation.
Define math terms inline: "The unit rate, which is the cost for one item, is…"
Stay inside the given math unit / scenario.`,

  science: `━━ ACADEMIC WORLD: Science (Grade 6–8 Life, Physical, Earth & Space) ━━
Content must teach a science concept or phenomenon. No prior science knowledge required.
Use a concrete analogy when a term is hard. Define Tier-3 terms inline.
Stay inside the given science unit / scenario. Do not quiz memorized textbook facts.`,

  social_studies: `━━ ACADEMIC WORLD: Social Studies (Grade 6–8 history, civics, economics) ━━
Content must be a real social-studies situation with specific names, places, and (when used) spoken dates.
Match the session Key Language Use: history/story for Narrate, facts for Inform, how/why a system works for Explain, claim+evidence for Argue.
The text supplies all context — no prior history knowledge.
Define terms inline. Stay inside the given social studies unit / scenario.`,

  ela: `━━ ACADEMIC WORLD: English Language Arts (Grade 6–8 literary & informational) ━━
Content must be academic literacy: narrative, informational, argument, or author's craft — not a casual chat topic.
Use literary/informational terms inline when needed (simile, claim, evidence).
Stay inside the given ELA unit / genre. Questions or prompts must come from THIS text, not general English trivia.`,
};

const DOMAIN_APPLY: Record<"reading" | "speaking" | "writing", string> = {
  reading:
    "DOMAIN APPLY — READING: Write the passage IN this academic world. Questions test the WIDA Reading Can Do / key use using only this passage. text_format and passage_word_max are hard caps — at Level 1 write 2–4 short sentences (≤40 words), never a textbook lesson with examples.",
  speaking:
    "DOMAIN APPLY — SPEAKING: The student SPEAKS about this academic world. The prompt is an oral task for the WIDA Speaking Can Do / key use. Do not write a listening quiz.",
  writing:
    "DOMAIN APPLY — WRITING: The student WRITES about this academic world. The prompt is an expressive 2020 Language Functions task for this Key Language Use. Do not write a listening quiz.",
};

export function kluSubjectPairingLine(keyUse: string | null | undefined, subject: AcademicSubject, subjectLabel: string): string {
  const prominence = prominenceForSubject(keyUse, subject) ?? "prominent";
  const useName = keyUse && keyUse !== "Recount" ? keyUse : "Narrate";
  return `WIDA 6–8 Table 3-11: ${useName} is ${prominence.replaceAll("_", " ")} in ${subjectLabel}. Keep the passage as ${useName} language inside this subject. Do not switch Key Language Use to fit a habit of the class (e.g. do not turn math Inform into a how/why Explain).`;
}

export function buildAcademicContentLayer(opts: {
  subject: AcademicSubject;
  subjectLabel: string;
  domain: "reading" | "speaking" | "writing";
  keyUse?: string | null;
}): string {
  const skillGoal =
    opts.domain === "writing"
      ? "Language functions and key_language_use are the WIDA skill GOAL. They are not a subject list."
      : "Can Do and key_use are the WIDA skill GOAL. They are not a subject list.";
  return [
    "━━ ACADEMIC CONTENT LAYER ━━",
    skillGoal,
    `Practice that skill using ${opts.subjectLabel} content only.`,
    kluSubjectPairingLine(opts.keyUse, opts.subject, opts.subjectLabel),
    DOMAIN_APPLY[opts.domain],
    ACADEMIC_WORLD[opts.subject],
  ].join("\n");
}

export function pickAcademicTopicLabel(
  subject: AcademicSubject,
  fractionalLevel: number,
  persistedTopic: string | null,
  topicsUsedToday: string[],
): string {
  if (subject === "math") {
    return buildMathSessionContext(fractionalLevel, persistedTopic, topicsUsedToday).topicLabel;
  }
  if (subject === "science") {
    return buildScienceSessionContext(fractionalLevel, persistedTopic, topicsUsedToday).topicLabel;
  }
  if (subject === "social_studies") {
    return buildSocialStudiesSessionContext(fractionalLevel, persistedTopic, topicsUsedToday).topicLabel;
  }
  return buildElaSessionContext(fractionalLevel, persistedTopic, topicsUsedToday).topicLabel;
}
