# `src/lib` — helpers grouped by job

Routes stay in `src/api/`. This folder is **not** all Claude.

| Folder | What lives here |
|---|---|
| `billing/` | Stripe client, webhooks, access/subscription checks, receipts |
| `images/` | S3, ACL, resize, DINO pipeline, vision verify, locate fallback |
| `jobs/` | Cron: log cleanup, subscription renewal |
| `mail/` | SMTP send + HTML templates |
| `speech/` | Azure STT/TTS |
| `http/` | JSON envelopes, request origin |
| `academic/` | Math, science, social studies, ELA session engines |
| `content/` | Listening, reading, speaking, writing session engines |
| `rate-limit/` | AI/student rate limits |
| `claude/` | Anthropic client, queue, generators, WIDA prompt packs |

Still at the **root of lib** (practice/session logic): `adaptive-engine`, `assessments`, `choice-options`, `ai-output-filter`.
