/**
 * ARCHIVED — WIDA Can Do Descriptors, Key Uses Edition (2016), Grades 6–8.
 *
 * Not imported by standards/index.ts or any live generate/feedback path.
 * Kept for historical reference only. All domains use standards/2020/.
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
