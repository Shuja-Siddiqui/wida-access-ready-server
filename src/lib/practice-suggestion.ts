import { desc, eq } from "drizzle-orm";
import { db, studentPracticeSuggestionsTable } from "../../db";
import type { AttemptFeedback } from "./claude/attempt-feedback";
import { filterStudentFacingText } from "./ai-output-filter";

const MAX_MESSAGE = 480;

function clip(text: string, max = MAX_MESSAGE): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function domainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

/** Short listenable coach note derived from end-of-session AI feedback. */
export function buildPracticeSuggestionMessage(
  domain: string,
  feedback: AttemptFeedback,
): string {
  const label = domainLabel(domain);
  const strength = feedback.strengths?.find((s) => s.trim());
  const focus =
    feedback.nextSteps?.find((s) => s.trim())
    ?? feedback.mistakes?.find((m) => m.howToImprove.trim())?.howToImprove
    ?? feedback.summary?.trim();

  const parts: string[] = [];
  if (strength) {
    parts.push(filterStudentFacingText(strength) || strength);
  }
  if (focus) {
    const cleaned = filterStudentFacingText(focus) || focus;
    parts.push(strength ? `Next, focus on this: ${cleaned}` : cleaned);
  }

  if (parts.length === 0) {
    return `Keep practicing ${label}. Complete another session to get a fresh coach note.`;
  }

  return clip(parts.join(" "));
}

export async function upsertStudentPracticeSuggestion(params: {
  studentId: string;
  domain: string;
  sessionId: string;
  feedback: AttemptFeedback;
}): Promise<void> {
  const message = buildPracticeSuggestionMessage(params.domain, params.feedback);
  const now = new Date();

  await db
    .insert(studentPracticeSuggestionsTable)
    .values({
      studentId: params.studentId,
      domain: params.domain,
      message,
      sourceSessionId: params.sessionId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        studentPracticeSuggestionsTable.studentId,
        studentPracticeSuggestionsTable.domain,
      ],
      set: {
        message,
        sourceSessionId: params.sessionId,
        updatedAt: now,
      },
    });
}

export async function listStudentPracticeSuggestions(studentId: string) {
  return db
    .select({
      domain: studentPracticeSuggestionsTable.domain,
      message: studentPracticeSuggestionsTable.message,
      updatedAt: studentPracticeSuggestionsTable.updatedAt,
    })
    .from(studentPracticeSuggestionsTable)
    .where(eq(studentPracticeSuggestionsTable.studentId, studentId))
    .orderBy(desc(studentPracticeSuggestionsTable.updatedAt));
}
