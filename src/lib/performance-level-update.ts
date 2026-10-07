/**
 * Session-end level placement from AI recommended_level + rubric/score fallbacks.
 * Replaces fixed ±0.2 steps — levels move to where performance warrants (e.g. 1 → 1.5 → 2).
 */

import type { LevelUpdateResult } from "./adaptive-engine";
import {
  isInterpretiveDomain,
  levelFromInterpretiveScore,
} from "./interpretive-scoring";
import { writingScoreMeetsTask } from "./wida-access-rubric";

const CONSECUTIVE_FAILS_BEFORE_DROP = 2;

export type PerformanceLevelUpdateResult = LevelUpdateResult & {
  newConsecutivePass: number;
  newConsecutiveFail: number;
};

function roundLevel(value: number): number {
  return Math.round(value * 10) / 10;
}

export function fractionalStepWithinLevel(fractionalLevel: number): number {
  const floor = Math.floor(fractionalLevel);
  return Math.min(4, Math.round((fractionalLevel - floor) * 5));
}

export function writingPromotionRubricMin(targetIntegerLevel: number): number {
  if (targetIntegerLevel <= 1) return 2;
  if (targetIntegerLevel === 2) return 4;
  if (targetIntegerLevel === 3) return 4;
  if (targetIntegerLevel === 4) return 5;
  if (targetIntegerLevel === 5) return 5;
  return 6;
}

function meetsWritingPromotionGate(
  targetIntegerLevel: number,
  rubricScore: number,
  meetsTask: boolean,
  minSentences: number,
): boolean {
  if (!meetsTask || rubricScore <= 0) return false;
  if (rubricScore < writingPromotionRubricMin(targetIntegerLevel)) return false;
  return writingScoreMeetsTask(rubricScore, targetIntegerLevel, minSentences);
}

function applyWritingIntegerGate(
  currentLevel: number,
  proposedLevel: number,
  rubricScore: number,
  meetsTask: boolean,
  minSentences: number,
): number {
  const startFloor = Math.floor(currentLevel);
  let capped = proposedLevel;
  for (let target = startFloor + 1; target <= Math.floor(proposedLevel); target += 1) {
    if (!meetsWritingPromotionGate(target, rubricScore, meetsTask, minSentences)) {
      capped = Math.min(capped, target - 0.05);
    }
  }
  return capped;
}

function parseRecommendedLevel(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return roundLevel(n);
}

/** Map ACCESS writing rubric 0–7 → fractional level within / across integer bands. */
export function writingLevelFromRubric(
  currentLevel: number,
  rubricScore: number,
  meetsTask: boolean,
  minSentences: number,
): number {
  const floor = Math.floor(currentLevel);
  const within = currentLevel - floor;

  if (!meetsTask || rubricScore <= 1) {
    return roundLevel(Math.max(floor, floor + Math.max(0, within - 0.15)));
  }

  const offsetByRubric: Record<number, number> = {
    2: 0.3,
    3: 0.4,
    4: 0.5,
    5: 0.65,
    6: 0.85,
    7: 1.0,
  };
  const offset = offsetByRubric[Math.max(2, Math.min(7, Math.round(rubricScore)))] ?? 0.25;
  let proposed = floor + offset;
  if (meetsWritingPromotionGate(floor + 1, rubricScore, meetsTask, minSentences)) {
    proposed = Math.max(proposed, floor + 1);
  }
  return roundLevel(Math.max(proposed, currentLevel - 0.2));
}

/** Score-percent fallback for listening / reading / multi-item sessions. */
export function levelFromScorePct(
  currentLevel: number,
  scorePct: number,
  exitThreshold: number,
  minLevel: number,
): number {
  const floor = Math.floor(currentLevel);
  const within = currentLevel - floor;

  if (scorePct >= 95) return roundLevel(Math.min(exitThreshold, floor + Math.min(1, within + 0.55)));
  if (scorePct >= 85) return roundLevel(Math.min(exitThreshold, floor + Math.min(1, within + 0.4)));
  if (scorePct >= 75) return roundLevel(Math.min(exitThreshold, floor + Math.min(1, within + 0.3)));
  if (scorePct >= 65) return roundLevel(Math.min(exitThreshold, floor + Math.min(1, within + 0.2)));
  if (scorePct >= 50) return roundLevel(currentLevel);
  if (scorePct >= 35) return roundLevel(Math.max(minLevel, currentLevel - 0.15));
  return roundLevel(Math.max(minLevel, currentLevel - 0.3));
}

