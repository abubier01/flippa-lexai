// lib/prompt/user-context.ts
//
// Layer 1 + Layer 2 of the user-context security model (spec § Part 3).
// Pure module — no I/O, no `server-only` import. Safe to call from any layer.
//
// validateAndScrub() is the canonical entry point. The route handler calls it
// before passing userContext anywhere near compile().

const MAX_CHARS = 4_000;

export class UserContextError extends Error {
  public readonly code: 'TOO_LONG' | 'EMPTY_AFTER_SCRUB' | 'SENTINEL_VIOLATION';
  constructor(code: 'TOO_LONG' | 'EMPTY_AFTER_SCRUB' | 'SENTINEL_VIOLATION') {
    super(code);
    this.code = code;
    this.name = 'UserContextError';
  }
}

// Every framing tag that compile() introduces. Adding a tag in compile.ts
// requires adding it here AND extending lib/prompt/__tests__/user-context.test.ts.
// Listed verbatim so the scrub list is grep-able from compile.ts.
const FRAMING_TAGS = [
  'user_context',
  'contract',
  'output_schema',
  'persona_description',
  'key_clauses',
  'risk_areas',
] as const;

// Llama 3.x special tokens (Groq pinned in model-config.ts). If MODEL_ID
// changes, revisit this list per spec § Layer 2 "model-specific additions".
const LLAMA_TOKENS = [
  '<|begin_of_text|>',
  '<|start_header_id|>',
  '<|end_header_id|>',
  '<|eot_id|>',
];

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scrub(s: string): string {
  let out = s;

  // Strip every framing tag (open + close, case-insensitive).
  for (const tag of FRAMING_TAGS) {
    out = out.replace(new RegExp(`</?${tag}>`, 'gi'), '[redacted-tag]');
  }

  // Llama special tokens.
  for (const tok of LLAMA_TOKENS) {
    out = out.replace(new RegExp(escapeForRegex(tok), 'g'), '[redacted-token]');
  }

  // Markdown code fences.
  out = out.replace(/```/g, '[code-fence]');

  // ASCII control chars except tab (\x09) and newline (\x0A).
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Collapse 4+ consecutive newlines down to 3.
  out = out.replace(/\n{4,}/g, '\n\n\n');

  return out.trim();
}

export function validateAndScrub(raw: unknown): string {
  if (typeof raw !== 'string') throw new UserContextError('SENTINEL_VIOLATION');
  if (raw.length > MAX_CHARS) throw new UserContextError('TOO_LONG');

  const scrubbed = scrub(raw);
  if (scrubbed.length === 0 && raw.trim().length > 0) {
    throw new UserContextError('EMPTY_AFTER_SCRUB');
  }
  return scrubbed;
}

export const __testing = { MAX_CHARS, FRAMING_TAGS, LLAMA_TOKENS };
