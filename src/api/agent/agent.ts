/**
 * /api/agent — Listening Content Agent routes
 *
 * POST /api/agent/listening/question   — single question
 * POST /api/agent/listening/session    — full session (3 questions, one per key use)
 * GET  /api/agent/listening/candos     — inspect Can Do descriptors (debug / admin)
 */

import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/auth";
import { rateLimitStudentAi } from "../../middlewares/rate-limit";
import {
  generateListeningQuestion,
  generateListeningSession,
  getListeningCanDo,
  OUTPUT_SCHEMAS,
  LISTENING_AGENT_ID,
} from "../../lib/agent-content";
import { logger } from "../../config/logger";

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const QuestionSchema = z.object({
  level:   z.number().int().min(0).max(6),
  keyUse:  z.enum(["Narrate", "Inform", "Explain", "Argue", "Recount"]),
  format:  z.enum([
    "listening_mc",
    "listening_tf",
    "listening_image_grid",
    "listening_sequence",
    "listening_match",
    "listening_classify",
  ]).optional(),
  topic: z.string().max(100).optional(),
});

const SessionSchema = z.object({
  level:    z.number().int().min(0).max(6),
  keyUses:  z.array(z.enum(["Narrate", "Inform", "Explain", "Argue", "Recount"])).min(1).max(4).optional(),
  topic:    z.string().max(100).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const BEST_FORMAT_FOR_LEVEL: Record<number, Record<string, string>> = {
  1: { Narrate: "listening_image_grid", Inform: "listening_image_grid", Recount: "listening_image_grid", Explain: "listening_image_grid", Argue: "listening_tf"    },
  2: { Narrate: "listening_sequence",   Inform: "listening_sequence",   Recount: "listening_sequence",   Explain: "listening_classify",   Argue: "listening_mc"    },
  3: { Narrate: "listening_sequence",   Inform: "listening_mc",         Recount: "listening_sequence",   Explain: "listening_match",      Argue: "listening_mc"    },
  4: { Narrate: "listening_mc",         Inform: "listening_mc",         Recount: "listening_mc",         Explain: "listening_match",      Argue: "listening_match"  },
  5: { Narrate: "listening_sequence",   Inform: "listening_mc",         Recount: "listening_sequence",   Explain: "listening_mc",         Argue: "listening_mc"    },
  6: { Narrate: "listening_mc",         Inform: "listening_mc",         Recount: "listening_mc",         Explain: "listening_mc",         Argue: "listening_mc"    },
};

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/agent/listening/question
 * Generate a single WIDA-aligned listening question.
 *
 * Body: { level, keyUse, format?, topic? }
 * Returns: { question: AnyQuestion }
 */
router.post("/agent/listening/question", requireAuth, rateLimitStudentAi(), async (req, res) => {
  const parsed = QuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { level, keyUse, format, topic } = parsed.data;
  const resolvedFormat = format ?? BEST_FORMAT_FOR_LEVEL[level]?.[keyUse] ?? "listening_mc";

  req.log.info({ level, keyUse, format: resolvedFormat, topic, agentId: LISTENING_AGENT_ID },
    "Generating listening question via agent");

  try {
    const question = await generateListeningQuestion({ level, keyUse, format: resolvedFormat, topic });
    res.json({ question });
  } catch (err) {
    logger.error({ err }, "Agent listening question generation failed");
    res.status(502).json({ error: "Content generation failed. Please try again." });
  }
});

/**
 * POST /api/agent/listening/session
 * Generate a full listening session (one question per key use).
 *
 * Body: { level, keyUses?: [...], topic? }
 * Returns: { questions: AnyQuestion[], level, meta }
 */
router.post("/agent/listening/session", requireAuth, rateLimitStudentAi(), async (req, res) => {
  const parsed = SessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { level, keyUses, topic } = parsed.data;

  req.log.info({ level, keyUses, topic, agentId: LISTENING_AGENT_ID },
    "Generating listening session via agent");

  try {
    const questions = await generateListeningSession({ level, keyUses, topic });
    res.json({
      questions,
      level,
      meta: {
        agentId: LISTENING_AGENT_ID,
        questionCount: questions.length,
        keyUses: keyUses ?? ["Narrate", "Inform", "Explain", "Argue"],
      },
    });
  } catch (err) {
    logger.error({ err }, "Agent listening session generation failed");
    res.status(502).json({ error: "Session generation failed. Please try again." });
  }
});

/**
 * GET /api/agent/listening/candos?level=2&keyUse=Explain
 * Returns the raw Can Do descriptors for a given level + key use.
 * Useful for debugging and verifying content alignment.
 */
router.get("/agent/listening/candos", requireAuth, (req, res) => {
  const level = Number(req.query.level);
  const keyUse = String(req.query.keyUse ?? "");

  if (level === undefined || level === null || level < 0 || level > 6) {
    res.status(400).json({ error: "level must be 0–6" });
    return;
  }
  if (!["Narrate", "Inform", "Explain", "Argue", "Recount"].includes(keyUse)) {
    res.status(400).json({ error: "keyUse must be Narrate, Inform, Explain, Argue, or Recount" });
    return;
  }

  const canDo = getListeningCanDo(level, keyUse);
  const format = BEST_FORMAT_FOR_LEVEL[level]?.[keyUse] ?? "listening_mc";

  res.json({
    level,
    keyUse,
    canDo,
    recommendedFormat: format,
    outputSchema: OUTPUT_SCHEMAS[format],
  });
});

export default router;
