import fs from "node:fs";
import path from "node:path";
import { config } from "../../config";
import { logger } from "../../config/logger";

function prettyUser(userPrompt: string): string {
  try {
    return JSON.stringify(JSON.parse(userPrompt), null, 2);
  } catch {
    return userPrompt;
  }
}

/** Writes the exact Claude system + user payload for one content-gen call. Overwrites last files. */
export function dumpContentGenRequest(domain: string, systemPrompt: string, userPrompt: string): void {
  const dir = path.resolve(config.logging.dir);
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    `captured_at: ${new Date().toISOString()}`,
    `domain: ${domain}`,
    "",
    "======== SYSTEM (instructions) ========",
    systemPrompt,
    "",
    "======== USER (this session) ========",
    prettyUser(userPrompt),
    "",
  ].join("\n");
  const latest = path.join(dir, "last-content-gen.txt");
  const named = path.join(dir, `last-content-gen-${domain}.txt`);
  fs.writeFileSync(latest, body, "utf8");
  fs.writeFileSync(named, body, "utf8");
  logger.info(
    { file: latest, also: named, domain, systemChars: systemPrompt.length, userChars: userPrompt.length },
    "Wrote Claude content-gen request dump",
  );
}
