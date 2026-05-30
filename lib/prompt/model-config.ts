// lib/prompt/model-config.ts
//
// Tier 1 pins one model. Decided 2026-05-28: Groq llama-3.3-70b-versatile.
// Anthropic added in a follow-on PR (will introduce a second matrix row).

export const MODEL_ID = 'llama-3.3-70b-versatile' as const;

export const MODEL_PARAMS = Object.freeze({
  temperature: 0.2,
  top_p: 1,
  max_tokens: 4096,
  // seed omitted — Groq does not honor it as of pin date.
} as const) satisfies Readonly<Record<string, number>>;

// 128k context window on llama-3.3-70b-versatile; leave headroom for output
// (max_tokens above) + prompt scaffolding (~4k) + safety margin.
export const MAX_CONTRACT_TOKENS = 100_000;

// Unit cost (USD per 1M tokens) snapshot at pin time. Source: Groq pricing page.
// Persisted into analysis_runs.cost_usd_micros at request time; do NOT recompute
// later if pricing changes — historical rows stay accurate.
export const UNIT_COSTS_USD_PER_MTOK = Object.freeze({
  inputMicrosNumerator: 59n,
  outputMicrosNumerator: 79n,
  denominator: 100n,
} as const);

export function computeCostMicros(usage: {
  input_tokens: number;
  output_tokens: number;
}): number {
  const denom = UNIT_COSTS_USD_PER_MTOK.denominator;
  const half = denom / 2n;

  const inputScaled = BigInt(usage.input_tokens) * UNIT_COSTS_USD_PER_MTOK.inputMicrosNumerator;
  const outputScaled = BigInt(usage.output_tokens) * UNIT_COSTS_USD_PER_MTOK.outputMicrosNumerator;
  const totalMicros = (inputScaled + outputScaled + half) / denom;

  if (totalMicros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('cost_usd_micros exceeds JS safe integer range');
  }
  return Number(totalMicros);
}
