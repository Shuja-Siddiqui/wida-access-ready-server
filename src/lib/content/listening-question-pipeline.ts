/**
 * Parse, validate, and gate listening questions so interactive types render
 * as interactives (not MC-fallback) while keeping format variety per session.
 */

import { clampToThreeOptions } from "../choice-options";
import { parseOptionDiagrams, parseVisual } from "../claude/prompts/optional-line-visuals";
import { toDisplayText } from "../claude/client";
import {
  resolveQuestionUi,
  validateQuestionShape,
  type SessionUiComponent,
} from "./session-content-schema.js";

const INTERACTIVE_DECLARED = new Set([
  "sequence_order",
  "sequence_ordering",
  "match_columns",
  "pair_matching",
  "classify",
  "category_sorting",
]);

const INTERACTIVE_FORMATS = ["sequence_ordering", "pair_matching", "category_sorting"] as const;

export function buildListeningQuestionTypePlan(
  permittedFormats: string[],
  questionCount: number,
  rotationSeed: number,
): string[] {
  const permitted = [...new Set(permittedFormats.filter(Boolean))];
  if (permitted.length === 0) {
    return Array.from({ length: questionCount }, () => "multiple_choice");
  }

  const seed = ((Math.floor(rotationSeed) % 997) + 997) % 997;
  const interactive = permitted.filter((f) =>
    (INTERACTIVE_FORMATS as readonly string[]).includes(f),
  );
  const nonMc = permitted.filter((f) => f !== "multiple_choice");

  const pool: string[] = [];
  if (questionCount >= 3 && interactive.length > 0) {
    for (let i = 0; i < interactive.length; i++) {
      pool.push(interactive[(seed + i) % interactive.length]);
    }
  }
  for (const f of nonMc) {
    if (!pool.includes(f)) pool.push(f);
  }
  if (permitted.includes("multiple_choice") && !pool.includes("multiple_choice")) {
    pool.push("multiple_choice");
  }
  if (pool.length === 0) pool.push(permitted[seed % permitted.length] ?? "multiple_choice");

  const plan: string[] = [];
  for (let i = 0; i < questionCount; i++) {
    plan.push(pool[(seed + i) % pool.length] ?? pool[0]);
  }

  const minDistinct =
    questionCount >= 2 && permitted.length >= 2
      ? Math.min(2, questionCount, permitted.length)
      : 1;
  if (new Set(plan).size < minDistinct && pool.length >= 2) {
    const alt = pool.find((f) => f !== plan[0]) ?? pool[1];
    if (questionCount > 1) plan[1] = alt;
  }

  return plan;
}

export type MappedListeningQuestion = {
  id: string;
  type: string;
  question: string;
  visual?: string;
  optionDiagrams?: (string | null)[];
  options?: string[];
  correct?: number;
  explanation?: string;
  left_items?: string[];
  right_items?: string[];
  correct_pairs?: [number, number][];
  items?: string[];
  correct_order?: number[];
  answer?: "agree" | "disagree";
  categories?: string[];
  correct_categories?: number[];
};

export function normalizeListeningQuestionRaw(q: Record<string, unknown>): Record<string, unknown> {
  const out = { ...q };
  const left = (out.left ?? out.left_items) as string[] | undefined;
  const right = (out.right ?? out.right_items) as string[] | undefined;
  if (left?.length) {
    out.left_items = left;
    out.left = left;
  }
  if (right?.length) {
    out.right_items = right;
    out.right = right;
  }
  if (out.type === "category_sorting" && !out.correct_categories && Array.isArray(out.correct)) {
    out.correct_categories = out.correct;
  }
  return out;
}

