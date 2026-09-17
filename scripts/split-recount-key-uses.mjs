/**
 * One-shot: split WIDA 2016 Recount cells into Narrate + Inform (2020 names).
 * Official Can Do sentences are unchanged. Run from api-server: node scripts/split-recount-key-uses.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(dir, "../src/lib/claude/standards/2016/data/canDo.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

data.keyUseDefinitions = [
  {
    keyUse: "Narrate",
    sourceKeyUse: "Recount",
    text: "Narrate (2020 Key Language Use; from 2016 Recount): tell experiences, events, or stories. Use the official Recount Can Do bullets tagged narrative.",
  },
  {
    keyUse: "Inform",
    sourceKeyUse: "Recount",
    text: "Inform (2020 Key Language Use; from 2016 Recount): display knowledge and give information. Use the official Recount Can Do bullets tagged informational.",
  },
  {
    keyUse: "Recount",
    text: "Recount (2016 Key Use): To display knowledge or narrate experiences or events. Split in this file into Narrate and Inform. Example tasks include telling or summarizing stories, producing information reports, and sharing past experiences.",
  },
  ...data.keyUseDefinitions.filter((d) => d.keyUse !== "Recount"),
];

/** @type {Record<string, { both?: boolean, narrate?: number[], inform?: number[] }>} */
const SPLIT = {
  "1|LISTENING": { narrate: [1], inform: [0] },
  "1|SPEAKING": { narrate: [1], inform: [0] },
  "1|READING": { narrate: [0], inform: [1] },
  "1|WRITING": { narrate: [0], inform: [1] },
  "2|LISTENING": { both: true },
  "2|SPEAKING": { both: true },
  "2|READING": { both: true },
  "2|WRITING": { both: true },
  "3|LISTENING": { narrate: [1], inform: [0] },
  "3|SPEAKING": { narrate: [0], inform: [1] },
  "3|READING": { narrate: [1], inform: [0] },
  "3|WRITING": { narrate: [1], inform: [0] },
  "4|LISTENING": { both: true },
  "4|SPEAKING": { narrate: [1], inform: [0] },
  "4|READING": { both: true },
  "4|WRITING": { narrate: [1], inform: [0] },
  "5|LISTENING": { narrate: [1], inform: [0] },
  "5|SPEAKING": { narrate: [1], inform: [0] },
  "5|READING": { both: true },
  "5|WRITING": { narrate: [1], inform: [0] },
  "6|LISTENING": { both: true },
  "6|SPEAKING": { both: true },
  "6|READING": { narrate: [1], inform: [0] },
  "6|WRITING": { narrate: [1], inform: [0] },
};

const L1_LISTENING = {
  domain: "LISTENING",
  keyUses: [
    {
      keyUse: "Recount",
      action: "Process recounts by",
      canDo: [
        "Identifying familiar objects or places from oral statements",
        "Pointing to objects, people, or places based on short oral descriptions",
      ],
    },
    {
      keyUse: "Explain",
      action: "Process explanations by",
      canDo: [
        "Matching instructional language, given orally, with visual representation (e.g., “Show me your schedule.”)",
        "Identifying functions of content-related topics based on short oral statements reinforced visually (e.g., organisms in ecosystems)",
      ],
    },
    {
      keyUse: "Argue",
      action: "Process arguments by",
      canDo: [
        "Signaling agreement or disagreement of short oral statements or questions",
        "Identifying points of view (e.g., first or third person) from short statements",
      ],
    },
  ],
};

function pick(canDo, indexes) {
  return indexes.map((i) => canDo[i]).filter(Boolean);
}

function splitRecount(entry, spec) {
  const bullets = entry.canDo;
  const action = entry.action;
  const make = (keyUse, focus, canDo) => ({
    keyUse,
    sourceKeyUse: "Recount",
    focus,
    action,
    canDo,
  });
  if (spec.both) {
    return [
      make("Narrate", "narrative", [...bullets]),
      make("Inform", "informational", [...bullets]),
    ];
  }
  return [
    make("Narrate", "narrative", pick(bullets, spec.narrate)),
    make("Inform", "informational", pick(bullets, spec.inform)),
  ];
}

for (const level of data.levels) {
  const n = level.elpLevel.replace("ELP Level ", "");
  if (n === "1") {
    const hasListening = level.domains.some((d) => d.domain === "LISTENING");
    if (!hasListening) level.domains.unshift(L1_LISTENING);
  }
  for (const domain of level.domains) {
    const key = `${n}|${domain.domain}`;
    const spec = SPLIT[key];
    if (!spec) continue;
    const next = [];
    for (const ku of domain.keyUses) {
      if (ku.keyUse !== "Recount") {
        next.push(ku);
        continue;
      }
      next.push(...splitRecount(ku, spec));
    }
    domain.keyUses = next;
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("Updated", file);
