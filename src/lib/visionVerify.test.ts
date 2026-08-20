/**
 * visionVerify.test.ts
 *
 * Unit tests for verifyDetections — the Claude Haiku Vision verification pass
 * that filters Grounding DINO detections.
 *
 * Covered paths:
 *   1. Claude replies YES  → detection is kept
 *   2. Claude replies NO   → detection is dropped (rejected)
 *   3. Claude throws       → detection is kept (fail-open)
 *   4. Empty input         → returns immediately, no Claude calls
 *   5. Metadata read fails → all detections kept (fail-open)
 *   6. Mix of YES/NO across multiple detections
 *   7. Client uses direct key when ANTHROPIC_API_KEY set (no baseURL)
 *   8. Client uses proxy baseURL when no direct key
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalisedDetection } from "../api/images/detect-core";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockMessagesCreate, mockMetadata, mockExtract, mockJpeg, mockToBuffer } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockMetadata:       vi.fn(),
  mockExtract:        vi.fn(),
  mockJpeg:           vi.fn(),
  mockToBuffer:       vi.fn(),
}));

// ── Mock @anthropic-ai/sdk ────────────────────────────────────────────────────

const anthropicCtorCalls: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/sdk", () => ({
  // eslint-disable-next-line prefer-arrow-callback
  default: vi.fn(function AnthropicMock(opts: Record<string, unknown>) {
    anthropicCtorCalls.push({ ...opts });
    return { messages: { create: mockMessagesCreate } };
  }),
}));

// ── Mock sharp ────────────────────────────────────────────────────────────────

vi.mock("sharp", () => {
  const chain = () => ({
    metadata: mockMetadata,
    extract:  (opts: unknown) => { mockExtract(opts); return { jpeg: () => ({ toBuffer: mockToBuffer }) }; },
    jpeg:     () => ({ toBuffer: mockToBuffer }),
    toBuffer: mockToBuffer,
  });
  return { default: vi.fn(chain) };
});

// ── Mock logger (prevents logger.ts reading config.logging.dir at import) ────

vi.mock("../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock config ───────────────────────────────────────────────────────────────

const mockAnthropicConfig = {
  baseUrl: "",         // empty = direct key, non-empty = proxy
  apiKey:  "test-key",
  model:   "claude-haiku-4-5",
  visionModel: "claude-haiku-4-5",
};

vi.mock("../config/index", () => ({
  config: {
    anthropic: mockAnthropicConfig,
    logging: { dir: "/tmp/test-logs", retentionDays: 1 },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal 1×1 JPEG as a data URI — avoids real image I/O
const FAKE_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVIP/2Q==";

function det(label: string): NormalisedDetection {
  return { label, score: 0.9, box: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 } };
}

function yes() {
  mockMessagesCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "YES" }] });
}
function no() {
  mockMessagesCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "NO" }] });
}
function throws() {
  mockMessagesCreate.mockRejectedValueOnce(new Error("Claude API timeout"));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("verifyDetections", () => {
  let verifyDetections: typeof import("./visionVerify").verifyDetections;

  beforeEach(async () => {
    vi.clearAllMocks();
    anthropicCtorCalls.length = 0;

    // Reset sharp mock chain
    mockToBuffer.mockResolvedValue(Buffer.from("fakecrop"));
    mockMetadata.mockResolvedValue({ width: 100, height: 100 });
    mockExtract.mockReturnValue(undefined);
    mockJpeg.mockReturnValue({ toBuffer: mockToBuffer });

    // Reset config to defaults
    mockAnthropicConfig.baseUrl = "";
    mockAnthropicConfig.apiKey  = "test-key";

    ({ verifyDetections } = await import("./visionVerify"));
  });

  it("keeps a detection when Claude replies YES", async () => {
    yes();
    const result = await verifyDetections(FAKE_URI, [det("chair")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("chair");
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
  });

  it("drops a detection when Claude replies NO", async () => {
    no();
    const result = await verifyDetections(FAKE_URI, [det("solar panel diagram")]);
    expect(result).toHaveLength(0);
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
  });

  it("keeps a detection when Claude throws — fail-open", async () => {
    throws();
    const result = await verifyDetections(FAKE_URI, [det("table")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("table");
  });

  it("returns immediately without calling Claude when given no detections", async () => {
    const result = await verifyDetections(FAKE_URI, []);
    expect(result).toHaveLength(0);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("processes multiple detections independently — keeps YES, drops NO", async () => {
    yes(); // chair
    no();  // solar panel
    yes(); // table
    const result = await verifyDetections(FAKE_URI, [
      det("chair"),
      det("solar panel"),
      det("table"),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.label)).toEqual(["chair", "table"]);
  });

  it("keeps all detections when image metadata read fails — fail-open", async () => {
    mockMetadata.mockRejectedValueOnce(new Error("bad buffer"));
    const result = await verifyDetections(FAKE_URI, [det("chair"), det("table")]);
    expect(result).toHaveLength(2);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("sends prompt that includes the label text to Claude", async () => {
    yes();
    await verifyDetections(FAKE_URI, [det("classroom rules poster")]);
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
    const call = mockMessagesCreate.mock.calls[0]?.[0] as { messages: Array<{ content: unknown[] }> };
    const textBlock = (call.messages[0]?.content as Array<{ type: string; text?: string }>)
      .find((b) => b.type === "text");
    expect(textBlock?.text).toContain("classroom rules poster");
  });

  it("constructs client WITHOUT baseURL when ANTHROPIC_API_KEY is set (direct key)", async () => {
    mockAnthropicConfig.baseUrl = "";
    mockAnthropicConfig.apiKey  = "sk-ant-direct-key";
    yes();
    // Force a new client by re-importing the module fresh
    vi.resetModules();
    const mod = await import("./visionVerify");
    await mod.verifyDetections(FAKE_URI, [det("chair")]);

    const lastCtor = anthropicCtorCalls.at(-1);
    expect(lastCtor?.["apiKey"]).toBe("sk-ant-direct-key");
    expect(lastCtor?.["baseURL"]).toBeUndefined();
  });

  it("constructs client WITH baseURL when using the integrations proxy", async () => {
    mockAnthropicConfig.baseUrl = "http://localhost:1106/modelfarm/anthropic";
    mockAnthropicConfig.apiKey  = "_DUMMY_API_KEY_";
    yes();
    vi.resetModules();
    const mod = await import("./visionVerify");
    await mod.verifyDetections(FAKE_URI, [det("chair")]);

    const lastCtor = anthropicCtorCalls.at(-1);
    expect(lastCtor?.["baseURL"]).toBe("http://localhost:1106/modelfarm/anthropic");
    expect(lastCtor?.["apiKey"]).toBe("_DUMMY_API_KEY_");
  });
});
