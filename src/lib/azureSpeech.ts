// Azure Cognitive Services Speech — server-side proxy for STT and TTS.
// The Azure key/region never reach the browser: the client posts text/audio
// to our own routes, and this module talks to Azure on the server's behalf.

import { logger } from "../config/logger";
import { config } from "../config/index";

export class AzureSpeechNotConfiguredError extends Error {
  constructor() {
    super("Azure Speech is not configured (missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)");
    this.name = "AzureSpeechNotConfiguredError";
  }
}

export class AzureSpeechRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AzureSpeechRequestError";
  }
}

function assertConfigured(): { key: string; region: string; endpoint: string } {
  const { key, region, endpoint } = config.azureSpeech;
  if (!key || !region) {
    throw new AzureSpeechNotConfiguredError();
  }
  return { key, region, endpoint };
}

export function isAzureSpeechConfigured(): boolean {
  return Boolean(config.azureSpeech.key && config.azureSpeech.region);
}

// Passage = male narrator (Guy). Feedback/coaching = female teacher (Jenny).
export const PASSAGE_VOICE = "en-US-GuyNeural";
export const FEEDBACK_VOICE = "en-US-JennyNeural";

export type SpeechDelivery = "passage" | "coaching";

export function voiceForDelivery(delivery: SpeechDelivery): string {
  return delivery === "coaching" ? FEEDBACK_VOICE : PASSAGE_VOICE;
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sentenceChunks(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

function withWordStress(escaped: string): string {
  const fromMarks = escaped.replace(
    /\*([^*]+)\*/g,
    '<emphasis level="moderate">$1</emphasis>',
  );
  return fromMarks.replace(
    /\b(agree|disagree|not|never|listen|look|find|tap)\b/gi,
    (word, _capture: string, offset: number, full: string) => {
      const before = full.slice(Math.max(0, offset - 24), offset);
      if (before.includes("<emphasis")) return word;
      return `<emphasis level="moderate">${word}</emphasis>`;
    },
  );
}

function toTeacherSsml(text: string, voice: string, delivery: SpeechDelivery): string {
  const coaching = delivery === "coaching";
  const chunks = sentenceChunks(text);
  const inner = chunks
    .map((sent, i) => {
      const last = i === chunks.length - 1;
      // Normal speed. Only pitch moves: low on the correction, high on the key point.
      const pitch = coaching
        ? i === 0
          ? "-8%"
          : last
            ? "+12%"
            : "+4%"
        : i === 0
          ? "-4%"
          : last
            ? "+8%"
            : "+2%";
      const pause = last ? "" : `<break time="180ms"/>`;
      return `<prosody rate="+8%" pitch="${pitch}">${withWordStress(escapeSsml(sent))}</prosody>${pause}`;
    })
    .join("");

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${escapeSsml(voice)}">${inner}</voice></speak>`;
}

/**
 * Synthesize speech from text via Azure TTS REST API.
 * Returns raw MP3 bytes ready to stream back to the client.
 */
export async function textToSpeech(
  text: string,
  voice?: string,
  delivery: SpeechDelivery = "passage",
): Promise<Buffer> {
  const { key, region, endpoint } = assertConfigured();
  const resolvedVoice = voice?.trim() || voiceForDelivery(delivery);
  const ssml = toTeacherSsml(text, resolvedVoice, delivery);

  // `api.cognitive.microsoft.com` is the generic Cognitive Services gateway —
  // it does not serve TTS requests. Ignore it and always build the correct
  // Speech-specific TTS endpoint from the region instead.
  const isTtsEndpoint = endpoint && !endpoint.includes("api.cognitive.microsoft.com");
  const ttsBase = isTtsEndpoint
    ? endpoint.replace(/\/$/, "") + "/cognitiveservices/v1"
    : `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;


  const response = await fetch(ttsBase, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "access-ready",
    },
    body: ssml,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error({ status: response.status, body }, "Azure TTS request failed");
    throw new AzureSpeechRequestError(`Azure TTS failed with status ${response.status}`, response.status);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Transcribe a short audio clip via Azure's "short audio" STT REST API.
 * Optionally runs pronunciation assessment when a scaffold/prompt is given.
 */
export async function speechToText(
  audio: Buffer,
  contentType: string,
  referenceText?: string,
): Promise<{ text: string; confidence?: number; uncertainWords: string[] }> {
  const { key, region, endpoint } = assertConfigured();

  // Same rule as TTS: the generic Cognitive Services host and the TTS host
  // do not serve short-audio STT (they 404). Use the regional STT host unless
  // AZURE_SPEECH_ENDPOINT is already an STT endpoint.
  const trimmed = (endpoint ?? "").replace(/\/$/, "");
  const useCustomStt =
    trimmed.includes(".stt.speech.microsoft.com") &&
    !trimmed.includes("api.cognitive.microsoft.com") &&
    !trimmed.includes("tts.speech.microsoft.com");
  const sttBase = useCustomStt
    ? `${trimmed}/speech/recognition/conversation/cognitiveservices/v1`
    : `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

  const url = new URL(sttBase);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("format", "detailed");
  url.searchParams.set("profanity", "raw");

  const mime = contentType.split(";")[0].trim().toLowerCase();
  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": mime === "audio/wav" || mime === "audio/wave" || mime === "audio/x-wav"
      ? "audio/wav; codecs=audio/pcm"
      : mime === "audio/webm"
        ? "audio/webm; codecs=opus"
        : contentType,
    Accept: "application/json",
  };

  // Pronunciation assessment with a prompt as ReferenceText forces *scripted*
  // recognition (match this sentence). Picture speaking is free dictation —
  // only attach the header when we truly have a line the student should read.
  const reference = referenceText?.trim() ?? "";
  if (reference) {
    const assessment = {
      GradingSystem: "HundredMark",
      Granularity: "Word",
      Dimension: "Comprehensive",
      EnableMiscue: "True",
      ReferenceText: reference.slice(0, 400),
    };
    headers["Pronunciation-Assessment"] = Buffer.from(JSON.stringify(assessment), "utf8").toString("base64");
  }

  const parse = async (response: Response) => {
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error({ status: response.status, body }, "Azure STT request failed");
      throw new AzureSpeechRequestError(`Azure STT failed with status ${response.status}`, response.status);
    }
    const data = (await response.json()) as {
      RecognitionStatus?: string;
      DisplayText?: string;
      NBest?: Array<{
        Confidence?: number;
        Display?: string;
        Words?: Array<{
          Word?: string;
          Confidence?: number;
          PronunciationAssessment?: { AccuracyScore?: number };
        }>;
      }>;
    };
    if (data.RecognitionStatus && data.RecognitionStatus !== "Success") {
      logger.warn({ status: data.RecognitionStatus, bytes: audio.length }, "Azure STT returned non-success recognition status");
      return { text: "", confidence: undefined, uncertainWords: [] as string[] };
    }
    const best = data.NBest?.[0];
    let text = (data.DisplayText || best?.Display || "").trim();
    if (/^[.\s…]*$/.test(text)) text = "";
    logger.info(
      { status: data.RecognitionStatus, bytes: audio.length, contentType: headers["Content-Type"], text: text.slice(0, 80) },
      "Azure STT result",
    );
    const uncertainWords = (best?.Words ?? [])
      .filter((w) => {
        const acc = w.PronunciationAssessment?.AccuracyScore;
        const conf = w.Confidence;
        return (typeof acc === "number" && acc < 60) || (typeof conf === "number" && conf < 0.55);
      })
      .map((w) => (w.Word ?? "").trim())
      .filter(Boolean);
    return { text, confidence: best?.Confidence, uncertainWords: [...new Set(uncertainWords)] };
  };

  try {
    const response = await fetch(url, { method: "POST", headers, body: audio });
    return await parse(response);
  } catch (err) {
    if (err instanceof AzureSpeechRequestError) {
      delete headers["Pronunciation-Assessment"];
      const retry = await fetch(url, { method: "POST", headers, body: audio });
      return await parse(retry);
    }
    throw err;
  }
}
