/**
 * Academic Social Studies Listening Engine
 *
 * Selects social studies units, scenarios, and vocabulary for the listening_academic tier.
 * Mirrors academicMathEngine.ts for the social studies subject.
 *
 * Design decisions:
 *  - Units span three strands: World History, U.S. History, Financial Literacy.
 *  - Scenarios are teacher/historian narrations — events, concepts, or systems explained aloud.
 *  - Vocabulary is stratified by WIDA level (3-6).
 *  - All four question formats are permitted (agree_disagree is especially useful for
 *    historical interpretation and civics claims like "the Constitution gave citizens more rights").
 */

import curriculumData from "../data/academicSocialStudiesCurriculum.json";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SocialStudiesUnit {
  id:            string;
  strand:        string;  // "World History" | "U.S. History" | "Financial Literacy and Economics"
  unit:          string;
  topics:        string;
  tier3ByLevel:  Record<string, string[]>;
  scenarios:     string[];
}

export interface SocialStudiesSessionContext {
  /** The social studies unit targeted this session */
  unit:             string;
  /** The strand this unit belongs to, e.g. "U.S. History" */
  strand:           string;
  /** The specific scenario Claude will use for the narration */
  scenario:         string;
  /** Tier-3 social studies vocabulary appropriate for this WIDA level */
  tier3Vocabulary:  string[];
  /** Topic string written to the sessions record and echoed by Claude */
  topicLabel:       string;
  /** Permitted question formats */
  permittedFormats: string[];
}

// ── Permitted formats ─────────────────────────────────────────────────────────

/**
 * Social studies sessions permit all four formats.
 * agree_disagree is especially effective for historical interpretation and civics claims.
 * sequence_ordering is useful for timelines of events and cause-effect chains.
 */
export const SS_PERMITTED_FORMATS: string[] = [
  "multiple_choice",
  "sequence_ordering",
  "pair_matching",
  "agree_disagree",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampLevel(level: number): number {
  return Math.min(6, Math.max(3, Math.floor(level)));
}

export function getSocialStudiesUnits(): SocialStudiesUnit[] {
  return (curriculumData as any).units as SocialStudiesUnit[];
}

export function getSocialStudiesVocabForLevel(
  unit: SocialStudiesUnit,
  widaLevel: number,
): string[] {
  const key = String(clampLevel(widaLevel));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}

/**
 * Selects a social studies unit and scenario for the session.
 *
 * Strategy:
 *  1. If the last session failed (persistedTopic), find that unit and reuse it.
 *  2. Otherwise, filter out units used today and pick randomly from the rest.
 *  3. Within the chosen unit, pick a random scenario.
 */
export function selectSocialStudiesScenario(
  persistedTopic:  string | null,
  topicsUsedToday: string[] = [],
): SocialStudiesSessionContext {
  const units = getSocialStudiesUnits();

  let chosenUnit: SocialStudiesUnit;
  let chosenScenario: string;

  if (persistedTopic) {
    const retryUnit =
      units.find((u) =>
        u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
      ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;
    const matchedScenario = retryUnit.scenarios.find((s) =>
      persistedTopic.includes(s.slice(0, 40))
    );
    chosenScenario =
      matchedScenario ??
      retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
  } else {
    const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
    const available = units.filter(
      (u) =>
        !usedLower.some(
          (used) =>
            u.unit.toLowerCase().includes(used) ||
            used.includes(u.unit.toLowerCase())
        )
    );
    const pool = available.length > 0 ? available : units;
    chosenUnit = pool[Math.floor(Math.random() * pool.length)];
    chosenScenario =
      chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
  }

  const topicLabel = `Social Studies — ${chosenUnit.strand}: ${chosenUnit.unit}`;

  return {
    unit:             chosenUnit.unit,
    strand:           chosenUnit.strand,
    scenario:         chosenScenario,
    tier3Vocabulary:  [],  // caller fills in after resolving WIDA level
    topicLabel,
    permittedFormats: SS_PERMITTED_FORMATS,
  };
}

/**
 * Builds the complete SocialStudiesSessionContext for one session,
 * including vocab resolved at the student's current WIDA level.
 */
export function buildSocialStudiesSessionContext(
  fractionalLevel:  number,
  persistedTopic:   string | null,
  topicsUsedToday:  string[] = [],
): SocialStudiesSessionContext {
  const ctx   = selectSocialStudiesScenario(persistedTopic, topicsUsedToday);
  const units = getSocialStudiesUnits();
  const unit  = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getSocialStudiesVocabForLevel(unit, fractionalLevel);
  return { ...ctx, tier3Vocabulary: vocab };
}
