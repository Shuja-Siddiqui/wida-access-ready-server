/**
 * Academic Math Listening Engine
 *
 * Selects math units, scenarios, and vocabulary for the listening_academic tier.
 * Complements listeningContentEngine.ts for the mathematics subject.
 *
 * Design decisions:
 *  - Topics are real-world word problem SCENARIOS (not abstract concept names)
 *    so Claude writes passages that sound like a teacher reading a problem aloud.
 *  - Vocabulary is stratified by WIDA level (3-6) to match complexity_instruction.
 *  - Grade 6-8 only for now; other grade bands added when user provides their guidelines.
 *  - Permitted question formats for math: multiple_choice, sequence_ordering, pair_matching.
 *    agree_disagree is excluded — mathematical claims do not map well to that format.
 */

import curriculumData from "../data/academicMathCurriculum.json";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MathUnit {
  id:            string;
  grade:         number;
  unit:          string;
  ccs:           string;
  tier3ByLevel:  Record<string, string[]>;
  scenarios:     string[];
}

export interface MathSessionContext {
  /** The math unit targeted this session */
  unit:             string;
  /** The specific real-world scenario Claude will use for the word problem */
  scenario:         string;
  /** Tier-3 math vocabulary appropriate for this WIDA level */
  tier3Vocabulary:  string[];
  /** Topic string written to the sessions record and echoed by Claude */
  topicLabel:       string;
  /** Permitted question formats — always excludes agree_disagree */
  permittedFormats: string[];
}

// ── Permitted formats (math override) ────────────────────────────────────────

/**
 * Academic math sessions never use agree_disagree.
 * sequence_ordering is promoted because math procedures are naturally sequential.
 */
export const MATH_PERMITTED_FORMATS: string[] = [
  "multiple_choice",
  "sequence_ordering",
  "pair_matching",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampLevel(level: number): number {
  return Math.min(6, Math.max(3, Math.floor(level)));
}

/** Returns all math units for the 6-8 grade band. */
export function getMathUnits(): MathUnit[] {
  return (curriculumData as any).units as MathUnit[];
}

/**
 * Picks the Tier-3 vocabulary list for a math unit at the given WIDA level.
 * Falls back to the level-3 list if no entry exists for this level.
 */
export function getMathVocabForLevel(unit: MathUnit, widalLevel: number): string[] {
  const key  = String(clampLevel(widalLevel));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}

/**
 * Selects a math unit and scenario for the session.
 *
 * Strategy:
 *  1. If the last session failed and has a persisted topic, find that unit and reuse it.
 *  2. Otherwise, filter out units used today and pick randomly from the remainder.
 *  3. Within the chosen unit, pick a random scenario.
 *
 * @param persistedTopic   - topic from the last failed session ("Unit: Scenario"), or null
 * @param topicsUsedToday  - topic labels used in the last 24 h (for dedup)
 */
export function selectMathScenario(
  persistedTopic:  string | null,
  topicsUsedToday: string[] = [],
): MathSessionContext {
  const units = getMathUnits();

  let chosenUnit: MathUnit;
  let chosenScenario: string;

  if (persistedTopic) {
    // Reuse the same unit as the failed session so the student re-engages with it.
    const retryUnit = units.find((u) =>
      u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;

    // Try to reuse the same scenario; fall back to a different one in the same unit
    const matchedScenario = retryUnit.scenarios.find((s) => persistedTopic.includes(s.slice(0, 40)));
    chosenScenario = matchedScenario ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
  } else {
    // Filter out units whose topic labels were used today
    const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
    const available = units.filter(
      (u) => !usedLower.some((used) => u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase()))
    );
    const pool = available.length > 0 ? available : units;
    chosenUnit = pool[Math.floor(Math.random() * pool.length)];
    chosenScenario = chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
  }

  const topicLabel = `Mathematics — Grade ${chosenUnit.grade}: ${chosenUnit.unit}`;

  return {
    unit:             chosenUnit.unit,
    scenario:         chosenScenario,
    tier3Vocabulary:  [],  // caller fills this in after resolving WIDA level
    topicLabel,
    permittedFormats: MATH_PERMITTED_FORMATS,
  };
}

/**
 * Builds the complete MathSessionContext for one session, including
 * vocab resolved at the student's current WIDA level.
 */
export function buildMathSessionContext(
  fractionalLevel:  number,
  persistedTopic:   string | null,
  topicsUsedToday:  string[] = [],
): MathSessionContext {
  const ctx   = selectMathScenario(persistedTopic, topicsUsedToday);
  const units = getMathUnits();
  const unit  = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getMathVocabForLevel(unit, fractionalLevel);
  return { ...ctx, tier3Vocabulary: vocab };
}
