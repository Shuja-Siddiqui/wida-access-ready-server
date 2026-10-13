/**
 * Academic Science Listening Engine
 *
 * Selects science units, scenarios, and vocabulary for the listening_academic tier.
 * Mirrors academicMathEngine.ts for the science subject.
 *
 * Design decisions:
 *  - Units span three strands: Life Science, Physical Science, Earth & Space Science.
 *  - Scenarios are teacher/scientist narrations — a phenomenon or process explained aloud.
 *  - Vocabulary is stratified by WIDA level (3-6).
 *  - All four question formats are permitted for science (agree_disagree works well for
 *    evidence-based claims like "evolution is supported by the fossil record").
 */

import curriculumData from "../../data/academicScienceCurriculum.json";
import {
  scienceFrameworkFromUnit,
  scenarioExamplesForPrompt,
  type AcademicFrameworkFields,
} from "./academicFrameworkContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScienceUnit {
  id:            string;
  strand:        string;
  unit:          string;
  topics:        string;
  ngssDomain?:   string;
  standards?:    string[];
  practices?:    string[];
  crosscuttingConcepts?: string[];
  tier3ByLevel:  Record<string, string[]>;
  scenarios:     string[];
}

export interface ScienceSessionContext extends Partial<AcademicFrameworkFields> {
  /** The science unit targeted this session */
  unit:             string;
  /** The strand this unit belongs to, e.g. "Life Science" */
  strand:           string;
  /** Internal rotation seed (dedup only) */
  scenario:         string;
  scenarioExamples: string[];
  /** Tier-3 science vocabulary appropriate for this WIDA level */
  tier3Vocabulary:  string[];
  /** Topic string written to the sessions record and echoed by Claude */
  topicLabel:       string;
  /** Permitted question formats */
  permittedFormats?: string[];
}

// ── Permitted formats ─────────────────────────────────────────────────────────

import { listeningAvailableFormats } from "../content/formatCapabilities";

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampLevel(level: number): number {
  return Math.min(6, Math.max(3, Math.floor(level)));
}

export function getScienceUnits(): ScienceUnit[] {
  return (curriculumData as any).units as ScienceUnit[];
}

export function getScienceVocabForLevel(unit: ScienceUnit, widaLevel: number): string[] {
  const key = String(clampLevel(widaLevel));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}

/**
 * Selects a science unit and scenario for the session.
 *
 * Strategy:
 *  1. If the last session failed (persistedTopic), find that unit and reuse it.
 *  2. Otherwise, filter out units used today and pick randomly from the rest.
 *  3. Within the chosen unit, pick a random scenario.
 */
export function selectScienceScenario(
  persistedTopic:  string | null,
  topicsUsedToday: string[] = [],
): ScienceSessionContext {
  const units = getScienceUnits();

  let chosenUnit: ScienceUnit;
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

  const topicLabel = `Science — ${chosenUnit.strand}: ${chosenUnit.unit}`;

  return {
    unit:             chosenUnit.unit,
    strand:           chosenUnit.strand,
    scenario:         chosenScenario,
    scenarioExamples: [],
    tier3Vocabulary:  [],  // caller fills in after resolving WIDA level
    topicLabel,
  };
}

/**
 * Builds the complete ScienceSessionContext for one session,
 * including vocab resolved at the student's current WIDA level.
 */
export function buildScienceSessionContext(
  fractionalLevel:  number,
  persistedTopic:   string | null,
  topicsUsedToday:  string[] = [],
): ScienceSessionContext {
  const ctx   = selectScienceScenario(persistedTopic, topicsUsedToday);
  const units = getScienceUnits();
  const unit  = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getScienceVocabForLevel(unit, fractionalLevel);
  return {
    ...ctx,
    tier3Vocabulary: vocab,
    scenarioExamples: scenarioExamplesForPrompt(unit.scenarios),
    permittedFormats: listeningAvailableFormats(clampLevel(fractionalLevel)),
    ...scienceFrameworkFromUnit(unit),
  };
}
