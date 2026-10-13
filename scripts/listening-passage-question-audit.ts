/**
 * Sample live listening generates and write passage + questions for alignment review.
 * Env: ALIGNMENT_SAMPLES=10, ALIGNMENT_SLEEP_MS=400
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { buildAcademicSessionContext } from "../src/lib/academic/academicSubjectContent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.join(__dirname, "../reports");
const SAMPLES = Number(process.env.ALIGNMENT_SAMPLES ?? "10");
const SLEEP_MS = Number(process.env.ALIGNMENT_SLEEP_MS ?? "400");

const SUBJECTS: AcademicSubject[] = ["ela", "math", "science", "social_studies"];

type Sample = {
  id: number;
  generator: string;
  level: number;
  subject: string;
  keyUse: string;
  topic: string;
  context: string;
  audioScript: string;
  questions: Array<{ type: string; question: string; options?: string[]; items?: string[] }>;
  flags: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Rhetorical / direct questions spoken inside the passage (not student items). */
function questionsInScript(script: string): string[] {
  const out: string[] = [];
  for (const part of script.split(/(?<=[.!?])\s+/)) {
    const t = part.trim();
    if (t.includes("?")) out.push(t);
  }
  return out;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function wordSet(s: string): Set<string> {
  const stop = new Set([
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are", "was", "were",
    "what", "why", "how", "when", "where", "who", "which", "do", "does", "did", "can", "could",
    "this", "that", "these", "those", "it", "they", "we", "you", "your", "from", "with", "about",
  ]);
  return new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
}

function overlapRatio(a: string, b: string): number {
  const A = wordSet(a);
  const B = wordSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / Math.min(A.size, B.size);
}

function analyzeAlignment(sample: Omit<Sample, "flags">): string[] {
  const flags: string[] = [];
  const scriptQs = questionsInScript(sample.audioScript);
  const studentQs = sample.questions.map((q) => q.question.trim()).filter(Boolean);

  if (scriptQs.length > 0 && studentQs.length > 0) {
    for (const sq of scriptQs) {
      let best = 0;
      let bestStudent = "";
      for (const uq of studentQs) {
        const r = overlapRatio(sq, uq);
        if (r > best) {
          best = r;
          bestStudent = uq;
        }
      }
      if (best < 0.15) {
        flags.push(
          `passage_asks_unmatched: script contains "${sq.slice(0, 80)}${sq.length > 80 ? "…" : ""}" but no student question overlaps (best=${(best * 100).toFixed(0)}% vs "${bestStudent.slice(0, 60)}…")`,
        );
      } else if (best < 0.35 && !normalize(bestStudent).includes(normalize(sq).slice(0, 20))) {
        flags.push(
          `passage_question_weak_match: script question may not match assessed item (overlap ${(best * 100).toFixed(0)}%)`,
        );
      }
    }
  }

  for (let i = 0; i < sample.questions.length; i += 1) {
    const q = sample.questions[i];
    const stem = q.question ?? "";
    const pool = [
      stem,
      ...(q.options ?? []),
      ...(q.items ?? []),
    ].join(" ");
    const r = overlapRatio(sample.audioScript, pool);
    if (r < 0.12) {
      flags.push(
        `Q${i + 1}_low_passage_overlap: stem/options share few words with audio_script (${(r * 100).toFixed(0)}%) — "${stem.slice(0, 70)}…"`,
      );
    }
  }

  const topicNorm = normalize(sample.topic);
  if (topicNorm.length > 4) {
    const scriptHasTopic = normalize(sample.audioScript).includes(topicNorm.split(" ")[0] ?? "");
    if (!scriptHasTopic && overlapRatio(sample.topic, sample.audioScript) < 0.1) {
      flags.push(`topic_drift: topic "${sample.topic}" weakly reflected in audio_script`);
    }
  }

  return [...new Set(flags)];
}

async function runSample(index: number): Promise<Sample> {
  const level = 1 + (index % 6);
  const subject = SUBJECTS[index % SUBJECTS.length];
  const keyUse = (["Narrate", "Inform", "Explain", "Argue"] as const)[index % 4];
  const recent: AcademicSessionRef[] = [{ subject, keyUse }];
  const acadCtx = buildAcademicListeningContext(level + index * 0.2, [], null, null, recent);
  const subjectForGen = acadCtx.subject;
  const sessionCtxForSubject = buildAcademicSessionContext(subjectForGen, level + index * 0.2, null, []);
  const topic = sessionCtxForSubject.topicLabel ?? `Audit listening ${subjectForGen} L${level}`;
  const common = {
    level: acadCtx.elpLevel,
    fractionalLevel: acadCtx.fractionalLevel,
    stepWithinLevel: acadCtx.stepWithinLevel,
    complexityInstruction: acadCtx.complexityInstruction,
    oralFormat: acadCtx.oralFormat,
    permittedFormats: acadCtx.permittedFormats,
    framework: acadCtx.framework,
    topic,
    libraryCandidates: [] as [],
    varietySeed: index,
  };

  let content;
  let generator: string;
  if (subjectForGen === "math") {
    content = await generateAcademicMathListeningContent({
      ...common,
      mathUnit: sessionCtxForSubject.unit ?? "Number sense",
      mathScenario: sessionCtxForSubject.scenarioExamples?.[0] ?? "classroom",
      tier3Vocabulary: sessionCtxForSubject.tier3Vocabulary ?? [],
      frameworkContext: sessionCtxForSubject,
    });
    generator = "academic_math";
  } else if (subjectForGen === "science") {
    content = await generateAcademicScienceListeningContent({
      ...common,
      scienceUnit: sessionCtxForSubject.unit ?? "Life Science",
      scienceStrand: sessionCtxForSubject.strand ?? "Ecosystems",
      scenarioExamples: sessionCtxForSubject.scenarioExamples ?? [],
      tier3Vocabulary: sessionCtxForSubject.tier3Vocabulary ?? [],
      frameworkContext: sessionCtxForSubject,
    });
    generator = "academic_science";
  } else if (subjectForGen === "social_studies") {
    content = await generateAcademicSocialStudiesListeningContent({
      ...common,
      ssUnit: sessionCtxForSubject.unit ?? "Civics",
      ssStrand: sessionCtxForSubject.strand ?? "Government",
      scenarioExamples: sessionCtxForSubject.scenarioExamples ?? [],
      tier3Vocabulary: sessionCtxForSubject.tier3Vocabulary ?? [],
      frameworkContext: sessionCtxForSubject,
    });
    generator = "academic_social_studies";
  } else {
    content = await generateAcademicElaListeningContent({
      ...common,
      elaUnit: sessionCtxForSubject.unit ?? "Reading literature",
      elaGenre: sessionCtxForSubject.genre ?? "informational",
      scenarioExamples: sessionCtxForSubject.scenarioExamples ?? [],
      tier3Vocabulary: sessionCtxForSubject.tier3Vocabulary ?? [],
      frameworkContext: sessionCtxForSubject,
    });
    generator = "academic_ela";
  }

  const base: Omit<Sample, "flags"> = {
    id: index + 1,
    generator,
    level: acadCtx.elpLevel,
    subject,
    keyUse: acadCtx.keyUse,
    topic: content.topic,
    context: content.context,
    audioScript: content.audioScript,
    questions: (content.questions ?? []).map((q) => ({
      type: q.type,
      question: q.question,
      options: q.options,
      items: q.items,
    })),
  };

  return { ...base, flags: analyzeAlignment(base) };
}

function toMarkdown(samples: Sample[], started: string): string {
  const flagged = samples.filter((s) => s.flags.length > 0);
  const lines = [
    "# Listening passage ↔ question alignment sample",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Started: ${started}`,
    `Samples: ${samples.length}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Sessions with heuristic flags | **${flagged.length}** / ${samples.length} |`,
    `| Total flags | **${samples.reduce((n, s) => n + s.flags.length, 0)}** |`,
    "",
    "Heuristics: rhetorical `?` in audio_script vs student question overlap; word overlap between script and each question stem/options.",
    "",
  ];

  for (const s of samples) {
    lines.push(`---`, "");
    lines.push(`## Sample ${s.id} — L${s.level} ${s.subject} / ${s.keyUse} (${s.generator})`);
    lines.push("");
    lines.push(`**Topic:** ${s.topic}`);
    lines.push(`**Context:** ${s.context}`);
    if (s.flags.length > 0) {
      lines.push("");
      lines.push("**Flags:**");
      for (const f of s.flags) lines.push(`- ${f}`);
    } else {
      lines.push("");
      lines.push("**Flags:** none (heuristic)");
    }
    lines.push("");
    lines.push("### Audio script");
    lines.push("");
    lines.push(s.audioScript);
    lines.push("");
    lines.push("### Student questions");
    lines.push("");
    s.questions.forEach((q, i) => {
      lines.push(`${i + 1}. **(${q.type})** ${q.question}`);
      if (q.options?.length) lines.push(`   - Options: ${q.options.join(" | ")}`);
      if (q.items?.length) lines.push(`   - Items: ${q.items.join(" | ")}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY required");
    process.exit(1);
  }
  fs.mkdirSync(REPORTS, { recursive: true });
  const started = new Date().toISOString();
  const samples: Sample[] = [];

  for (let i = 0; i < SAMPLES; i += 1) {
    process.stdout.write(`[${i + 1}/${SAMPLES}] listening alignment… `);
    try {
      const s = await runSample(i);
      samples.push(s);
      console.log(s.flags.length ? `flags=${s.flags.length}` : "ok");
    } catch (err) {
      console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
    }
    if (i + 1 < SAMPLES && SLEEP_MS > 0) await sleep(SLEEP_MS);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const md = path.join(REPORTS, `listening-passage-question-alignment-${stamp}.md`);
  fs.writeFileSync(md, toMarkdown(samples, started), "utf8");
  console.log(`\nWrote ${md}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
