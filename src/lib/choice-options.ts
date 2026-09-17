/** Selected-response items are always 1 correct + N distractors. */

function clampToOptions(
  options: unknown,
  correct: unknown,
  max: number,
): { options: string[]; correct: number } {
  const cleaned = (Array.isArray(options) ? options : [])
    .map((o) => String(o ?? "").trim())
    .filter(Boolean);
  if (cleaned.length === 0) return { options: [], correct: 0 };

  let idx = typeof correct === "number" && Number.isFinite(correct) ? Math.trunc(correct) : 0;
  if (idx < 0 || idx >= cleaned.length) idx = 0;

  if (cleaned.length <= max) {
    return { options: cleaned.slice(0, max), correct: Math.min(idx, cleaned.length - 1) };
  }

  if (idx < max) {
    return { options: cleaned.slice(0, max), correct: idx };
  }

  const picked = [...cleaned.slice(0, max - 1), cleaned[idx]];
  return { options: picked, correct: max - 1 };
}

/** Listening and academic-subject generators: 1 correct + 2 distractors (WIDA Listening format). */
export function clampToThreeOptions(
  options: unknown,
  correct: unknown,
): { options: string[]; correct: number } {
  return clampToOptions(options, correct, 3);
}

/** Reading, grades 6-8: 1 correct + 3 distractors (real WIDA ACCESS Reading format at this grade band). */
export function clampToFourOptions(
  options: unknown,
  correct: unknown,
): { options: string[]; correct: number } {
  return clampToOptions(options, correct, 4);
}
