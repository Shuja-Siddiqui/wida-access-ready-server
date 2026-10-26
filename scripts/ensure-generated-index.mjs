/**
 * Orval `clean: true` wipes src/generated — recreate the barrel file routes import.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/generated");
writeFileSync(
  path.join(dir, "index.ts"),
  `/** Barrel for route imports (from "../../generated"). Auto-written after codegen. */\nexport * from "./api";\n`,
  "utf8",
);
console.log("Wrote src/generated/index.ts");
