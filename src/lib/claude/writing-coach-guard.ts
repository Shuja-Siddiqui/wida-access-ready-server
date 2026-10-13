/** Writing coaching — no paste-ready model answers; detect copy-paste retries. */

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeForCompare(text).split(" ").filter((w) => w.length > 2));
}

/** Share of longer token set covered by the shorter (0–1). */
function tokenOverlapRatio(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const w of small) {
    if (large.has(w)) hit += 1;
  }
  return hit / small.size;
}

/** Strip paste-ready lines from writing coaching shown to students. */
export function stripWritingCopyableModels(text: string): string {
  return text
    .replace(/\s*you can write:[\s\S]*/i, "")
    .replace(/\s*try writing:[\s\S]*/i, "")
    .replace(/\s*for example,? you (?:could|might|should) write:[\s\S]*/i, "")
    .replace(/\s*example response:[\s\S]*/i, "")
    .replace(/\s*now add more[^.?!]*[.?!]?/gi, "")
    .replace(/\s*now write why[^.?!]*[.?!]?/gi, "")
    .replace(/\s*add more sentences[^.?!]*[.?!]?/gi, "")
    .replace(/\bgood start!?\s*/gi, "")
    .trim();
}

/** Extract model lines coaches sometimes still emit despite instructions. */
export function extractWritingModelFromCoach(coachText: string): string {
  const m = coachText.match(/\byou can write:\s*([\s\S]+)/i);
  return m ? m[1].trim() : "";
}

/**
 * Retry answer likely pasted from prior coaching (not an original revision).
 */
export function writingAnswerEchoesCoach(
  studentAnswer: string,
  lastCoachTip: string | undefined,
  lastStudentAnswer: string | undefined,
): boolean {
  const answer = studentAnswer.trim();
  if (!answer || !lastCoachTip?.trim()) return false;

  const normAnswer = normalizeForCompare(answer);
  if (lastStudentAnswer?.trim()) {
    const normLast = normalizeForCompare(lastStudentAnswer);
    if (normAnswer === normLast) return true;
  }

  const strippedCoach = stripWritingCopyableModels(lastCoachTip);
  const embeddedModel = extractWritingModelFromCoach(lastCoachTip);
  const coachBody = embeddedModel || strippedCoach;
  if (!coachBody) return false;

  const normCoach = normalizeForCompare(coachBody);
  if (normCoach.length >= 20 && normAnswer.includes(normCoach)) return true;
  if (normCoach.length >= 20 && normCoach.includes(normAnswer) && normAnswer.length >= 15) {
    return true;
  }

  return tokenOverlapRatio(answer, coachBody) >= 0.72;
}
