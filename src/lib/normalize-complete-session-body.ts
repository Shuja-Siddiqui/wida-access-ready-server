/**
 * Coerce client complete-session payloads so generated Zod schemas never reject
 * on rounding (scorePct, durationSeconds) or slightly loose answer shapes.
 */
export function normalizeCompleteSessionBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const raw = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };

  if (typeof raw.scorePct === "number" && Number.isFinite(raw.scorePct)) {
    out.scorePct = Math.round(raw.scorePct);
  }

  if (typeof raw.durationSeconds === "number" && Number.isFinite(raw.durationSeconds)) {
    out.durationSeconds = Math.round(raw.durationSeconds);
  }

  if (Array.isArray(raw.answers)) {
    out.answers = raw.answers.map(normalizeSessionAnswerInput);
  }

  return out;
}

function normalizeSessionAnswerInput(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { question: "", correct: false };
  }

  const ans = entry as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    question: typeof ans.question === "string" ? ans.question : String(ans.question ?? ""),
    correct: ans.correct === true,
  };

  const content = ans.content;
  if (content !== null && content !== undefined && typeof content === "object" && !Array.isArray(content)) {
    normalized.content = content;
  }

  if ("submittedAnswer" in ans) {
    normalized.submittedAnswer = ans.submittedAnswer;
  }

  return normalized;
}