export function mapListeningQuestionsFromClaude(
  raw: Array<Record<string, unknown>> | undefined,
): MappedListeningQuestion[] {
  return (raw ?? []).map((rawQ, i) => {
    const q = normalizeListeningQuestionRaw(rawQ);
    const type = String(q.type ?? "multiple_choice");
    const three = Array.isArray(q.options)
      ? clampToThreeOptions(q.options as string[], q.correct as number | undefined)
      : { options: undefined as string[] | undefined, correct: q.correct as number | undefined };

    return {
      id: String(q.id ?? i + 1),
      type,
      question: toDisplayText((q.question as string) ?? ""),
      visual: parseVisual(q.visual),
      optionDiagrams: parseOptionDiagrams(q.option_diagrams)?.slice(0, three.options?.length ?? 3),
      options: three.options,
      correct: three.correct,
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
      left_items: (q.left_items ?? q.left) as string[] | undefined,
      right_items: (q.right_items ?? q.right) as string[] | undefined,
      correct_pairs: q.correct_pairs as [number, number][] | undefined,
      items: q.items as string[] | undefined,
      correct_order: q.correct_order as number[] | undefined,
      answer: q.answer as "agree" | "disagree" | undefined,
      categories: q.categories as string[] | undefined,
      correct_categories: (q.correct_categories ?? q.correct) as number[] | undefined,
    };
  });
}

