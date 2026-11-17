# Content quality battery report

Generated: 2026-10-13T16:44:15.967Z  
Started: 2026-10-13T16:32:21.937Z  
Configuration: 100 total calls, 25 per domain, sleep 800 ms between calls.

## Executive summary

| Metric | Value |
|--------|------:|
| Total API generates | 100 |
| Success | 100 (100.0%) |
| Failed | 0 (0.0%) |
| Listening + reading questions | 180 |
| **MC-fallback questions** (declared interactive, UI = multiple choice) | **38** (21.1%) |
| Emergency fallback content (heuristic) | 0 |

MC-fallback hurts progress when students see only multiple choice while the session claims varied formats (sequence, match, sort).

## By domain

### listening
- Calls: 25 | Success: 25 (100.0%) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Questions generated: 90 | MC-fallback (interactive → MC UI): 38 (42.2% of questions)
- Invalid / incomplete shapes: 0 (0.0% of questions)
- Avg audio script words (success): 136
- Avg latency (success): 8948 ms
- Key language use mix (success): {"Inform":7,"Explain":6,"Argue":6,"Narrate":6}

### reading
- Calls: 25 | Success: 25 (100.0%) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Questions generated: 90 | MC-fallback (interactive → MC UI): 0 (0.0% of questions)
- Invalid / incomplete shapes: 0 (0.0% of questions)
- Avg passage words (success): 97
- Avg latency (success): 8732 ms
- Key language use mix (success): {"Narrate":7,"Inform":6,"Explain":6,"Argue":6}

### speaking
- Calls: 25 | Success: 25 (100.0%) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Avg prompt words (success): 60
- Avg latency (success): 3799 ms
- Key language use mix (success): {"Narrate":7,"Inform":6,"Explain":6,"Argue":6}

### writing
- Calls: 25 | Success: 25 (100.0%) | Failed: 0
- Emergency fallbacks (heuristic): 0
- Avg prompt words (success): 60
- Avg latency (success): 3880 ms
- Key language use mix (success): {"Narrate":7,"Inform":6,"Explain":6,"Argue":6}

## Complexity & rotation (success calls)

| Domain | Level range | Subjects rotated | KLU rotated |
|--------|-------------|------------------|-------------|
| All | 1–6 (+ sub-steps 0–4) | ela → math → science → social_studies | Narrate, Inform, Explain, Argue |

Listening uses general (L3–6) and academic generators on alternating cells. Reading/speaking/writing use academic session context (unit, tier-3 vocab, framework PLD).

## Per-call log

