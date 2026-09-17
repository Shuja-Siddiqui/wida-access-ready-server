# WIDA packs (edition folders)

Content generation is **kernel + year pack + domain schema**.

```
prompts/content/          always on — JSON shape, 3 vs 4 options, photo rules
standards/2016/           Can Do Descriptors (2016)
  data/                   canDo.json, can-do-content-guide.json
  prompts/                extra Claude lines for this year only
    shared.ts             every domain
    listening.ts …        one file per domain
    feedback.ts           coaching that still uses Can Dos
standards/2020/           ELD Framework (2020)
  data/                   language functions + PLDs
  prompts/shared.ts       extra Claude lines
  prompts/writing.ts      writing-only extras (this domain is wired)
  select.ts               slices one Standard × KLU × PLD level
```

Writing `generate()` passes `version: "2020"` into `contentGenPrompt`. Other domains still use `WIDA_FRAMEWORK_VERSION` (2016). Do not copy domain schemas into a year folder.
