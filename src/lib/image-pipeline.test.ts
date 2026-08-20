/**
 * image-pipeline.test.ts
 *
 * Unit tests for runImagePipeline covering the three critical paths:
 *
 *   1. DINO succeeds + topic suggestion fails → confirmedTags populated, suggestedTopicIds empty
 *   2. DINO fails                             → pipeline throws (error propagates)
 *   3. Both succeed                           → both outputs present in result
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock functions (must be initialised before vi.mock factories run) ─

const { mockMessagesCreate, mockRunDetection } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockRunDetection: vi.fn(),
}));

// ── Mock @anthropic-ai/sdk ────────────────────────────────────────────────────
// The module uses `new Anthropic(...)`, so the default export must be a
// constructor (regular function, not an arrow).

vi.mock("@anthropic-ai/sdk", () => ({
  // eslint-disable-next-line prefer-arrow-callback
  default: vi.fn(function AnthropicMock() {
    return { messages: { create: mockMessagesCreate } };
  }),
}));

// ── Mock detect-core ──────────────────────────────────────────────────────────

vi.mock("../api/images/detect-core", () => ({
  runDetection: mockRunDetection,
}));

// ── Mock config so we don't need a real .env ─────────────────────────────────

vi.mock("../config/index", () => ({
  config: {
    anthropic: {
      apiKey: "test-key",
      baseUrl: undefined,
      model: "claude-test",
      visionModel: "claude-test-vision",
    },
  },
}));

// ── Mock logger (silence output during tests) ─────────────────────────────────

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Module under test ─────────────────────────────────────────────────────────

import { runImagePipeline } from "./image-pipeline";

// ── Test data ─────────────────────────────────────────────────────────────────

const FAKE_IMAGE = "data:image/jpeg;base64,/9j/fake";
const FAKE_BASE64 = "/9j/fake";
const MEDIA_TYPE = "image/jpeg" as const;

/** Simulate a successful Anthropic response returning the given text. */
function claudeResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

/** Build a minimal DINO result with the given detected labels. */
function dinoResult(labels: string[]) {
  return {
    detections: labels.map((label) => ({
      label,
      score: 0.9,
      box: { x: 0, y: 0, width: 100, height: 100 },
    })),
    model: "grounding_dino" as const,
  };
}

const SAMPLE_TOPICS = [
  { id: "topic-1", name: "Animals", themeName: "Nature" },
  { id: "topic-2", name: "Food",    themeName: "Everyday" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runImagePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the lazy Anthropic singleton so each test gets a fresh client
    // (the module-level `_client` would otherwise reuse the first test's mock)
    vi.resetModules();
  });

  // ---------------------------------------------------------------------------
  // 1. DINO succeeds + topic suggestion fails → confirmedTags set, topics empty
  // ---------------------------------------------------------------------------

  it("returns confirmedTags and empty suggestedTopicIds when topic suggestion throws", async () => {
    // First Anthropic call: Claude vision → candidate noun list
    mockMessagesCreate.mockResolvedValueOnce(
      claudeResponse("dog, grass, park bench"),
    );

    // DINO succeeds
    mockRunDetection.mockResolvedValueOnce(dinoResult(["dog", "grass"]));

    // Second Anthropic call (topic suggestion) → throws
    mockMessagesCreate.mockRejectedValueOnce(
      new Error("Anthropic API error (topics)"),
    );

    const result = await runImagePipeline(FAKE_IMAGE, FAKE_BASE64, MEDIA_TYPE, {
      topics: SAMPLE_TOPICS,
    });

    expect(result.confirmedTags).toEqual(["dog", "grass"]);
    expect(result.suggestedTopicIds).toEqual([]);
    expect(result.candidates).toEqual(["dog", "grass", "park bench"]);
    expect(result.detectionResults.model).toBe("grounding_dino");
  });

  // ---------------------------------------------------------------------------
  // 2. DINO fails → pipeline throws
  // ---------------------------------------------------------------------------

  it("throws when DINO fails, even if topic suggestion would have succeeded", async () => {
    // Claude vision → candidates
    mockMessagesCreate.mockResolvedValueOnce(claudeResponse("cat, sofa"));

    // DINO throws
    mockRunDetection.mockRejectedValueOnce(
      new Error("Grounding DINO sidecar is not running. Start the sidecar and retry."),
    );

    // Topic suggestion that would succeed (should never be reached / not affect outcome)
    mockMessagesCreate.mockResolvedValueOnce(claudeResponse('["topic-1"]'));

    await expect(
      runImagePipeline(FAKE_IMAGE, FAKE_BASE64, MEDIA_TYPE, {
        topics: SAMPLE_TOPICS,
      }),
    ).rejects.toThrow("Grounding DINO sidecar");
  });

  // ---------------------------------------------------------------------------
  // 3. Both succeed → full result with all fields populated
  // ---------------------------------------------------------------------------

  it("returns confirmedTags and suggestedTopicIds when DINO and topic suggestion both succeed", async () => {
    // Claude vision → candidates
    mockMessagesCreate.mockResolvedValueOnce(
      claudeResponse("smiling woman, red dress, park"),
    );

    // DINO succeeds
    mockRunDetection.mockResolvedValueOnce(
      dinoResult(["smiling woman", "red dress"]),
    );

    // Topic suggestion → valid JSON topic IDs
    mockMessagesCreate.mockResolvedValueOnce(
      claudeResponse('["topic-1", "topic-2"]'),
    );

    const result = await runImagePipeline(FAKE_IMAGE, FAKE_BASE64, MEDIA_TYPE, {
      topics: SAMPLE_TOPICS,
    });

    expect(result.confirmedTags).toEqual(["smiling woman", "red dress"]);
    expect(result.suggestedTopicIds).toEqual(["topic-1", "topic-2"]);
    expect(result.description).toBe("smiling woman, red dress, park");
    expect(result.candidates).toEqual(["smiling woman", "red dress", "park"]);
  });

  // ---------------------------------------------------------------------------
  // Extra: no topics provided → topic suggestion skipped, DINO still runs
  // ---------------------------------------------------------------------------

  it("skips topic suggestion entirely when no topics are provided", async () => {
    mockMessagesCreate.mockResolvedValueOnce(claudeResponse("bicycle, road"));
    mockRunDetection.mockResolvedValueOnce(dinoResult(["bicycle"]));

    const result = await runImagePipeline(FAKE_IMAGE, FAKE_BASE64, MEDIA_TYPE);

    expect(result.confirmedTags).toEqual(["bicycle"]);
    expect(result.suggestedTopicIds).toEqual([]);
    // Only the vision call was made — no topic-suggestion call
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Extra: caller-supplied description override is preserved
  // ---------------------------------------------------------------------------

  it("uses caller-supplied description override rather than Claude's candidate list", async () => {
    mockMessagesCreate.mockResolvedValueOnce(claudeResponse("apple, table"));
    mockRunDetection.mockResolvedValueOnce(dinoResult(["apple"]));

    const result = await runImagePipeline(FAKE_IMAGE, FAKE_BASE64, MEDIA_TYPE, {
      description: "A close-up of a red apple on a wooden table",
    });

    expect(result.description).toBe("A close-up of a red apple on a wooden table");
    expect(result.confirmedTags).toEqual(["apple"]);
  });
});
