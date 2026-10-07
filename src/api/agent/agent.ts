/**
 * /api/agent — Listening Content Agent routes
 *
 * POST /api/agent/listening/question   — single question
 * POST /api/agent/listening/session    — full session (3 questions, one per key use)
 * GET  /api/agent/listening/candos     — inspect framework descriptors (debug / admin)
 */

import type { IRouter } from "express";
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
import { createApiRouter, parseBody, parseQuery, sendSuccess, upstreamError } from "../../lib/http";
import { isClaudeCapacityError } from "../../lib/claude/queue";

const router: IRouter = createApiRouter();

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

const CanDoQuerySchema = z.object({
  level: z.coerce.number().int().min(0).max(6),
  keyUse: z.enum(["Narrate", "Inform", "Explain", "Argue", "Recount"]),
});

const BEST_FORMAT_FOR_LEVEL: Record<number, Record<string, string>> = {
  1: { Narrate: "listening_image_grid", Inform: "listening_image_grid", Recount: "listening_image_grid", Explain: "listening_image_grid", Argue: "listening_tf"    },
  2: { Narrate: "listening_sequence",   Inform: "listening_sequence",   Recount: "listening_sequence",   Explain: "listening_classify",   Argue: "listening_mc"    },
  3: { Narrate: "listening_sequence",   Inform: "listening_mc",         Recount: "listening_sequence",   Explain: "listening_match",      Argue: "listening_mc"    },
  4: { Narrate: "listening_mc",         Inform: "listening_mc",         Recount: "listening_mc",         Explain: "listening_match",      Argue: "listening_match"  },
  5: { Narrate: "listening_sequence",   Inform: "listening_mc",         Recount: "listening_sequence",   Explain: "listening_mc",         Argue: "listening_mc"    },
  6: { Narrate: "listening_mc",         Inform: "listening_mc",         Recount: "listening_mc",         Explain: "listening_mc",         Argue: "listening_mc"    },
};

router.post("/agent/listening/question", requireAuth, rateLimitStudentAi(), async (req, res) => {
  const { level, keyUse, format, topic } = parseBody(QuestionSchema, req.body);
  const resolvedFormat = format ?? BEST_FORMAT_FOR_LEVEL[level]?.[keyUse] ?? "listening_mc";

  req.log.info({ level, keyUse, format: resolvedFormat, topic, agentId: LISTENING_AGENT_ID },
    "Generating listening question via agent");

  try {
    const question = await generateListeningQuestion({ level, keyUse, format: resolvedFormat, topic });
    sendSuccess(res, { question });
  } catch (err) {
    if (isClaudeCapacityError(err)) throw err;
    req.log.error({ err }, "Agent listening question generation failed");
    throw upstreamError("Content generation failed. Please try again.");
  }
});

router.post("/agent/listening/session", requireAuth, rateLimitStudentAi(), async (req, res) => {
  const { level, keyUses, topic } = parseBody(SessionSchema, req.body);

  req.log.info({ level, keyUses, topic, agentId: LISTENING_AGENT_ID },
    "Generating listening session via agent");

  try {
    const questions = await generateListeningSession({ level, keyUses, topic });
    sendSuccess(res, {
      questions,
      level,
      meta: {
        agentId: LISTENING_AGENT_ID,
        questionCount: questions.length,
        keyUses: keyUses ?? ["Narrate", "Inform", "Explain", "Argue"],
      },
    });
  } catch (err) {
    if (isClaudeCapacityError(err)) throw err;
    req.log.error({ err }, "Agent listening session generation failed");
    throw upstreamError("Session generation failed. Please try again.");
  }
});

router.get("/agent/listening/candos", requireAuth, (req, res) => {
  const { level, keyUse } = parseQuery(CanDoQuerySchema, req.query);
  const canDo = getListeningCanDo(level, keyUse);
  const format = BEST_FORMAT_FOR_LEVEL[level]?.[keyUse] ?? "listening_mc";

  sendSuccess(res, {
    level,
    keyUse,
    canDo,
    recommendedFormat: format,
    outputSchema: OUTPUT_SCHEMAS[format],
  });
});

export default router;
