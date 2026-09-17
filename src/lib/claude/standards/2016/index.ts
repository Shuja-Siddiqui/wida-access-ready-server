/**
 * 2016 pack — WIDA Can Do Descriptors, Key Uses Edition, Grades 6–8
 *
 * data/     Official Can Do table + practice content guide
 * prompts/  Extra Claude instructions for this edition only
 *           shared.ts = every domain; listening|reading|speaking|writing = band extras
 *           feedback.ts = coaching that still judges against Can Dos
 */
import { FRAMEWORK_2016_PROMPT_SLICE } from "./prompts/shared";
import { LISTENING_2016_1_2, LISTENING_2016_3_6 } from "./prompts/listening";
import { READING_2016_1_2, READING_2016_3_6 } from "./prompts/reading";
import { SPEAKING_2016_1_2, SPEAKING_2016_3_6 } from "./prompts/speaking";
import { WRITING_2016_1_2, WRITING_2016_3_6 } from "./prompts/writing";
import type { FrameworkBand, FrameworkDomain } from "../types";

export { FRAMEWORK_2016_PROMPT_SLICE };
export {
  LISTENING_2016_1_2,
  LISTENING_2016_3_6,
  LISTENING_2016_ACADEMIC,
} from "./prompts/listening";
export {
  FEEDBACK_2016_SHARED,
  FEEDBACK_2016_SPEAKING_1_2,
  FEEDBACK_2016_SPEAKING_3_6,
} from "./prompts/feedback";

import canDoData from "./data/canDo.json";
import canDoContentGuide from "./data/can-do-content-guide.json";
export { canDoData, canDoContentGuide };

const DOMAIN: Record<FrameworkDomain, Record<FrameworkBand, string>> = {
  listening: { "1_2": LISTENING_2016_1_2, "3_6": LISTENING_2016_3_6 },
  reading: { "1_2": READING_2016_1_2, "3_6": READING_2016_3_6 },
  speaking: { "1_2": SPEAKING_2016_1_2, "3_6": SPEAKING_2016_3_6 },
  writing: { "1_2": WRITING_2016_1_2, "3_6": WRITING_2016_3_6 },
};

export function framework2016DomainSlice(domain: FrameworkDomain, band: FrameworkBand): string {
  return DOMAIN[domain][band];
}