| # | Domain | L | Subject | KLU | OK | Q | MC-fb | ms | Notes |
|---|--------|---|---------|-----|----|---|-------|-----|-------|
| 1 | listening | 1 | ela | Inform | yes | 2 | 0 | 5968 | generator=academic_ela |
| 2 | listening | 2 | math | Explain | yes | 2 | 0 | 5301 | generator=academic_math |
| 3 | listening | 3 | science | Argue | yes | 3 | 1 | 7746 | generator=general_listening; mc_fallback |
| 4 | listening | 4 | social_studies | Narrate | yes | 4 | 2 | 11269 | generator=academic_social_studies; mc_fallback |
| 5 | listening | 5 | ela | Inform | yes | 5 | 3 | 11658 | generator=general_listening; mc_fallback |
| 6 | listening | 6 | math | Explain | yes | 6 | 3 | 14198 | generator=academic_math; mc_fallback |
| 7 | listening | 1 | science | Argue | yes | 2 | 0 | 5003 | generator=academic_science |
| 8 | listening | 2 | social_studies | Narrate | yes | 2 | 1 | 5701 | generator=academic_social_studies; mc_fallback |
| 9 | listening | 3 | ela | Inform | yes | 3 | 1 | 7148 | generator=general_listening; mc_fallback |
| 10 | listening | 4 | math | Explain | yes | 4 | 2 | 9842 | generator=academic_math; mc_fallback |
| 11 | listening | 5 | science | Argue | yes | 5 | 2 | 11329 | generator=general_listening; mc_fallback |
| 12 | listening | 6 | social_studies | Narrate | yes | 6 | 3 | 15541 | generator=academic_social_studies; mc_fallback |
| 13 | listening | 1 | ela | Inform | yes | 2 | 0 | 5266 | generator=academic_ela |
| 14 | listening | 2 | math | Explain | yes | 2 | 0 | 5197 | generator=academic_math |
| 15 | listening | 3 | science | Argue | yes | 3 | 1 | 7125 | generator=general_listening; mc_fallback |
| 16 | listening | 4 | social_studies | Narrate | yes | 4 | 2 | 9922 | generator=academic_social_studies; mc_fallback |
| 17 | listening | 5 | ela | Inform | yes | 5 | 3 | 11248 | generator=general_listening; mc_fallback |
| 18 | listening | 6 | math | Explain | yes | 6 | 3 | 12889 | generator=academic_math; mc_fallback |
| 19 | listening | 1 | science | Argue | yes | 2 | 0 | 5560 | generator=academic_science |
| 20 | listening | 2 | social_studies | Narrate | yes | 2 | 1 | 5900 | generator=academic_social_studies; mc_fallback |
| 21 | listening | 3 | ela | Inform | yes | 3 | 2 | 7177 | generator=general_listening; mc_fallback |
| 22 | listening | 4 | math | Explain | yes | 4 | 2 | 9626 | generator=academic_math; mc_fallback |
| 23 | listening | 5 | science | Argue | yes | 5 | 3 | 12366 | generator=general_listening; mc_fallback |
| 24 | listening | 6 | social_studies | Narrate | yes | 6 | 3 | 15467 | generator=academic_social_studies; mc_fallback |
| 25 | listening | 1 | ela | Inform | yes | 2 | 0 | 5248 | generator=academic_ela |
| 26 | reading | 1 | ela | Narrate | yes | 2 | 0 | 5305 |  |
| 27 | reading | 2 | math | Inform | yes | 3 | 0 | 6079 |  |
| 28 | reading | 3 | science | Explain | yes | 3 | 0 | 7655 |  |
| 29 | reading | 4 | social_studies | Argue | yes | 4 | 0 | 9669 |  |
| 30 | reading | 5 | ela | Narrate | yes | 5 | 0 | 10683 |  |
| 31 | reading | 6 | math | Inform | yes | 5 | 0 | 12470 |  |
| 32 | reading | 1 | science | Explain | yes | 2 | 0 | 5615 |  |
| 33 | reading | 2 | social_studies | Argue | yes | 3 | 0 | 6589 |  |
| 34 | reading | 3 | ela | Narrate | yes | 3 | 0 | 7430 |  |
| 35 | reading | 4 | math | Inform | yes | 4 | 0 | 10316 |  |
| 36 | reading | 5 | science | Explain | yes | 5 | 0 | 10398 |  |
| 37 | reading | 6 | social_studies | Argue | yes | 5 | 0 | 12935 |  |
| 38 | reading | 1 | ela | Narrate | yes | 2 | 0 | 4995 |  |
| 39 | reading | 2 | math | Inform | yes | 3 | 0 | 6899 |  |
| 40 | reading | 3 | science | Explain | yes | 3 | 0 | 7300 |  |
| 41 | reading | 4 | social_studies | Argue | yes | 4 | 0 | 9653 |  |
| 42 | reading | 5 | ela | Narrate | yes | 5 | 0 | 11913 |  |
| 43 | reading | 6 | math | Inform | yes | 5 | 0 | 13212 |  |
| 44 | reading | 1 | science | Explain | yes | 2 | 0 | 5742 |  |
| 45 | reading | 2 | social_studies | Argue | yes | 3 | 0 | 6843 |  |
| 46 | reading | 3 | ela | Narrate | yes | 3 | 0 | 7443 |  |
| 47 | reading | 4 | math | Inform | yes | 4 | 0 | 9132 |  |
| 48 | reading | 5 | science | Explain | yes | 5 | 0 | 12544 |  |
| 49 | reading | 6 | social_studies | Argue | yes | 5 | 0 | 11654 |  |
| 50 | reading | 1 | ela | Narrate | yes | 2 | 0 | 5815 |  |
| 51 | speaking | 1 | ela | Narrate | yes | — | — | 3140 | has_scaffold; prompt_type=wh_answer |
| 52 | speaking | 2 | math | Inform | yes | — | — | 3082 | has_scaffold; prompt_type=wh_answer |
| 53 | speaking | 3 | science | Explain | yes | — | — | 4319 | has_scaffold; prompt_type=explanatory |
| 54 | speaking | 4 | social_studies | Argue | yes | — | — | 4652 | has_scaffold; prompt_type=argumentative |
| 55 | speaking | 5 | ela | Narrate | yes | — | — | 3943 | has_scaffold; prompt_type=narrative |
| 56 | speaking | 6 | math | Inform | yes | — | — | 4212 | has_scaffold; prompt_type=explanatory |
| 57 | speaking | 1 | science | Explain | yes | — | — | 2951 | has_scaffold; prompt_type=descriptive |
| 58 | speaking | 2 | social_studies | Argue | yes | — | — | 3472 | has_scaffold; prompt_type=argumentative |
| 59 | speaking | 3 | ela | Narrate | yes | — | — | 3909 | has_scaffold; prompt_type=narrative |
| 60 | speaking | 4 | math | Inform | yes | — | — | 4042 | has_scaffold; prompt_type=explanatory |
| 61 | speaking | 5 | science | Explain | yes | — | — | 3995 | has_scaffold; prompt_type=explanatory |
| 62 | speaking | 6 | social_studies | Argue | yes | — | — | 4510 | has_scaffold; prompt_type=argumentative |
| 63 | speaking | 1 | ela | Narrate | yes | — | — | 3204 | has_scaffold; prompt_type=wh_answer |
| 64 | speaking | 2 | math | Inform | yes | — | — | 3060 | has_scaffold; prompt_type=descriptive |
| 65 | speaking | 3 | science | Explain | yes | — | — | 3694 | has_scaffold; prompt_type=explanatory |
| 66 | speaking | 4 | social_studies | Argue | yes | — | — | 4029 | has_scaffold; prompt_type=argumentative |
| 67 | speaking | 5 | ela | Narrate | yes | — | — | 3970 | has_scaffold; prompt_type=narrative |
| 68 | speaking | 6 | math | Inform | yes | — | — | 4131 | has_scaffold; prompt_type=explanatory |
| 69 | speaking | 1 | science | Explain | yes | — | — | 2984 | has_scaffold; prompt_type=wh_answer |
| 70 | speaking | 2 | social_studies | Argue | yes | — | — | 3368 | has_scaffold; prompt_type=argumentative |
| 71 | speaking | 3 | ela | Narrate | yes | — | — | 3823 | has_scaffold; prompt_type=narrative |
| 72 | speaking | 4 | math | Inform | yes | — | — | 4068 | has_scaffold; prompt_type=explanatory |
| 73 | speaking | 5 | science | Explain | yes | — | — | 4074 | has_scaffold; prompt_type=explanatory |
| 74 | speaking | 6 | social_studies | Argue | yes | — | — | 5179 | has_scaffold; prompt_type=argumentative |
| 75 | speaking | 1 | ela | Narrate | yes | — | — | 3174 | has_scaffold; prompt_type=wh_answer |
| 76 | writing | 1 | ela | Narrate | yes | — | — | 3074 | min_sentences=4; has_sentence_frame |
| 77 | writing | 2 | math | Inform | yes | — | — | 3452 | min_sentences=4; has_sentence_frame |
| 78 | writing | 3 | science | Explain | yes | — | — | 3635 | min_sentences=3; has_sentence_frame |
| 79 | writing | 4 | social_studies | Argue | yes | — | — | 5658 | min_sentences=7; has_sentence_frame |
| 80 | writing | 5 | ela | Narrate | yes | — | — | 4116 | min_sentences=8; has_sentence_frame |
| 81 | writing | 6 | math | Inform | yes | — | — | 3801 | min_sentences=6; has_sentence_frame |
| 82 | writing | 1 | science | Explain | yes | — | — | 4254 | min_sentences=3; has_sentence_frame |
| 83 | writing | 2 | social_studies | Argue | yes | — | — | 5064 | min_sentences=4; has_sentence_frame |
| 84 | writing | 3 | ela | Narrate | yes | — | — | 3786 | min_sentences=6; has_sentence_frame |
| 85 | writing | 4 | math | Inform | yes | — | — | 3395 | min_sentences=4; has_sentence_frame |
| 86 | writing | 5 | science | Explain | yes | — | — | 5441 | min_sentences=5; has_sentence_frame |
| 87 | writing | 6 | social_studies | Argue | yes | — | — | 3705 | min_sentences=6; has_sentence_frame |
| 88 | writing | 1 | ela | Narrate | yes | — | — | 2969 | min_sentences=4; has_sentence_frame |
| 89 | writing | 2 | math | Inform | yes | — | — | 3219 | min_sentences=4; has_sentence_frame |
| 90 | writing | 3 | science | Explain | yes | — | — | 4564 | min_sentences=4; has_sentence_frame |
| 91 | writing | 4 | social_studies | Argue | yes | — | — | 3261 | min_sentences=5; has_sentence_frame |
| 92 | writing | 5 | ela | Narrate | yes | — | — | 4325 | min_sentences=8; has_sentence_frame |
| 93 | writing | 6 | math | Inform | yes | — | — | 3841 | min_sentences=6; has_sentence_frame |
| 94 | writing | 1 | science | Explain | yes | — | — | 3140 | min_sentences=3; has_sentence_frame |
| 95 | writing | 2 | social_studies | Argue | yes | — | — | 4666 | min_sentences=4; has_sentence_frame |
| 96 | writing | 3 | ela | Narrate | yes | — | — | 3297 | min_sentences=6; has_sentence_frame |
| 97 | writing | 4 | math | Inform | yes | — | — | 3632 | min_sentences=5; has_sentence_frame |
| 98 | writing | 5 | science | Explain | yes | — | — | 3831 | min_sentences=4; has_sentence_frame |
| 99 | writing | 6 | social_studies | Argue | yes | — | — | 3708 | min_sentences=8; has_sentence_frame |
| 100 | writing | 1 | ela | Narrate | yes | — | — | 3176 | min_sentences=4; has_sentence_frame |

## Factors that affect student progress

1. **MC-fallback (listening primary)** — Interactive types rendered as MC reduce format practice and can mismatch declared `type`.
2. **Shape validation failures** — Missing `items`, `correct_order`, pairs, or categories block interactives or mark invalid.
3. **Generator failures / fallbacks** — Failed Claude calls return static fallback passages (no progress on new language).
4. **Complexity calibration** — `complexity_instruction` + `framework.pld` should match level; audit varies level 1–6 and sub-step.
5. **KLU / subject rotation** — Ensures Narrate/Inform/Explain/Argue and four academic worlds are exercised across calls.

---
*Report produced by `scripts/content-quality-audit-battery.ts`*
