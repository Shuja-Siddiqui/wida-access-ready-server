# WIDA packs (edition folders)

Content generation is **kernel + year pack + domain schema**.

```
prompts/content/          always on — JSON shape, 3 vs 4 options, photo rules
standards/2016/           Can Do Descriptors (2016) — archived, not wired in live paths
  data/                   canDo.json, can-do-content-guide.json (legacy reference only)
standards/2020/           ELD Framework (2020) — active for all domains
  data/                   language functions, PLDs, Table 3-11 KLU prominence (6–8)
  prompts/shared.ts       six-part framework rules
  prompts/{domain}.ts     domain apply lines
  prompts/feedback.ts     item/attempt coaching extras
  select.ts               slices one Standard × KLU × mode × PLD level
```

All domains use **2020** for generate and feedback. Subject prominence comes from `wida_eld_klu_prominence_6-8.json` (Table 3-11). The 2016 Can Do booklet and content guide are not used in live paths.

Do not copy domain output schemas into a year folder.
