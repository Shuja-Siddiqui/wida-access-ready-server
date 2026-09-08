/** Selected-response items are always 1 correct + 2 distractors. */

export function clampToThreeOptions(
  options: unknown,
  correct: unknown,
): { options: string[]; correct: number } {
  const cleaned = (Array.isArray(options) ? options : [])
    .map((o) => String(o ?? "").trim())
    .filter(Boolean);
  if (cleaned.length === 0) return { options: [], correct: 0 };

  let idx = typeof correct === "number" && Number.isFinite(correct) ? Math.trunc(correct) : 0;
  if (idx < 0 || idx >= cleaned.length) idx = 0;

  if (cleaned.length <= 3) {
    return { options: cleaned.slice(0, 3), correct: Math.min(idx, cleaned.length - 1) };
  }

  if (idx < 3) {
    return { options: cleaned.slice(0, 3), correct: idx };
  }

  const picked = [cleaned[0], cleaned[1], cleaned[idx]];
  return { options: picked, correct: 2 };
}
