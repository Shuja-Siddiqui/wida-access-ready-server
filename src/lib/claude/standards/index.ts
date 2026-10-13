/**
 * How content generation is assembled
 * -----------------------------------
 * prompts/content/     Always-on: JSON schema, item types, photo rules. No WIDA year.
 * standards/2016/      Can Do Descriptors, Key Uses Edition — data + extra prompt lines.
 * standards/2020/      ELD Standards Framework — functions JSON + PLDs + extra prompt lines.
 *
 * Live system prompt =
 *   kernel
 * + standards/{year}/prompts/shared
 * + prompts/content/{domain}-{band}
 * + standards/{year}/prompts/{domain}[band]
 *
 * Writing generate() sends 2020 functions + PLDs and uses the 2020 prompt slices.
 * Listening / reading / speaking stay on 2016 until their generate() payloads change.
 * Do not flip WIDA_FRAMEWORK_VERSION globally.
 */
import type { FrameworkBand, FrameworkDomain, WidaFrameworkVersion } from "./types";
export type { FrameworkBand, FrameworkDomain, WidaFrameworkVersion } from "./types";
import { FRAMEWORK_2016_PROMPT_SLICE, framework2016DomainSlice } from "./2016";
import { FRAMEWORK_2020_PROMPT_SLICE, framework2020DomainSlice } from "./2020";

/** Active pack. Stay on 2016 until generate() sends 2020 fields instead of can_do. */
export const WIDA_FRAMEWORK_VERSION: WidaFrameworkVersion = "2016";

export function frameworkPromptSlice(
  version: WidaFrameworkVersion = WIDA_FRAMEWORK_VERSION,
): string {
  return version === "2020" ? FRAMEWORK_2020_PROMPT_SLICE : FRAMEWORK_2016_PROMPT_SLICE;
}

export function frameworkDomainSlice(
  domain: FrameworkDomain,
  band: FrameworkBand,
  version: WidaFrameworkVersion = WIDA_FRAMEWORK_VERSION,
): string {
  return version === "2020"
    ? framework2020DomainSlice(domain, band)
    : framework2016DomainSlice(domain, band);
}

export { FRAMEWORK_2016_PROMPT_SLICE } from "./2016";
export { FRAMEWORK_2020_PROMPT_SLICE } from "./2020";