function normalizeOverlapText(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function overlapWordRatio(a: string, b: string): number {
  const stop = new Set([
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are", "was", "were",
    "what", "why", "how", "when", "where", "who", "which", "do", "does", "did", "can", "could",
    "this", "that", "these", "those", "it", "they", "we", "you", "your", "from", "with", "about",
  ]);
  const words = (t: string) =>
    normalizeOverlapText(t)
      .split(" ")
      .filter((w) => w.length > 2 && !stop.has(w));
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / Math.min(A.size, B.size);
}

function questionContentBlob(q: MappedListeningQuestion): string {
  return [
    q.question,
    ...(q.options ?? []),
    ...(q.items ?? []),
    ...(q.left_items ?? []),
    ...(q.right_items ?? []),
    ...(q.categories ?? []),
  ].join(" ");
}

function spokenQuestionsInScript(script: string): string[] {
  const out: string[] = [];
  for (const part of script.split(/(?<=[.!?])\s+/)) {
    const t = part.trim();
    if (t.includes("?")) out.push(t);
  }
  return out;
}

export function listeningQuestionAlignmentIssues(
  audioScript: string,
  questions: MappedListeningQuestion[],
): string[] {
  const issues: string[] = [];
  const script = audioScript.trim();
  if (!script || questions.length === 0) return issues;

  questions.forEach((q, i) => {
    const blob = questionContentBlob(q);
    const r = overlapWordRatio(script, blob);
    if (r < 0.1) {
      issues.push(
        `Question ${i + 1}: content looks unrelated to audio_script (low word overlap) — rewrite stem/options/items so answers come only from what was heard.`,
      );
    }
  });

  const scriptQs = spokenQuestionsInScript(script);
  const studentStems = questions.map((q) => q.question).filter(Boolean);
  for (const sq of scriptQs) {
    let best = 0;
    for (const stem of studentStems) {
      best = Math.max(best, overlapWordRatio(sq, stem));
    }
    if (best < 0.2) {
      issues.push(
        `audio_script asks "${sq.slice(0, 100)}${sq.length > 100 ? "…" : ""}" but no student question assesses that idea — add or replace a question to match.`,
      );
    }
  }

  return issues;
}

export function listeningQuestionMcFallback(q: Record<string, unknown>): boolean {
  const declared = String(q.type ?? "");
  if (!INTERACTIVE_DECLARED.has(declared)) return false;
  const ui = resolveQuestionUi("listening", q);
  return ui === "multiple_choice";
}

export type ListeningSessionValidation = {
  ok: boolean;
  mcFallbackCount: number;
  distinctDeclaredTypes: number;
  distinctResolvedUi: number;
  issues: string[];
};

export function validateListeningSessionQuestions(
  questions: MappedListeningQuestion[],
  permittedFormats: string[],
  questionCount: number,
  audioScript?: string,
): ListeningSessionValidation {
  const issues: string[] = [];
  if (questions.length !== questionCount) {
    issues.push(`Expected ${questionCount} questions, got ${questions.length}.`);
  }

  let mcFallbackCount = 0;
  const declaredTypes = new Set<string>();
  const resolvedUi = new Set<SessionUiComponent>();

  questions.forEach((q, i) => {
    declaredTypes.add(q.type);
    const raw = q as unknown as Record<string, unknown>;
    const v = validateQuestionShape(raw);
    const ui = resolveQuestionUi("listening", raw);
    if (ui !== "unsupported") resolvedUi.add(ui);

    if (!permittedFormats.includes(q.type)) {
      issues.push(`Question ${i + 1}: type "${q.type}" not in permitted formats.`);
    }
    if (v.missingFields.length > 0 && INTERACTIVE_DECLARED.has(q.type)) {
      issues.push(
        `Question ${i + 1} (${q.type}): missing ${v.missingFields.join(", ")} — use interactive fields, not options-only.`,
      );
    }
    if (listeningQuestionMcFallback(raw)) {
      mcFallbackCount += 1;
      issues.push(
        `Question ${i + 1}: type "${q.type}" fell back to multiple_choice — add required interactive fields.`,
      );
    }
  });

  const permitted = new Set(permittedFormats);
  const interactivePermitted = [...permitted].filter((t) => INTERACTIVE_DECLARED.has(t));
  const minDistinct =
    questionCount >= 2 && permitted.size >= 2
      ? Math.min(2, questionCount, permitted.size)
      : 1;
  if (declaredTypes.size < minDistinct) {
    issues.push(
      `Use at least ${minDistinct} different question type(s) from ${permittedFormats.join(", ")} — got ${[...declaredTypes].join(", ") || "none"}.`,
    );
  }

  if (
    questionCount >= 3
    && interactivePermitted.length > 0
    && !questions.some((q) => INTERACTIVE_DECLARED.has(q.type))
  ) {
    issues.push(
      `Include at least one interactive question (${interactivePermitted.join(" or ")}) when permitted.`,
    );
  }

  if (audioScript?.trim()) {
    issues.push(...listeningQuestionAlignmentIssues(audioScript, questions));
  }

  const ok = issues.length === 0;
  return {
    ok,
    mcFallbackCount,
    distinctDeclaredTypes: declaredTypes.size,
    distinctResolvedUi: resolvedUi.size,
    issues,
  };
}

export function buildListeningQuestionsFixPrompt(
  payload: {
    audio_script: string;
    topic: string;
    context: string;
    questions: MappedListeningQuestion[];
  },
  validation: ListeningSessionValidation,
  permittedFormats: string[],
  questionCount: number,
  questionTypePlan?: string[],
): string {
  return JSON.stringify({
    task: "Fix ONLY the questions array. Keep audio_script, topic, and context unchanged.",
    permitted_formats: permittedFormats,
    question_count: questionCount,
    question_type_plan:
      questionTypePlan
      ?? buildListeningQuestionTypePlan(permittedFormats, questionCount, validation.distinctDeclaredTypes),
    validation_errors: validation.issues,
    rules: [
      "Match each question's \"type\" to question_type_plan[i] when possible — repair shapes, do not collapse all to multiple_choice.",
      "sequence_ordering: items (3–5 strings) + correct_order (same length as items).",
      "pair_matching: left_items + right_items (scrambled) + correct_pairs [[leftIdx, rightIdx], ...].",
      "category_sorting: categories + items + correct_categories (one category index per item).",
      "multiple_choice / agree_disagree: exactly 3 options + correct index.",
      "Use at least two different question types when formats allow.",
      "Every question must assess the SAME audio_script — rewrite stems/options/items; do not change audio_script.",
      "Do not leave quiz questions only inside audio_script — each assessed idea needs a matching questions[] item.",
    ],
    current_content: payload,
    output: { questions: "[ ... fixed questions only ... ]" },
  });
}
