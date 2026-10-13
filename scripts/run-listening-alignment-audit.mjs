#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const out = path.join(__dirname, ".listening-alignment-audit.mjs");

buildSync({
  entryPoints: [path.join(__dirname, "listening-passage-question-audit.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  packages: "external",
  logLevel: "silent",
});

const child = spawnSync(
  process.execPath,
  ["--env-file=.env", out, ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit", env: process.env },
);
process.exit(child.status ?? 1);
