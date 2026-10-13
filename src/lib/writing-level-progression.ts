/**
 * Writing rubric helpers — level placement lives in performance-level-update.ts.
 */

/** Student-facing 1–2 word label for ACCESS writing score points. */
export function writingRubricLabel(scorePoint: number): string {
  const s = Math.max(0, Math.min(7, Math.round(scorePoint)));
  const labels: Record<number, string> = {
    0: "No credit",
    1: "Emerging",
    2: "Developing",
    3: "Connected",
    4: "Proficient",
    5: "Strong",
    6: "Advanced",
    7: "Exemplary",
  };
  return labels[s] ?? "Developing";
}

function readAnswerContentField(
  answers: Array<{ content?: unknown }> | undefined,
  key: string,
): unknown {
  const content = answers?.[0]?.content;
  if (!content || typeof content !== "object") return null;
  return (content as Record<string, unknown>)[key];
}

/** Read rubric saved on the writing answer payload from item-feedback. */
export function extractWritingRubricFromAnswers(
  answers: Array<{ content?: unknown }> | undefined,
): number | null {
  const raw = readAnswerContentField(answers, "accessWritingScore");
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(7, Math.round(n)));
}

export function extractWritingMinSentencesFromAnswers(
  answers: Array<{ content?: unknown }> | undefined,
): number {
  const raw = readAnswerContentField(answers, "minSentences");
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
