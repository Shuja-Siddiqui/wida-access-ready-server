/**
 * Live Anthropic model pricing — fetched from official docs, cached in memory.
 * Used by super-admin AI usage dashboard for per-call cost estimates.
 */

import { config } from "../config/index";
import { logger } from "../config/logger";

const PRICING_DOC_URL = "https://docs.anthropic.com/en/about-claude/pricing.md";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AnthropicModelPrice {
  /** Normalized API-style id, e.g. claude-haiku-4-5 */
  modelId: string;
  displayName: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export interface AnthropicPricingSnapshot {
  prices: AnthropicModelPrice[];
  fetchedAt: string;
  source: string;
  expiresAt: string;
  fromCache: boolean;
}

interface PricingCache {
  fetchedAt: number;
  source: string;
  byModelId: Map<string, AnthropicModelPrice>;
  displayNames: AnthropicModelPrice[];
}

let cache: PricingCache | null = null;
let refreshPromise: Promise<PricingCache> | null = null;

/** Fallback when docs fetch fails — last-known Anthropic list prices (USD / MTok). */
const FALLBACK_PRICES: AnthropicModelPrice[] = [
  { modelId: "claude-haiku-4-5",   displayName: "Claude Haiku 4.5",   inputPerMillionUsd: 1,  outputPerMillionUsd: 5  },
  { modelId: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5",  inputPerMillionUsd: 3,  outputPerMillionUsd: 15 },
  { modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6",  inputPerMillionUsd: 3,  outputPerMillionUsd: 15 },
  { modelId: "claude-opus-4-5",   displayName: "Claude Opus 4.5",    inputPerMillionUsd: 5,  outputPerMillionUsd: 25 },
  { modelId: "claude-opus-4-6",   displayName: "Claude Opus 4.6",    inputPerMillionUsd: 5,  outputPerMillionUsd: 25 },
];

function parseUsdPerMtok(raw: string): number {
  const m = raw.match(/\$([\d.]+)/);
  return m ? Number.parseFloat(m[1]) : NaN;
}

/**
 * Normalize any Claude model id for pricing lookup.
 * API ids use hyphens + optional date suffix: claude-haiku-4-5-20251001
 * Docs display names become: claude-haiku-4-5 (never dots).
 */
export function normalizeModelIdForPricing(modelId: string): string {
  return modelId
    .toLowerCase()
    .trim()
    .replace(/^anthropic\./, "")
    .replace(/@.*$/, "")
    .replace(/\./g, "-")           // claude-haiku-4.5 → claude-haiku-4-5
    .replace(/-\d{8}$/, "");       // strip snapshot date suffix
}

/** "Claude Haiku 4.5 (retired…)" → claude-haiku-4-5 */
export function displayNameToModelId(displayName: string): string {
  const base = displayName.replace(/\([^)]*\)/g, "").trim();
  return normalizeModelIdForPricing(
    base.replace(/^claude\s+/i, "claude-").replace(/\s+/g, "-"),
  );
}

function parsePricingMarkdown(markdown: string): AnthropicModelPrice[] {
  const rows: AnthropicModelPrice[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| Claude ")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 6) continue;
    const displayName = cells[0];
    const inputUsd = parseUsdPerMtok(cells[1]);
    const outputUsd = parseUsdPerMtok(cells[5]);
    if (!Number.isFinite(inputUsd) || !Number.isFinite(outputUsd)) continue;
    rows.push({
      modelId: displayNameToModelId(displayName),
      displayName: displayName.replace(/\([^)]*\)/g, "").trim(),
      inputPerMillionUsd: inputUsd,
      outputPerMillionUsd: outputUsd,
    });
  }
  return rows;
}

function normalizePriceRow(p: AnthropicModelPrice): AnthropicModelPrice {
  const id = normalizeModelIdForPricing(p.modelId);
  return { ...p, modelId: id };
}

/** Live docs may omit API snapshot ids; fallback fills gaps without overwriting live rows. */
function mergeWithFallback(live: AnthropicModelPrice[]): AnthropicModelPrice[] {
  const byId = new Map(live.map((p) => [normalizeModelIdForPricing(p.modelId), normalizePriceRow(p)]));
  for (const fb of FALLBACK_PRICES) {
    const id = normalizeModelIdForPricing(fb.modelId);
    if (!byId.has(id)) byId.set(id, normalizePriceRow(fb));
  }
  return [...byId.values()];
}

function buildCache(prices: AnthropicModelPrice[], source: string): PricingCache {
  const normalized = prices.map(normalizePriceRow);
  const byModelId = new Map(normalized.map((p) => [p.modelId, p]));
  return { fetchedAt: Date.now(), source, byModelId, displayNames: normalized };
}

async function fetchLivePricing(): Promise<PricingCache> {
  try {
    const res = await fetch(PRICING_DOC_URL, {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parsePricingMarkdown(text);
    if (parsed.length === 0) throw new Error("No pricing rows parsed");
    const merged = mergeWithFallback(parsed);
    logger.info({ live: parsed.length, merged: merged.length }, "anthropic pricing refreshed from docs");
    return buildCache(merged, PRICING_DOC_URL);
  } catch (err) {
    logger.warn({ err }, "anthropic pricing fetch failed — using fallback table");
    return buildCache(FALLBACK_PRICES, "fallback");
  }
}

export async function getAnthropicPricing(opts?: { forceRefresh?: boolean }): Promise<AnthropicPricingSnapshot> {
  const force = opts?.forceRefresh ?? false;
  const now = Date.now();

  if (!force && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      prices: cache.displayNames,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      expiresAt: new Date(cache.fetchedAt + CACHE_TTL_MS).toISOString(),
      source: cache.source,
      fromCache: true,
    };
  }

  if (!refreshPromise) {
    refreshPromise = fetchLivePricing().finally(() => {
      refreshPromise = null;
    });
  }
  cache = await refreshPromise;

  return {
    prices: cache.displayNames,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    expiresAt: new Date(cache.fetchedAt + CACHE_TTL_MS).toISOString(),
    source: cache.source,
    fromCache: false,
  };
}

function resolvePrice(model: string | null | undefined, pricing: PricingCache): AnthropicModelPrice | null {
  const raw = model ?? config.anthropic.model ?? "";
  if (!raw.trim()) return null;

  const normalized = normalizeModelIdForPricing(raw);

  const direct = pricing.byModelId.get(normalized);
  if (direct) return direct;

  // Longest prefix match (e.g. claude-sonnet-4-5-20250929 → claude-sonnet-4-5)
  let best: AnthropicModelPrice | null = null;
  let bestLen = 0;
  for (const [id, price] of pricing.byModelId) {
    if (normalized.startsWith(`${id}-`) || normalized === id) {
      if (id.length > bestLen) {
        best = price;
        bestLen = id.length;
      }
    }
  }
  return best;
}

export interface CallCostEstimate {
  model: string | null;
  pricingModelId: string | null;
  pricingDisplayName: string | null;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
  priced: boolean;
}

export function estimateCallCost(
  params: {
    model: string | null | undefined;
    inputTokens: number;
    outputTokens: number;
  },
  pricingCache?: PricingCache | null,
): CallCostEstimate {
  const pricing = pricingCache ?? cache;
  const price = pricing ? resolvePrice(params.model, pricing) : null;

  if (!price) {
    return {
      model: params.model ?? null,
      pricingModelId: null,
      pricingDisplayName: null,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      inputPerMillionUsd: null,
      outputPerMillionUsd: null,
      priced: false,
    };
  }

  const inputCostUsd = (params.inputTokens / 1_000_000) * price.inputPerMillionUsd;
  const outputCostUsd = (params.outputTokens / 1_000_000) * price.outputPerMillionUsd;

  return {
    model: params.model ?? null,
    pricingModelId: price.modelId,
    pricingDisplayName: price.displayName,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    inputPerMillionUsd: price.inputPerMillionUsd,
    outputPerMillionUsd: price.outputPerMillionUsd,
    priced: true,
  };
}

/** Ensure pricing is loaded before batch cost calculation. */
export async function ensurePricingLoaded(): Promise<PricingCache> {
  await getAnthropicPricing();
  return cache!;
}

export function getPricingCacheForEstimate(): PricingCache | null {
  return cache;
}
