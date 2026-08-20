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

// A small, kid-friendly neural voice. Multilingual auto-select isn't needed
// here since all AI content is authored/read in English.
const DEFAULT_VOICE = "en-US-AriaNeural";

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Synthesize speech from text via Azure TTS REST API.
 * Returns raw MP3 bytes ready to stream back to the client.
 */
export async function textToSpeech(text: string, voice: string = DEFAULT_VOICE): Promise<Buffer> {
  const { key, region, endpoint } = assertConfigured();

  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}">${escapeSsml(text)}</voice></speak>`;

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
 * Intended for single practice-answer clips (a few seconds up to ~60s).
 */
export async function speechToText(audio: Buffer, contentType: string): Promise<string> {
  const { key, region, endpoint } = assertConfigured();

  // If a custom endpoint is set, use it as the STT base.
  const sttBase = endpoint
    ? endpoint.replace(/\/$/, "") + "/speech/recognition/conversation/cognitiveservices/v1"
    : `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

  const url = new URL(sttBase);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("format", "simple");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": contentType,
      Accept: "application/json",
    },
    body: audio,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error({ status: response.status, body }, "Azure STT request failed");
    throw new AzureSpeechRequestError(`Azure STT failed with status ${response.status}`, response.status);
  }

  const data = (await response.json()) as {
    RecognitionStatus?: string;
    DisplayText?: string;
  };

  if (data.RecognitionStatus && data.RecognitionStatus !== "Success") {
    // e.g. "NoMatch" (silence / unrecognizable audio) — not a hard error, just empty.
    logger.warn({ status: data.RecognitionStatus }, "Azure STT returned non-success recognition status");
    return "";
  }

  return data.DisplayText ?? "";
}
