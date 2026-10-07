/**
 * Academic ELA (English Language Arts) Listening Engine
 *
 * Selects ELA units, genres, scenarios, and vocabulary for the listening_academic tier.
 * Curriculum aligned to CCSS ELA/Literacy (RL, RI, W, L, SL) for grades 6–8.
 */

import curriculumData from "../../data/academicElaCurriculum.json";
import {
  elaFrameworkFromUnit,
  scenarioExamplesForPrompt,
  type AcademicFrameworkFields,
} from "./academicFrameworkContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ElaGenre = "narrative" | "informational" | "argument" | "author_craft";

export interface ElaUnit {
  id:           string;
  unit:         string;
  primaryGenre: ElaGenre;
  altGenres:    ElaGenre[];
  ccssDomains?: string[];
  standards?:   string[];
  tier3ByLevel: Record<string, string[]>;
  scenarios:    string[];
}

export interface ElaSessionContext extends Partial<AcademicFrameworkFields> {
  unit:             string;
  genre:            ElaGenre;
  scenario:         string;
  scenarioExamples: string[];
  tier3Vocabulary:  string[];
  topicLabel:       string;
  permittedFormats?: string[];
}

import { listeningAvailableFormats } from "../content/formatCapabilities";

// ── Curriculum data ───────────────────────────────────────────────────────────

function getElaUnits(): ElaUnit[] {
  return (curriculumData as { units: ElaUnit[] }).units;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampLevel(level: number): number {
  return Math.min(6, Math.max(3, Math.floor(level)));
}

export function getElaVocabForLevel(unit: ElaUnit, wida: number): string[] {
  const key = String(clampLevel(wida));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}

/**
 * Selects an ELA unit and scenario for the session.
 * Rotates units to avoid repetition, picks a scenario within the chosen unit.
 */
export function selectElaScenario(
  persistedTopic:  string | null,
  topicsUsedToday: string[] = [],
): ElaSessionContext {
  const units = getElaUnits();
  const usedLower = topicsUsedToday.map((t) => t.toLowerCase());

  let chosenUnit: ElaUnit;
  let chosenScenario: string;
  let chosenGenre: ElaGenre;

  if (persistedTopic) {
    const retryUnit = units.find((u) =>
      u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;
    const matched = retryUnit.scenarios.find((s) => persistedTopic.includes(s.slice(0, 40)));
    chosenScenario = matched ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
    chosenGenre = retryUnit.primaryGenre;
  } else {
    const available = units.filter(
      (u) => !usedLower.some((used) =>
        u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase())
      )
    );
    const pool = available.length > 0 ? available : units;
    chosenUnit = pool[Math.floor(Math.random() * pool.length)];
    chosenScenario = chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
    const allGenres = [chosenUnit.primaryGenre, ...chosenUnit.altGenres];
    chosenGenre = allGenres[Math.floor(Math.random() * allGenres.length)];
  }

  return {
    unit:             chosenUnit.unit,
    genre:            chosenGenre,
    scenario:         chosenScenario,
    scenarioExamples: [],
    tier3Vocabulary:  [],
    topicLabel:       `ELA — Grade 6–8: ${chosenUnit.unit}`,
  };
}

/**
 * Builds the complete ElaSessionContext for one session,
 * including vocab resolved at the student's current WIDA level.
 */
export function buildElaSessionContext(
  fractionalLevel:  number,
  persistedTopic:   string | null,
  topicsUsedToday:  string[] = [],
): ElaSessionContext {
  const units = getElaUnits();
  const ctx   = selectElaScenario(persistedTopic, topicsUsedToday);
  const unit  = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getElaVocabForLevel(unit, fractionalLevel);
  return {
    ...ctx,
    tier3Vocabulary: vocab,
    scenarioExamples: scenarioExamplesForPrompt(unit.scenarios),
    permittedFormats: listeningAvailableFormats(clampLevel(fractionalLevel)),
    ...elaFrameworkFromUnit(unit, ctx.genre),
  };
}
