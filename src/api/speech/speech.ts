import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response";
import {
  textToSpeech,
  speechToText,
  isAzureSpeechConfigured,
  AzureSpeechNotConfiguredError,
  AzureSpeechRequestError,
} from "../../lib/azureSpeech";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

router.use("/speech", requireAuth);

const TextToSpeechBody = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().min(1).max(100).optional(),
});

// Audio clips are short practice-answer recordings (a few seconds to ~60s).
// 15MB comfortably covers that at typical browser MediaRecorder bitrates.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * GET /speech/status
 *
 * Lets the client check whether server-side (Azure) speech is available
 * before deciding whether to fall back to the browser's built-in APIs.
 */
router.get("/speech/status", (_req: Request, res: Response) => {
  sendSuccess(res, { configured: isAzureSpeechConfigured() });
});

/**
 * POST /speech/text-to-speech
 *
 * Body: { text: string, voice?: string }
 * Response: audio/mpeg bytes (Azure neural TTS).
 */
router.post("/speech/text-to-speech", async (req: Request, res: Response) => {
  const parsed = TextToSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Missing or invalid required fields");
    return;
  }

  try {
    const audio = await textToSpeech(parsed.data.text, parsed.data.voice);
    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.send(audio);
  } catch (error) {
    if (error instanceof AzureSpeechNotConfiguredError) {
      sendError(res, 503, "Server speech synthesis is not configured");
      return;
    }
    if (error instanceof AzureSpeechRequestError) {
      req.log.error({ err: error }, "Azure TTS request failed");
      sendError(res, 502, "Speech synthesis failed");
      return;
    }
    req.log.error({ err: error }, "Unexpected error generating speech");
    sendError(res, 500, "Failed to generate speech");
  }
});

/**
 * POST /speech/speech-to-text
 *
 * Body: raw audio bytes (Content-Type e.g. "audio/webm;codecs=opus", "audio/wav", "audio/ogg").
 * Response: { text: string }
 */
router.post(
  "/speech/speech-to-text",
  express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }),
  async (req: Request, res: Response) => {
    const contentType = req.headers["content-type"];
    if (!contentType || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      sendError(res, 400, "Missing audio body or Content-Type header");
      return;
    }

    try {
      const text = await speechToText(req.body, contentType);
      sendSuccess(res, { text });
    } catch (error) {
      if (error instanceof AzureSpeechNotConfiguredError) {
        sendError(res, 503, "Server speech transcription is not configured");
        return;
      }
      if (error instanceof AzureSpeechRequestError) {
        req.log.error({ err: error }, "Azure STT request failed");
        sendError(res, 502, "Speech transcription failed");
        return;
      }
      req.log.error({ err: error }, "Unexpected error transcribing speech");
      sendError(res, 500, "Failed to transcribe speech");
    }
  },
);

export default router;
