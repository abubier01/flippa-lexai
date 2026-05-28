// lib/prompt/model-config.ts
export const MODEL_ID = 'TBD-at-selection';            // pinned in the PR that selects it
export const MODEL_PARAMS = {
  temperature: 0.2,
  top_p: 1,
  max_tokens: 4096,
  // seed: 42,  // include only if the chosen provider supports it
} as const;

export const MAX_CONTRACT_TOKENS = 80_000;             // recomputed per model at selection
