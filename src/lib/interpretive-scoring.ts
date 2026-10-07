/**
 * Interpretive comprehension scoring for listening and reading.
 *
 * Maps weighted item accuracy (by question type / skill band) to a 0–7 score point
 * and fractional level placement — parallel to the expressive writing rubric path.
 */

export type InterpretiveSkillBand = "literal" | "organizing" | "inferential";

export interface InterpretiveItemBreakdown {
  type: string;
  skillBand: InterpretiveSkillBand;
  weight: number;
  correct: boolean;
}

export interface InterpretiveScore {
  scorePoint: number;
  weightedPct: number;
  rawPct: number;
  meetsTask: boolean;
  items: InterpretiveItemBreakdown[];
  label: string;
}

const TYPE_META: Record<string, { weight: number; band: InterpretiveSkillBand }> = {
  image_object_tap:  { weight: 1.0, band: "literal" },
  image_yes_no:      { weight: 1.15, band: "inferential" },
  image_grid:        { weight: 1.0, band: "literal" },
  picture:           { weight: 1.0, band: "literal" },
  object_detect:     { weight: 1.0, band: "literal" },
  multiple_choice:   { weight: 1.2, band: "literal" },
  agree_disagree:    { weight: 1.5, band: "inferential" },
  sequence_order:    { weight: 1.4, band: "organizing" },
  sequence_ordering: { weight: 1.4, band: "organizing" },
  match_columns:     { weight: 1.5, band: "organizing" },
  pair_matching:     { weight: 1.5, band: "organizing" },
  classify:          { weight: 1.5, band: "organizing" },
  category_sorting:  { weight: 1.5, band: "organizing" },
  unknown:           { weight: 1.0, band: "literal" },
};

function roundLevel(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isInterpretiveDomain(domain: string): boolean {
  const d = domain.replace(/_academic$/i, "").toLowerCase();
  return d === "listening" || d === "reading";
}

function questionTypeFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "unknown";
  const t = (content as { type?: string }).type;
  return typeof t === "string" ? t.toLowerCase() : "unknown";
}

function weightedPctToScorePoint(pct: number): number {
  if (pct >= 98) return 7;
  if (pct >= 90) return 6;
  if (pct >= 80) return 5;
  if (pct >= 68) return 4;
  if (pct >= 52) return 3;
  if (pct >= 35) return 2;
  if (pct >= 15) return 1;
  return 0;
}

/** Student-facing label for interpretive score points (aligned with writing labels). */
export function interpretiveScoreLabel(scorePoint: number): string {
  const s = Math.max(0, Math.min(7, Math.round(scorePoint)));
  const labels: Record<number, string> = {
    0: "No comprehension",
    1: "Emerging",
    2: "Developing",
    3: "Adequate",
    4: "Proficient",
    5: "Strong",
    6: "Advanced",
    7: "Exemplary",
  };
  return labels[s] ?? "Developing";
}

export function interpretiveScoreMeetsTask(
  scorePoint: number,
  level: number,
  weightedPct: number,
): boolean {
  const floor = Math.floor(level);
  if (floor <= 2) return scorePoint >= 3 && weightedPct >= 50;
  if (floor <= 4) return scorePoint >= 4 && weightedPct >= 62;
  return scorePoint >= 4 && weightedPct >= 72;
}

export function interpretivePromotionMin(targetIntegerLevel: number): number {
  if (targetIntegerLevel <= 2) return 3;
  if (targetIntegerLevel === 3) return 4;
  if (targetIntegerLevel === 4) return 4;
  if (targetIntegerLevel === 5) return 5;
  return 5;
}

function meetsInterpretivePromotionGate(
  targetIntegerLevel: number,
  scorePoint: number,
  meetsTask: boolean,
): boolean {
  if (!meetsTask || scorePoint <= 0) return false;
  return scorePoint >= interpretivePromotionMin(targetIntegerLevel);
}

function applyInterpretiveIntegerGate(
  currentLevel: number,
  proposedLevel: number,
  scorePoint: number,
  meetsTask: boolean,
): number {
  const startFloor = Math.floor(currentLevel);
  let capped = proposedLevel;
  for (let target = startFloor + 1; target <= Math.floor(proposedLevel); target += 1) {
    if (!meetsInterpretivePromotionGate(target, scorePoint, meetsTask)) {
      capped = Math.min(capped, target - 0.05);
    }
  }
  return capped;
}

