/**
 * ACCESS Speaking (5 categories) and Writing (0–7) from
 * src/data/wida_scoring_rubrics_data.json — not the homemade practice scales.
 */
import rubricData from "../data/wida_scoring_rubrics_data.json";

export type SpeakingCategory =
  | "Exemplary"
  | "Strong"
  | "Adequate"
  | "Attempted"
  | "No Response";

export const SPEAKING_CATEGORIES_HIGH_TO_LOW = rubricData.speaking_rubric
  .categories_high_to_low as SpeakingCategory[];

/** Language Chart dimensions (Discourse / Sentence / Word-Phrase). */
export const ACCESS_LANGUAGE_FORMS = ["discourse", "sentence", "word_phrase"] as const;

const SPEAKING_RANK: Record<SpeakingCategory, number> = {
  Exemplary: 4,
  Strong: 3,
  Adequate: 2,
  Attempted: 1,
  "No Response": 0,
};

export type SpeakingPreScore = {
  isP1: boolean;
  shortCircuit: SpeakingCategory | null;
  cap: SpeakingCategory | null;
  reasons: string[];
};

export type WritingScore0 = {
  isZero: boolean;
  reasons: string[];
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function englishTokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => /[a-z]/i.test(t) && t.length > 0);
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => englishTokens(s).length >= 3).length;
}

function hasLatinLetters(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

function tokenSet(text: string): Set<string> {
  const stop = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "is", "are", "was", "i", "you", "it"]);
  return new Set(englishTokens(text).filter((t) => t.length > 2 && !stop.has(t)));
}

function overlapRatio(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let hit = 0;
  for (const t of sa) if (sb.has(t)) hit += 1;
  return hit / sa.size;
}

function isVerbatimCopy(student: string, source: string): boolean {
  const s = normalize(student);
  const src = normalize(source);
  if (s.length < 8 || src.length < 8) return false;
  if (s === src) return true;
  if (src.includes(s) && s.split(" ").length >= 4) return true;
  const sTok = englishTokens(student);
  const srcTok = englishTokens(source);
  if (sTok.length < 4 || srcTok.length < 4) return false;
  const joinedSrc = srcTok.join(" ");
  const joinedS = sTok.join(" ");
  return joinedSrc.includes(joinedS) && sTok.length / srcTok.length >= 0.7;
}

export function parseSpeakingCategory(value: unknown): SpeakingCategory | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (raw === "exemplary") return "Exemplary";
  if (raw === "strong") return "Strong";
  if (raw === "adequate") return "Adequate";
  if (raw === "attempted") return "Attempted";
  if (raw === "no response" || raw === "noresponse") return "No Response";
  return null;
}

export function clampSpeakingCategory(
  category: SpeakingCategory,
  cap: SpeakingCategory | null,
): SpeakingCategory {
  if (!cap) return category;
  return SPEAKING_RANK[category] > SPEAKING_RANK[cap] ? cap : category;
}

/** Practice Next: Adequate, Strong, or Exemplary. Attempted / No Response stay on the item. */
export function speakingCategoryMeetsTask(category: SpeakingCategory, _level?: number): boolean {
  return SPEAKING_RANK[category] >= SPEAKING_RANK.Adequate;
}

export function speakingCategoryToJudgment(
  category: SpeakingCategory,
  level: number,
): "agree" | "partial" | "rejected" {
  if (speakingCategoryMeetsTask(category, level)) return "agree";
  return "rejected";
}

/**
 * Practice Next vs ACCESS 0–7.
 * Score 2 = one sentence (not connected) — not enough if the task wants 2+ sentences.
 * Score 3+ = connected text ≈ Adequate and above.
 */
export function writingScoreMeetsTask(
  scorePoint: number,
  level: number,
  minSentences = 1,
): boolean {
  if (scorePoint <= 0) return false;
  const needConnected = minSentences >= 2 || level >= 2;
  if (needConnected) return scorePoint >= 3;
  return scorePoint >= 2;
}

