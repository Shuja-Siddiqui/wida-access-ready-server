# Content quality battery report

Generated: 2026-10-13T16:55:17.153Z  
Started: 2026-10-13T16:53:27.147Z  
Configuration: 100 total calls, 12 per domain (listening), sleep 400 ms between calls.

## Executive summary

| Metric | Value |
|--------|------:|
| Total API generates | 12 |
| Success | 12 (100.0%) |
| Failed | 0 (0.0%) |
| Listening + reading questions | 44 |
| **MC-fallback questions** (declared interactive, UI = multiple choice) | **0** (0.0%) |
| Emergency fallback content (heuristic) | 0 |

MC-fallback hurts progress when students see only multiple choice while the session claims varied formats (sequence, match, sort).

## By domain

### listening
- Calls: 12 | Success: 12 (100.0%) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Questions generated: 44 | MC-fallback (interactive → MC UI): 0 (0.0% of questions)
- Invalid / incomplete shapes: 0 (0.0% of questions)
- Avg audio script words (success): 138
- Avg latency (success): 8758 ms
- Key language use mix (success): {"Inform":3,"Explain":3,"Argue":3,"Narrate":3}

### reading
- Calls: 0 | Success: 0 (—) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Questions generated: 0 | MC-fallback (interactive → MC UI): 0 (— of questions)
- Invalid / incomplete shapes: 0 (— of questions)
- Avg passage words (success): 0
- Avg latency (success): 0 ms
- Key language use mix (success): {}

### speaking
- Calls: 0 | Success: 0 (—) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Avg prompt words (success): 0
- Avg latency (success): 0 ms
- Key language use mix (success): {}

### writing
- Calls: 0 | Success: 0 (—) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Avg prompt words (success): 0
- Avg latency (success): 0 ms
- Key language use mix (success): {}

## Complexity & rotation (success calls)

| Domain | Level range | Subjects rotated | KLU rotated |
|--------|-------------|------------------|-------------|
| All | 1–6 (+ sub-steps 0–4) | ela → math → science → social_studies | Narrate, Inform, Explain, Argue |

Listening uses general (L3–6) and academic generators on alternating cells. Reading/speaking/writing use academic session context (unit, tier-3 vocab, framework PLD).

## Per-call log

| # | Domain | L | Subject | KLU | OK | Q | MC-fb | ms | Notes |
|---|--------|---|---------|-----|----|---|-------|-----|-------|
| 1 | listening | 1 | ela | Inform | yes | 2 | 0 | 5591 | generator=academic_ela |
| 2 | listening | 2 | math | Explain | yes | 2 | 0 | 4985 | generator=academic_math |
| 3 | listening | 3 | science | Argue | yes | 3 | 0 | 6726 | generator=general_listening |
| 4 | listening | 4 | social_studies | Narrate | yes | 4 | 0 | 10212 | generator=academic_social_studies |
| 5 | listening | 5 | ela | Inform | yes | 5 | 0 | 13039 | generator=general_listening |
| 6 | listening | 6 | math | Explain | yes | 6 | 0 | 11805 | generator=academic_math |
| 7 | listening | 1 | science | Argue | yes | 2 | 0 | 5169 | generator=academic_science |
| 8 | listening | 2 | social_studies | Narrate | yes | 2 | 0 | 5111 | generator=academic_social_studies |
| 9 | listening | 3 | ela | Inform | yes | 3 | 0 | 7232 | generator=general_listening |
| 10 | listening | 4 | math | Explain | yes | 4 | 0 | 8554 | generator=academic_math |
| 11 | listening | 5 | science | Argue | yes | 5 | 0 | 10271 | generator=general_listening |
| 12 | listening | 6 | social_studies | Narrate | yes | 6 | 0 | 16398 | generator=academic_social_studies |

## Factors that affect student progress

1. **MC-fallback (listening primary)** — Interactive types rendered as MC reduce format practice and can mismatch declared `type`.
2. **Shape validation failures** — Missing `items`, `correct_order`, pairs, or categories block interactives or mark invalid.
3. **Generator failures / fallbacks** — Failed Claude calls return static fallback passages (no progress on new language).
4. **Complexity calibration** — `complexity_instruction` + `framework.pld` should match level; audit varies level 1–6 and sub-step.
5. **KLU / subject rotation** — Ensures Narrate/Inform/Explain/Argue and four academic worlds are exercised across calls.

---
*Report produced by `scripts/content-quality-audit-battery.ts`*
