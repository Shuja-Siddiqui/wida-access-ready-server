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
import {
  academicFrameworkLayer,
  type AcademicFrameworkFields,
} from "./academicFrameworkContext";
import { buildMathSessionContext, type MathSessionContext } from "./academicMathEngine";
import { buildScienceSessionContext, type ScienceSessionContext } from "./academicScienceEngine";
import { buildSocialStudiesSessionContext, type SocialStudiesSessionContext } from "./academicSocialStudiesEngine";
import { buildElaSessionContext, type ElaSessionContext } from "./academicElaEngine";

export { ACADEMIC_SUBJECT_LABELS, nextKeyUse, nextSubject, pickSubjectForKeyUse };
export type { AcademicSubject };
export type { AcademicFrameworkFields };

export type AcademicSessionContext =
  | (MathSessionContext & { subject: "math" })
  | (ScienceSessionContext & { subject: "science" })
  | (SocialStudiesSessionContext & { subject: "social_studies" })
  | (ElaSessionContext & { subject: "ela" });

const ACADEMIC_WORLD: Record<AcademicSubject, string> = {
  math: `━━ ACADEMIC WORLD: Mathematics (CCSS Grades 6–8) ━━
Content must be a real-world math situation with specific numbers (quantities, prices, distances, times).
Describe relationships; do not require the student to compute a final numeric answer unless the domain task itself is calculation.
Define math terms inline: "The unit rate, which is the cost for one item, is…"
Stay inside the given math unit and content_standards.`,

  science: `━━ ACADEMIC WORLD: Science (NGSS MS-LS, MS-PS, MS-ESS, MS-ETS) ━━
Content must teach a science concept or phenomenon aligned to the unit's performance expectations.
Use a concrete analogy when a term is hard. Define Tier-3 terms inline.
Reflect NGSS practices and crosscutting concepts when provided in user JSON.
Stay inside the given science unit. Do not quiz memorized textbook facts.`,

  social_studies: `━━ ACADEMIC WORLD: Social Studies (C3 Framework: History, Geography, Civics, Economics) ━━
Content must be a real social-studies situation with specific names, places, and (when used) spoken dates.
Match the session Key Language Use: history/story for Narrate, facts for Inform, how/why a system works for Explain, claim+evidence for Argue.
The text supplies all context — no prior history knowledge.
Define terms inline. Stay inside the given social studies unit and C3 indicators.`,

  ela: `━━ ACADEMIC WORLD: English Language Arts (CCSS RL, RI, W, L, SL Grades 6–8) ━━
Content must be academic literacy: narrative, informational, argument, or author's craft — not a casual chat topic.
Use literary/informational terms inline when needed (simile, claim, evidence).
Stay inside the given ELA unit / genre and CCSS standards. Questions or prompts must come from THIS text, not general English trivia.`,
};

const DOMAIN_APPLY: Record<"reading" | "speaking" | "writing", string> = {
  reading:
    "DOMAIN APPLY — READING: Write the passage IN this academic world. Questions test the 2020 interpretive language_functions for this Key Language Use using only this passage. text_format and passage_word_max are hard caps — at Level 1 write 2–4 short sentences (≤40 words), never a textbook lesson with examples.",
  speaking:
    "DOMAIN APPLY — SPEAKING: The student SPEAKS about this academic world. The prompt is an expressive 2020 language_functions task for this Key Language Use. Do not write a listening quiz.",
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
  framework?: Partial<AcademicFrameworkFields> | null;
}): string {
  const skillGoal =
    "Language functions and key_language_use are the WIDA skill GOAL. They are not a subject list.";
  const frameworkBlock =
    opts.framework?.contentFramework && opts.framework.contentStandards
      ? academicFrameworkLayer(opts.framework as AcademicFrameworkFields)
      : "";
  return [
    "━━ ACADEMIC CONTENT LAYER ━━",
    skillGoal,
    `Practice that skill using ${opts.subjectLabel} content only.`,
    kluSubjectPairingLine(opts.keyUse, opts.subject, opts.subjectLabel),
    DOMAIN_APPLY[opts.domain],
    ACADEMIC_WORLD[opts.subject],
    frameworkBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Full SF session bundle: unit, scenario, tier-3 vocab, topic label, and content-framework metadata.
 */
export function buildAcademicSessionContext(
  subject: AcademicSubject,
  fractionalLevel: number,
  persistedTopic: string | null,
  topicsUsedToday: string[],
  recentScenarios: string[] = [],
): AcademicSessionContext {
  if (subject === "math") {
    return {
      subject,
      ...buildMathSessionContext(
        fractionalLevel,
        persistedTopic,
        topicsUsedToday,
        recentScenarios,
      ),
    };
  }
  if (subject === "science") {
    return {
      subject,
      ...buildScienceSessionContext(fractionalLevel, persistedTopic, topicsUsedToday),
    };
  }
  if (subject === "social_studies") {
    return {
      subject,
      ...buildSocialStudiesSessionContext(fractionalLevel, persistedTopic, topicsUsedToday),
    };
  }
  return {
    subject: "ela",
    ...buildElaSessionContext(fractionalLevel, persistedTopic, topicsUsedToday),
  };
}

export function pickAcademicTopicLabel(
  subject: AcademicSubject,
  fractionalLevel: number,
  persistedTopic: string | null,
  topicsUsedToday: string[],
): string {
  return buildAcademicSessionContext(
    subject,
    fractionalLevel,
    persistedTopic,
    topicsUsedToday,
  ).topicLabel;
}
