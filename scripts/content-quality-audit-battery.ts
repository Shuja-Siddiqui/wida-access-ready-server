/**
 * Live Claude content battery: 25 generates per domain (100 total by default).
 * Env: AUDIT_PER_DOMAIN=25, AUDIT_SLEEP_MS=1000, AUDIT_DOMAINS=listening (optional)
 * AUDIT_BATTERY_CALLS caps total runs (default: PER_DOMAIN × selected domains).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateReadingContent,
  generateSpeakingContent,
  generateWritingContent,
  FALLBACK_READING,
  pickListeningFallback,
} from "../src/lib/claude";
import {
  generateAcademicElaListeningContent,
  generateAcademicMathListeningContent,
  generateAcademicScienceListeningContent,
  generateAcademicSocialStudiesListeningContent,
} from "../src/lib/claude";
import type { AcademicSubject } from "../src/lib/content/listeningContentEngine";
import {
  buildAcademicListeningContext,
  type AcademicSessionRef,
} from "../src/lib/content/listeningContentEngine";
import { buildReadingContext } from "../src/lib/content/readingContentEngine";
import { buildSpeakingContext } from "../src/lib/content/speakingContentEngine";
import { buildWritingContext } from "../src/lib/content/writingContentEngine";
import { buildAcademicSessionContext } from "../src/lib/academic/academicSubjectContent";
import {
  resolveQuestionUi,
  validateQuestionShape,
  type SessionDomain,
} from "../src/lib/content/session-content-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.join(__dirname, "../reports");

const PER_DOMAIN = Number(process.env.AUDIT_PER_DOMAIN ?? "25");
const SLEEP_MS = Number(process.env.AUDIT_SLEEP_MS ?? "1000");
const DOMAIN_FILTER = (process.env.AUDIT_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as Domain[];
const ALL_DOMAINS: Domain[] = ["listening", "reading", "speaking", "writing"];
const DOMAINS: Domain[] =
  DOMAIN_FILTER.length > 0
    ? DOMAIN_FILTER.filter((d) => ALL_DOMAINS.includes(d))
    : ALL_DOMAINS;
const PLANNED_CALLS = PER_DOMAIN * DOMAINS.length;
const TOTAL = (() => {
  const raw = process.env.AUDIT_BATTERY_CALLS?.trim();
  if (!raw) return PLANNED_CALLS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return PLANNED_CALLS;
  return Math.min(n, PLANNED_CALLS);
})();

const LISTENING_FALLBACK_SCRIPTS = new Set(
  [0, 1, 2].map((i) => pickListeningFallback(i).audioScript.trim()),
);

const SUBJECTS: AcademicSubject[] = ["ela", "math", "science", "social_studies"];
const KLUS = ["Narrate", "Inform", "Explain", "Argue"] as const;

const INTERACTIVE_TYPES = new Set([
  "sequence_order",
  "sequence_ordering",
  "match_columns",
  "pair_matching",
  "classify",
  "category_sorting",
]);

type Domain = "listening" | "reading" | "speaking" | "writing";

type Row = {
  callId: number;
  domain: Domain;
  level: number;
  fractionalLevel: number;
  stepLabel: string;
  subject: string;
  keyUse: string;
  ok: boolean;
  error?: string;
  usedFallback?: boolean;
  durationMs: number;
  questionCount?: number;
  mcFallbackQuestions?: number;
  invalidShapeQuestions?: number;
  distinctQuestionTypes?: number;
  passageWords?: number;
  audioWords?: number;
  promptWords?: number;
  notes: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function wordCount(text: string | undefined): number {
  if (!text?.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function isMcFallback(q: Record<string, unknown>, domain: "listening" | "reading"): boolean {
  const declared = String(q.type ?? "");
  if (!INTERACTIVE_TYPES.has(declared)) return false;
  return resolveQuestionUi(domain, q) === "multiple_choice";
}

function analyzeQuestions(
  questions: Array<Record<string, unknown>>,
  domain: "listening" | "reading",
): Pick<
  Row,
  "questionCount" | "mcFallbackQuestions" | "invalidShapeQuestions" | "distinctQuestionTypes"
> {
  let mc = 0;
  let invalid = 0;
  const types = new Set<string>();
  for (const q of questions) {
    types.add(String(q.type ?? "?"));
    if (isMcFallback(q, domain)) mc += 1;
    const v = validateQuestionShape(q);
    if (!v.valid || v.missingFields.length > 0) invalid += 1;
  }
  return {
    questionCount: questions.length,
    mcFallbackQuestions: mc,
    invalidShapeQuestions: invalid,
    distinctQuestionTypes: types.size,
  };
}

function planCall(domain: Domain, index: number) {
  const level = 1 + (index % 6);
  const fractionalLevel = level + (index % 5) * 0.2;
  const subject = SUBJECTS[index % SUBJECTS.length];
  const keyUse = KLUS[index % KLUS.length];
  const recent: AcademicSessionRef[] = [{ subject, keyUse }];
  return { level, fractionalLevel, subject, keyUse, recent };
}

async function runListening(index: number, callId: number): Promise<Row> {
  const { level, fractionalLevel, subject, keyUse, recent } = planCall("listening", index);
  const acadCtx = buildAcademicListeningContext(fractionalLevel, [], null, null, recent);
  const sessionCtx = buildAcademicSessionContext(acadCtx.subject, fractionalLevel, null, []);
  const topic = sessionCtx.topicLabel ?? `Audit listening ${acadCtx.subject} L${level}`;
  const t0 = Date.now();
  const base: Row = {
    callId,
    domain: "listening",
    level: acadCtx.elpLevel,
    fractionalLevel,
    stepLabel: acadCtx.stepLabel,
    subject,
    keyUse: acadCtx.keyUse,
    ok: false,
    durationMs: 0,
    notes: [],
  };

  try {
    const subjectForGen = acadCtx.subject;
    let content;
    const common = {
      level: acadCtx.elpLevel,
      fractionalLevel: acadCtx.fractionalLevel,
      stepWithinLevel: acadCtx.stepWithinLevel,
      complexityInstruction: acadCtx.complexityInstruction,
      oralFormat: acadCtx.oralFormat,
      permittedFormats: acadCtx.permittedFormats,
      framework: acadCtx.framework,
      topic,
      libraryCandidates: [],
      varietySeed: index,
    };
    if (subjectForGen === "math") {
      content = await generateAcademicMathListeningContent({
        ...common,
        mathUnit: sessionCtx.unit ?? "Number sense",
        mathScenario: sessionCtx.scenarioExamples?.[0] ?? "classroom",
        tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
        frameworkContext: sessionCtx,
      });
    } else if (subjectForGen === "science") {
      content = await generateAcademicScienceListeningContent({
        ...common,
        scienceUnit: sessionCtx.unit ?? "Life Science",
        scienceStrand: sessionCtx.strand ?? "Ecosystems",
        scenarioExamples: sessionCtx.scenarioExamples ?? [],
        tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
        frameworkContext: sessionCtx,
      });
    } else if (subjectForGen === "social_studies") {
      content = await generateAcademicSocialStudiesListeningContent({
        ...common,
        ssUnit: sessionCtx.unit ?? "Civics",
        ssStrand: sessionCtx.strand ?? "Government",
        scenarioExamples: sessionCtx.scenarioExamples ?? [],
        tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
        frameworkContext: sessionCtx,
      });
    } else {
      content = await generateAcademicElaListeningContent({
        ...common,
        elaUnit: sessionCtx.unit ?? "Reading literature",
        elaGenre: sessionCtx.genre ?? "informational",
        scenarioExamples: sessionCtx.scenarioExamples ?? [],
        tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
        frameworkContext: sessionCtx,
      });
    }
    base.notes.push(`generator=academic_${subjectForGen}`);

    base.durationMs = Date.now() - t0;
    base.ok = true;
    base.audioWords = wordCount(content.audioScript);
    base.usedFallback = LISTENING_FALLBACK_SCRIPTS.has(content.audioScript.trim());
    const qs = (content.questions ?? []) as Array<Record<string, unknown>>;
    Object.assign(base, analyzeQuestions(qs, "listening"));
    if ((base.mcFallbackQuestions ?? 0) > 0) {
      base.notes.push("mc_fallback");
    }
    return base;
  } catch (err) {
    base.durationMs = Date.now() - t0;
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

async function runReading(index: number, callId: number): Promise<Row> {
  const { level, fractionalLevel, subject, keyUse, recent } = planCall("reading", index);
  const ctx = buildReadingContext(fractionalLevel, [], null, null, subject, keyUse);
  const sessionCtx = buildAcademicSessionContext(subject, fractionalLevel, null, []);
  const topic = sessionCtx.topicLabel ?? `Audit reading ${subject} L${level}`;
  const t0 = Date.now();
  const base: Row = {
    callId,
    domain: "reading",
    level: ctx.elpLevel,
    fractionalLevel,
    stepLabel: ctx.stepLabel,
    subject,
    keyUse: ctx.keyUse,
    ok: false,
    durationMs: 0,
    notes: [],
  };

  try {
    const content = await generateReadingContent({
      assessment: "formative",
      level: ctx.elpLevel,
      fractionalLevel: ctx.fractionalLevel,
      stepWithinLevel: ctx.stepWithinLevel,
      complexityInstruction: ctx.complexityInstruction,
      textFormat: ctx.textFormat,
      permittedFormats: ctx.permittedFormats,
      framework: ctx.framework,
      topic,
      gradeBand: "6-8",
      mode: "standard",
      academicSubject: subject,
      questionCount: ctx.questionCount,
      passageWordMax: ctx.passageWordMax,
      academicUnit: sessionCtx.unit,
      scenarioExamples: sessionCtx.scenarioExamples,
      tier3Vocabulary: sessionCtx.tier3Vocabulary,
      academicFramework: sessionCtx,
    });
    base.durationMs = Date.now() - t0;
    base.ok = true;
    base.passageWords = wordCount(content.passage);
    base.usedFallback = content.passage === FALLBACK_READING.passage;
    const qs = (content.questions ?? []) as Array<Record<string, unknown>>;
    Object.assign(base, analyzeQuestions(qs, "reading"));
    if ((base.mcFallbackQuestions ?? 0) > 0) base.notes.push("mc_fallback");
    return base;
  } catch (err) {
    base.durationMs = Date.now() - t0;
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

async function runSpeaking(index: number, callId: number): Promise<Row> {
  const { level, fractionalLevel, subject, keyUse, recent } = planCall("speaking", index);
  const ctx = buildSpeakingContext(fractionalLevel, [], null, null, false, subject, keyUse);
  const sessionCtx = buildAcademicSessionContext(subject, fractionalLevel, null, []);
  const topic = sessionCtx.topicLabel ?? `Audit speaking ${subject} L${level}`;
  const t0 = Date.now();
  const base: Row = {
    callId,
    domain: "speaking",
    level: ctx.elpLevel,
    fractionalLevel,
    stepLabel: ctx.stepLabel,
    subject,
    keyUse: ctx.keyUse,
    ok: false,
    durationMs: 0,
    notes: [],
  };

  try {
    const content = await generateSpeakingContent({
      assessment: "formative",
      level: ctx.elpLevel,
      fractionalLevel: ctx.fractionalLevel,
      stepWithinLevel: ctx.stepWithinLevel,
      complexityInstruction: ctx.complexityInstruction,
      discourseType: ctx.discourseType,
      responseLength: ctx.responseLength,
      allowedPromptTypes: ctx.allowedPromptTypes,
      targetSeconds: ctx.targetSeconds,
      framework: ctx.framework,
      topic,
      gradeBand: "6-8",
      mode: "standard",
      academicSubject: subject,
      academicUnit: sessionCtx.unit,
      scenarioExamples: sessionCtx.scenarioExamples,
      tier3Vocabulary: sessionCtx.tier3Vocabulary,
      academicFramework: sessionCtx,
    });
    base.durationMs = Date.now() - t0;
    base.ok = true;
    base.promptWords = wordCount(content.prompt);
    if (content.scaffold) base.notes.push("has_scaffold");
    base.notes.push(`prompt_type=${content.promptType ?? "?"}`);
    return base;
  } catch (err) {
    base.durationMs = Date.now() - t0;
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

async function runWriting(index: number, callId: number): Promise<Row> {
  const { level, fractionalLevel, subject, keyUse, recent } = planCall("writing", index);
  const ctx = buildWritingContext(fractionalLevel, [], null, null, subject, keyUse as typeof KLUS[number]);
  const sessionCtx = buildAcademicSessionContext(subject, fractionalLevel, null, []);
  const topic = sessionCtx.topicLabel ?? `Audit writing ${subject} L${level}`;
  const t0 = Date.now();
  const base: Row = {
    callId,
    domain: "writing",
    level: ctx.elpLevel,
    fractionalLevel,
    stepLabel: ctx.stepLabel,
    subject,
    keyUse: ctx.keyUse,
    ok: false,
    durationMs: 0,
    notes: [],
  };

  try {
    const content = await generateWritingContent({
      assessment: "formative",
      level: ctx.elpLevel,
      fractionalLevel: ctx.fractionalLevel,
      stepWithinLevel: ctx.stepWithinLevel,
      complexityInstruction: ctx.complexityInstruction,
      taskType: ctx.taskType,
      minSentences: ctx.minSentences,
      framework: ctx.framework,
      topic,
      gradeBand: "6-8",
      mode: "standard",
      academicSubject: subject,
      academicUnit: sessionCtx.unit,
      scenarioExamples: sessionCtx.scenarioExamples,
      tier3Vocabulary: sessionCtx.tier3Vocabulary,
      academicFramework: sessionCtx,
      libraryCandidates: [],
    });
    base.durationMs = Date.now() - t0;
    base.ok = true;
    base.promptWords = wordCount(content.prompt);
    base.passageWords = wordCount(content.passage ?? undefined);
    base.notes.push(`min_sentences=${content.minSentences ?? "?"}`);
    if (content.sentenceFrame) base.notes.push("has_sentence_frame");
    return base;
  } catch (err) {
    base.durationMs = Date.now() - t0;
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${((100 * n) / d).toFixed(1)}%`;
}

function summarizeDomain(rows: Row[], domain: Domain): string {
  const d = rows.filter((r) => r.domain === domain);
  const ok = d.filter((r) => r.ok);
  const fail = d.filter((r) => !r.ok);
  const fallbacks = ok.filter((r) => r.usedFallback);
  const lr = ok.filter((r) => r.domain === "listening" || r.domain === "reading");
  const totalQ = lr.reduce((s, r) => s + (r.questionCount ?? 0), 0);
  const mcFb = lr.reduce((s, r) => s + (r.mcFallbackQuestions ?? 0), 0);
  const invalid = lr.reduce((s, r) => s + (r.invalidShapeQuestions ?? 0), 0);
  const avgAudio = average(ok.map((r) => r.audioWords).filter(Boolean) as number[]);
  const avgPassage = average(ok.map((r) => r.passageWords).filter(Boolean) as number[]);
  const avgPrompt = average(ok.map((r) => r.promptWords).filter(Boolean) as number[]);
  const avgMs = average(ok.map((r) => r.durationMs));

  const lines = [
    `### ${domain}`,
    `- Calls: ${d.length} | Success: ${ok.length} (${pct(ok.length, d.length)}) | Failed: ${fail.length}`,
    `- Emergency fallbacks (heuristic): ${fallbacks.length}`,
  ];
  if (domain === "listening" || domain === "reading") {
    lines.push(
      `- Questions generated: ${totalQ} | MC-fallback (interactive → MC UI): ${mcFb} (${pct(mcFb, totalQ)} of questions)`,
      `- Invalid / incomplete shapes: ${invalid} (${pct(invalid, totalQ)} of questions)`,
    );
  }
  if (domain === "listening") lines.push(`- Avg audio script words (success): ${avgAudio.toFixed(0)}`);
  if (domain === "reading") lines.push(`- Avg passage words (success): ${avgPassage.toFixed(0)}`);
  if (domain === "speaking" || domain === "writing") {
    lines.push(`- Avg prompt words (success): ${avgPrompt.toFixed(0)}`);
  }
  lines.push(`- Avg latency (success): ${avgMs.toFixed(0)} ms`);

  const byKlu = groupCount(ok, (r) => r.keyUse);
  lines.push(`- Key language use mix (success): ${JSON.stringify(byKlu)}`);

  if (fail.length > 0) {
    lines.push("- Failures:");
    for (const f of fail.slice(0, 5)) {
      lines.push(`  - #${f.callId} L${f.level} ${f.subject}/${f.keyUse}: ${f.error}`);
    }
    if (fail.length > 5) lines.push(`  - … and ${fail.length - 5} more`);
  }
  return lines.join("\n");
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function groupCount<T extends string>(rows: Row[], fn: (r: Row) => T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = fn(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function buildMarkdown(rows: Row[], started: string, finished: string): string {
  const ok = rows.filter((r) => r.ok);
  const fail = rows.filter((r) => !r.ok);
  const lrOk = ok.filter((r) => r.domain === "listening" || r.domain === "reading");
  const totalQ = lrOk.reduce((s, r) => s + (r.questionCount ?? 0), 0);
  const mcFb = lrOk.reduce((s, r) => s + (r.mcFallbackQuestions ?? 0), 0);

  return `# Content quality battery report

Generated: ${finished}  
Started: ${started}  
Configuration: ${TOTAL} total calls, ${PER_DOMAIN} per domain (${DOMAINS.join(", ")}), sleep ${SLEEP_MS} ms between calls.

## Executive summary

| Metric | Value |
|--------|------:|
| Total API generates | ${rows.length} |
| Success | ${ok.length} (${pct(ok.length, rows.length)}) |
| Failed | ${fail.length} (${pct(fail.length, rows.length)}) |
| Listening + reading questions | ${totalQ} |
| **MC-fallback questions** (declared interactive, UI = multiple choice) | **${mcFb}** (${pct(mcFb, totalQ)}) |
| Emergency fallback content (heuristic) | ${ok.filter((r) => r.usedFallback).length} |

MC-fallback hurts progress when students see only multiple choice while the session claims varied formats (sequence, match, sort).

## By domain

${(["listening", "reading", "speaking", "writing"] as Domain[]).map((d) => summarizeDomain(rows, d)).join("\n\n")}

## Complexity & rotation (success calls)

| Domain | Level range | Subjects rotated | KLU rotated |
|--------|-------------|------------------|-------------|
| All | 1–6 (+ sub-steps 0–4) | ela → math → science → social_studies | Narrate, Inform, Explain, Argue |

Listening uses the same SF academic path as production (one domain \`listening\`, subject ela/math/science/social_studies). Reading/speaking/writing use the same academic session context pattern.

## Per-call log

| # | Domain | L | Subject | KLU | OK | Q | MC-fb | ms | Notes |
|---|--------|---|---------|-----|----|---|-------|-----|-------|
${rows
  .map(
    (r) =>
      `| ${r.callId} | ${r.domain} | ${r.level} | ${r.subject} | ${r.keyUse} | ${r.ok ? "yes" : "no"} | ${r.questionCount ?? "—"} | ${r.mcFallbackQuestions ?? "—"} | ${r.durationMs} | ${(r.notes.join("; ") || r.error || "").replace(/\|/g, "/").slice(0, 80)} |`,
  )
  .join("\n")}

## Factors that affect student progress

1. **MC-fallback (listening primary)** — Interactive types rendered as MC reduce format practice and can mismatch declared \`type\`.
2. **Shape validation failures** — Missing \`items\`, \`correct_order\`, pairs, or categories block interactives or mark invalid.
3. **Generator failures / fallbacks** — Failed Claude calls return static fallback passages (no progress on new language).
4. **Complexity calibration** — \`complexity_instruction\` + \`framework.pld\` should match level; audit varies level 1–6 and sub-step.
5. **KLU / subject rotation** — Ensures Narrate/Inform/Explain/Argue and four academic worlds are exercised across calls.

---
*Report produced by \`scripts/content-quality-audit-battery.ts\`*
`;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY is required in api-server/.env");
    process.exit(1);
  }

  const perDomain = PER_DOMAIN;
  const started = new Date().toISOString();
  const rows: Row[] = [];
  let callId = 0;

  fs.mkdirSync(REPORTS, { recursive: true });

  for (const domain of DOMAINS) {
    for (let i = 0; i < perDomain && callId < TOTAL; i += 1) {
      callId += 1;
      process.stdout.write(`[${callId}/${TOTAL}] ${domain} cell ${i + 1}/${perDomain}… `);
      let row: Row;
      if (domain === "listening") row = await runListening(i, callId);
      else if (domain === "reading") row = await runReading(i, callId);
      else if (domain === "speaking") row = await runSpeaking(i, callId);
      else row = await runWriting(i, callId);
      rows.push(row);
      console.log(row.ok ? "ok" : `FAIL: ${row.error?.slice(0, 60)}`);
      if (callId < TOTAL && SLEEP_MS > 0) await sleep(SLEEP_MS);
    }
  }

  const finished = new Date().toISOString();
  const stamp = finished.replace(/[:.]/g, "-").slice(0, 19);
  const mdPath = path.join(REPORTS, `content-quality-audit-battery-${stamp}.md`);
  fs.writeFileSync(mdPath, buildMarkdown(rows, started, finished), "utf-8");
  console.log(`\nWrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
