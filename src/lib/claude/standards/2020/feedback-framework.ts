/**
 * Compact 2020 framework slice for item/attempt feedback — not full content generation.
 */
import type { FrameworkTask } from "./select";
import { frameworkTaskDescriptor } from "./select";

const MAX_FUNCTIONS = 3;
const MAX_FEATURES = 4;

export function parseFrameworkTask(raw: unknown): FrameworkTask | null {
  if (!raw || typeof raw !== "object" || !("language_functions" in raw)) return null;
  return raw as FrameworkTask;
}

/** Feedback-only fields: KLU, functions, PLD target — omit reference codes and full expectations. */
export function serializeFrameworkForFeedback(task: FrameworkTask): Record<string, unknown> {
  return {
    key_language_use: task.key_language_use,
    mode: task.mode,
    task_descriptor: frameworkTaskDescriptor(task),
    language_functions: task.language_functions.slice(0, MAX_FUNCTIONS).map((f) => ({
      function: f.function,
      language_features: f.language_features.slice(0, MAX_FEATURES),
    })),
    pld: {
      level: task.pld.level,
      sentence: task.pld.sentence,
      word_phrase: task.pld.word_phrase,
      discourse: [task.pld.discourse_organization, task.pld.discourse_cohesion]
        .filter(Boolean)
        .join(" "),
    },
  };
}

export function serializeFrameworkForFeedbackFromRecord(
  raw: Record<string, unknown> | FrameworkTask | null | undefined,
): Record<string, unknown> | null {
  const task = parseFrameworkTask(raw);
  if (!task) return null;
  return serializeFrameworkForFeedback(task);
}

export type FeedbackFrameworkDomain = "listening" | "reading" | "speaking" | "writing";

/** One-line coach context from framework for feedback prompts. */
export function frameworkFeedbackCoachNote(
  framework: FrameworkTask,
  domain: FeedbackFrameworkDomain,
): string {
  const elp = framework.pld.level;
  const ku = framework.key_language_use;
  const fns = frameworkTaskDescriptor(framework);
  if (domain === "speaking") {
    return `WIDA SPEAKING Level ${elp}, Key Use ${ku}. Language functions: ${fns}.`;
  }
  if (domain === "writing") {
    return `WIDA WRITING Level ${elp}, Key Use ${ku}. Language functions: ${fns}.`;
  }
  return `WIDA ${domain.toUpperCase()} Level ${elp}, Key Use ${ku}. Comprehension functions: ${fns}.`;
}