/** Weighted accuracy across session answers → interpretive 0–7 score. */
export function computeInterpretiveScore(
  answers: Array<{ correct?: boolean; content?: unknown }> | undefined,
  level: number,
): InterpretiveScore {
  const items: InterpretiveItemBreakdown[] = (answers ?? []).map((a) => {
    const type = questionTypeFromContent(a.content);
    const meta = TYPE_META[type] ?? TYPE_META.unknown;
    return {
      type,
      skillBand: meta.band,
      weight: meta.weight,
      correct: Boolean(a.correct),
    };
  });

  if (items.length === 0) {
    const scorePoint = 0;
    return {
      scorePoint,
      weightedPct: 0,
      rawPct: 0,
      meetsTask: false,
      items: [],
      label: interpretiveScoreLabel(scorePoint),
    };
  }

  let earned = 0;
  let total = 0;
  let rawCorrect = 0;
  for (const item of items) {
    total += item.weight;
    if (item.correct) {
      earned += item.weight;
      rawCorrect += 1;
    }
  }

  const weightedPct = total > 0 ? (earned / total) * 100 : 0;
  const rawPct = (rawCorrect / items.length) * 100;
  let scorePoint = weightedPctToScorePoint(weightedPct);

  const inferential = items.filter((i) => i.skillBand === "inferential");
  if (inferential.length > 0 && inferential.every((i) => i.correct) && scorePoint < 5) {
    scorePoint = Math.min(7, Math.max(scorePoint, 5));
  }

  const organizing = items.filter((i) => i.skillBand === "organizing");
  if (organizing.length > 0 && organizing.every((i) => i.correct) && weightedPct >= 70 && scorePoint < 6) {
    scorePoint = Math.min(7, scorePoint + 1);
  }

  const literal = items.filter((i) => i.skillBand === "literal");
  if (literal.length > 0 && literal.every((i) => !i.correct)) {
    scorePoint = Math.min(scorePoint, 2);
  }

  scorePoint = Math.max(0, Math.min(7, Math.round(scorePoint)));
  const meetsTask = interpretiveScoreMeetsTask(scorePoint, level, weightedPct);

  return {
    scorePoint,
    weightedPct: roundPct(weightedPct),
    rawPct: roundPct(rawPct),
    meetsTask,
    items,
    label: interpretiveScoreLabel(scorePoint),
  };
}

/** Map interpretive 0–7 → fractional level (mirror of writingLevelFromRubric). */
export function levelFromInterpretiveScore(
  currentLevel: number,
  scorePoint: number,
  meetsTask: boolean,
  exitThreshold: number,
  minLevel: number,
): number {
  const floor = Math.floor(currentLevel);
  const within = currentLevel - floor;

  if (!meetsTask || scorePoint <= 1) {
    return roundLevel(Math.max(minLevel, floor + Math.max(0, within - 0.15)));
  }

  const offsetByScore: Record<number, number> = {
    2: 0.25,
    3: 0.35,
    4: 0.5,
    5: 0.65,
    6: 0.85,
    7: 1.0,
  };
  const offset = offsetByScore[Math.max(2, Math.min(7, Math.round(scorePoint)))] ?? 0.2;
  let proposed = floor + offset;
  if (meetsInterpretivePromotionGate(floor + 1, scorePoint, meetsTask)) {
    proposed = Math.max(proposed, floor + 1);
  }
  proposed = applyInterpretiveIntegerGate(currentLevel, proposed, scorePoint, meetsTask);
  return roundLevel(Math.min(exitThreshold, Math.max(minLevel, Math.max(proposed, currentLevel - 0.2))));
}

export function serializeInterpretiveScoreForPrompt(score: InterpretiveScore): string {
  const bands = {
    literal: score.items.filter((i) => i.skillBand === "literal"),
    organizing: score.items.filter((i) => i.skillBand === "organizing"),
    inferential: score.items.filter((i) => i.skillBand === "inferential"),
  };
  const bandLine = (name: string, rows: InterpretiveItemBreakdown[]) => {
    if (rows.length === 0) return "";
    const hit = rows.filter((r) => r.correct).length;
    return `${name}: ${hit}/${rows.length} items`;
  };
  return [
    "INTERPRETIVE COMPREHENSION SCORE (computed from this session — use for recommended_level)",
    `Score point: ${score.scorePoint}/7 (${score.label})`,
    `Weighted accuracy: ${score.weightedPct}% (raw ${score.rawPct}%)`,
    `Meets task at this level: ${score.meetsTask}`,
    bandLine("Literal (picture tap / MC detail)", bands.literal),
    bandLine("Organizing (sequence / match / sort)", bands.organizing),
    bandLine("Inferential (agree-disagree / purpose)", bands.inferential),
    "Skill bands: Literal = word/detail in text or picture. Organizing = order, pairs, categories. Inferential = gist, purpose, agree/disagree.",
    "Do not print 0–7 numbers to the student in summary or next_steps.",
  ].filter(Boolean).join("\n");
}

export function interpretiveScoringBlockForPrompt(): string {
  return [
    "INTERPRETIVE COMPREHENSION RUBRIC (listening/reading only)",
    "Score points 0–7 from weighted item accuracy:",
    "  0 — no usable evidence / all missed",
    "  1–2 — emerging literal recognition",
    "  3 — adequate literal or partial main idea at this level",
    "  4 — solid comprehension for this level (main idea + supporting detail)",
    "  5–6 — strong across item types including organizing/inferential",
    "  7 — exemplary band-ready comprehension on this session",
    "Item weights: picture/MC (literal) < sequence/match/sort (organizing) < agree-disagree (inferential).",
    "Use interpretive_score in the user JSON when present. Align recommended_level with it unless answers show a clear reason to adjust.",
  ].join("\n");
}