export function applySpeakingHardRules(input: {
  transcript: string;
  level: number;
  prompt?: string;
  modelText?: string;
  imageTags?: string[];
}): SpeakingPreScore {
  const reasons: string[] = [];
  const isP1 = input.level <= 2;
  const text = input.transcript.trim();
  const tokens = englishTokens(text);
  const prompt = input.prompt ?? "";
  const model = input.modelText ?? "";

  if (!text || tokens.length === 0 || !hasLatinLetters(text)) {
    reasons.push("no English response");
    return { isP1, shortCircuit: "No Response", cap: null, reasons };
  }

  if (/^(i\s*(don'?t|do not)\s+know|idk|i have no idea)\.?$/i.test(normalize(text))) {
    reasons.push("I don't know");
    return { isP1, shortCircuit: "Attempted", cap: null, reasons };
  }

  if (prompt && isVerbatimCopy(text, prompt)) {
    reasons.push("repeats the task question");
    return { isP1, shortCircuit: "Attempted", cap: null, reasons };
  }

  if (isP1 && model && isVerbatimCopy(text, model) && tokens.length <= 8) {
    reasons.push("verbatim repetition from model (P1)");
    return { isP1, shortCircuit: "Attempted", cap: null, reasons };
  }

  if (isP1 && tokens.length === 1) {
    reasons.push("P1 single English word");
    return { isP1, shortCircuit: "Attempted", cap: null, reasons };
  }

  let cap: SpeakingCategory | null = null;

  const topicBlob = [prompt, ...(input.imageTags ?? [])].join(" ");
  if (tokens.length >= 8 && topicBlob.trim() && overlapRatio(text, topicBlob) < 0.08) {
    cap = "Adequate";
    reasons.push("possible off-topic: cap Adequate");
  }

  const sentences = sentenceCount(text);
  const sophisticated = /[,:;]|\b(because|although|however|therefore|which)\b/i.test(text);
  if (sentences < 2 && !sophisticated) {
    cap = cap ? (SPEAKING_RANK[cap] < SPEAKING_RANK.Adequate ? cap : "Adequate") : "Adequate";
    reasons.push("grades 4–12: Strong needs two original sentences or one sophisticated sentence");
  }

  if (isP1 && tokens.length >= 2 && sentences < 1) {
    cap = "Adequate";
    reasons.push("P1 two or more words without a sentence: Adequate ceiling unless AI finds more");
  }

  return { isP1, shortCircuit: null, cap, reasons };
}

export function applyWritingScore0(input: {
  response: string;
  prompt?: string;
  stimulus?: string;
}): WritingScore0 {
  const reasons: string[] = [];
  const text = input.response.trim();
  const tokens = englishTokens(text);

  if (!text || tokens.length === 0) {
    reasons.push("blank");
    return { isZero: true, reasons };
  }
  if (!hasLatinLetters(text)) {
    reasons.push("no discernible English words");
    return { isZero: true, reasons };
  }
  if (input.prompt && isVerbatimCopy(text, input.prompt)) {
    reasons.push("verbatim copying of prompt");
    return { isZero: true, reasons };
  }
  if (input.stimulus && isVerbatimCopy(text, input.stimulus)) {
    reasons.push("verbatim copying of stimulus");
    return { isZero: true, reasons };
  }
  return { isZero: false, reasons };
}

export function serializeSpeakingRubricForPrompt(): string {
  const r = rubricData.speaking_rubric;
  const lines: string[] = [
    "ACCESS SPEAKING RUBRIC (official categories — score against these, not homemade dimensions)",
    `Categories high to low: ${r.categories_high_to_low.join(" > ")}`,
  ];
  for (const cat of r.categories_high_to_low) {
    const bullets = r.descriptors[cat as keyof typeof r.descriptors] ?? [];
    lines.push(`${cat}:`);
    for (const b of bullets) lines.push(`  - ${b}`);
  }
  lines.push("Task-level rules:");
  lines.push(`  P1: ${r.task_level_guidance.P1_tasks}`);
  lines.push(`  Grades 4–12 (this app is 6–8): ${r.task_level_guidance.grades_4_12}`);
  lines.push(`  P3–P5: ${r.task_level_guidance.P3_P5_tasks}`);
  lines.push("Scoring notes:");
  for (const n of r.scoring_notes) lines.push(`  - ${n}`);
  lines.push("Language Forms: Discourse, Sentence, Word-Phrase (not “Language Control”).");
  lines.push("Do not print category names or 0–7 numbers in student-facing spoken_text.");
  return lines.join("\n");
}

export function serializeWritingRubricForPrompt(): string {
  const r = rubricData.writing_rubric;
  const lines: string[] = [
    "ACCESS WRITING RUBRIC (holistic score points 0–7 — not a 0–100 weighted mix)",
    r.scale,
  ];
  for (const point of ["7", "6", "5", "4", "3", "2", "1", "0"] as const) {
    lines.push(`Score point ${point}:`);
    for (const b of r.score_points[point]) lines.push(`  - ${b}`);
  }
  lines.push("Language Forms: Discourse (organization/cohesion), Sentence (structures), Word-Phrase (word choice).");
  lines.push("Key language use taxonomy: Narrate, Inform, Explain, Argue.");
  lines.push("Do not print 0–7 numbers in student-facing spoken_text or coaching_note.");
  return lines.join("\n");
}

export function accessRubricBlockForDomain(domain: string): {
  kind: "speaking" | "writing" | "none";
  text: string;
} {
  const d = domain.replace(/_academic$/i, "").toLowerCase();
  if (d === "speaking") return { kind: "speaking", text: serializeSpeakingRubricForPrompt() };
  if (d === "writing") return { kind: "writing", text: serializeWritingRubricForPrompt() };
  return { kind: "none", text: "" };
}

/** For logs: did this Claude payload actually include the official ACCESS text? */
export function rubricPromptAudit(promptText: string) {
  return {
    speakingRubricInPrompt: promptText.includes("ACCESS SPEAKING RUBRIC"),
    writingRubricInPrompt: promptText.includes("ACCESS WRITING RUBRIC"),
  };
}

export function writingDescriptorBullets(scorePoint: number): string[] {
  const key = String(Math.max(0, Math.min(7, Math.round(scorePoint)))) as
    | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
  return [...(rubricData.writing_rubric.score_points[key] ?? [])];
}

export function speakingShortCircuitCoach(category: SpeakingCategory): string {
  if (category === "No Response") {
    return "Say something in English about the question on the screen.";
  }
  if (category === "Attempted") {
    return "Give a fuller answer in English. Use more than one word. Talk about the task on the screen.";
  }
  return "Try again. Answer the question on the screen.";
}

export function writingZeroCoach(): string {
  return "Write your own words in English. Do not copy the prompt. Use at least one clear sentence.";
}