function reasonForDelta(
  delta: number,
  newLevel: number,
  exitThreshold: number,
  minLevel: number,
): LevelUpdateResult["reason"] {
  if (newLevel >= exitThreshold) return "exit";
  if (newLevel <= minLevel && delta < 0) return "floor";
  if (delta > 0) return "advance";
  if (delta < 0) return "drop";
  return "advance";
}

export function calculatePerformanceLevelUpdate(params: {
  domain: string;
  currentLevel: number;
  exitThreshold: number;
  minLevel: number;
  scorePct: number;
  recommendedLevel?: number | null;
  rubricScore?: number | null;
  interpretiveScore?: number | null;
  interpretiveMeetsTask?: boolean;
  meetsTask?: boolean;
  minSentences?: number;
  consecutiveFail?: number;
}): PerformanceLevelUpdateResult {
  const {
    domain,
    currentLevel,
    exitThreshold,
    minLevel,
    scorePct,
    consecutiveFail = 0,
  } = params;
  const rubricScore = params.rubricScore ?? null;
  const interpretiveScore = params.interpretiveScore ?? null;
  const minSentences = params.minSentences ?? 1;
  const interpretive = isInterpretiveDomain(domain);
  const meetsTask = domain === "writing"
    ? (params.meetsTask ?? (
        rubricScore != null
          ? writingScoreMeetsTask(rubricScore, Math.floor(currentLevel), minSentences)
          : false
      ))
    : interpretive
      ? (params.interpretiveMeetsTask ?? params.meetsTask ?? scorePct >= 70)
      : (params.meetsTask ?? scorePct >= 70);

  let proposed = parseRecommendedLevel(params.recommendedLevel);

  if (proposed == null) {
    if (domain === "writing") {
      proposed = writingLevelFromRubric(
        currentLevel,
        rubricScore ?? (meetsTask ? 3 : 1),
        meetsTask,
        minSentences,
      );
    } else if (interpretive && interpretiveScore != null) {
      proposed = levelFromInterpretiveScore(
        currentLevel,
        interpretiveScore,
        meetsTask,
        exitThreshold,
        minLevel,
      );
    } else {
      proposed = levelFromScorePct(currentLevel, scorePct, exitThreshold, minLevel);
    }
  }

  proposed = roundLevel(Math.min(Math.max(proposed, minLevel), exitThreshold));

  if (domain === "writing" && rubricScore != null) {
    proposed = applyWritingIntegerGate(currentLevel, proposed, rubricScore, meetsTask, minSentences);
    proposed = roundLevel(Math.min(Math.max(proposed, minLevel), exitThreshold));
  }

  const isWeak = domain === "writing"
    ? !meetsTask || (rubricScore ?? 0) <= 1
    : interpretive
      ? !meetsTask || (interpretiveScore ?? 0) <= 1
      : scorePct < 50;

  let newConsecutiveFail = 0;
  let newConsecutivePass = 0;
  let newLevel = proposed;

  if (isWeak && proposed < currentLevel - 0.05) {
    newConsecutiveFail = consecutiveFail + 1;
    if (newConsecutiveFail < CONSECUTIVE_FAILS_BEFORE_DROP) {
      newLevel = currentLevel;
    }
  } else if (!isWeak && proposed >= currentLevel) {
    newConsecutivePass = 1;
  } else if (isWeak) {
    newConsecutiveFail = consecutiveFail + 1;
  }

  newLevel = roundLevel(Math.min(Math.max(newLevel, minLevel), exitThreshold));
  const delta = roundLevel(newLevel - currentLevel);

  return {
    newLevel,
    changed: newLevel !== currentLevel,
    delta,
    reason: reasonForDelta(delta, newLevel, exitThreshold, minLevel),
    newConsecutivePass,
    newConsecutiveFail,
    atExit: newLevel >= exitThreshold,
  };
}
