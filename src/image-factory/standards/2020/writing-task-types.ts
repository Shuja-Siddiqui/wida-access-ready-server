/**
 * Writing task size labels for Image Factory L1–L2 context (aligned with writing engine, local copy).
 */

import type { KeyLanguageUse } from "./select";

/** L1–L2 task types sent to Claude when building library image prompts. */
export const IMAGE_FACTORY_WRITING_TASK_TYPE: Record<KeyLanguageUse, Record<1 | 2, string>> = {
  Narrate: { 1: "word_phrase", 2: "sentence_completion" },
  Inform: { 1: "word_phrase", 2: "sentence_completion" },
  Explain: { 1: "word_phrase", 2: "connected_sentences" },
  Argue: { 1: "word_phrase", 2: "opinion_sentence" },
};

export function writingTaskTypeForImagePool(
  keyUse: string,
  level: number,
): string {
  const klu = keyUse as KeyLanguageUse;
  const band: 1 | 2 = level <= 1 ? 1 : 2;
  return IMAGE_FACTORY_WRITING_TASK_TYPE[klu]?.[band] ?? "word_phrase";
}
