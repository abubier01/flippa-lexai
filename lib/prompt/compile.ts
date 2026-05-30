// lib/prompt/compile.ts
//
// Persona-parameterized. The persona is loaded by the route handler from
// persona_versions and passed in. compile() does NOT import any persona constant.
// compile() derives the embedded output-schema JSON internally so callers have
// a minimal signature.

import crypto from 'node:crypto';
import { CORE_GUARDRAILS, FINAL_INSTRUCTION } from './core';
import type { Persona } from './persona-types';
import { buildOutputSchema } from './output-schema';

export interface CompileInput {
  persona: Persona;                          // loaded from DB at request time
  contractText: string;
  userContext?: string;                      // already scrubbed by route handler
}

export interface CompileResult {
  prompt: string;
  promptHash: string;
  contextHash: string | null;
  personaHash: string;
}

// Canonical serialization for persona_hash. Keyed-object ordering matters —
// JSON.stringify on plain objects preserves insertion order, but we explicitly
// re-build the object to be defensive against future refactors and to keep
// the hash stable across DB driver quirks (e.g. jsonb key reordering on read).
export function canonicalSerializePersona(p: Persona): string {
  return JSON.stringify({
    id: p.id,
    description: p.description,
    keyClauses: p.keyClauses.map(c => ({ id: c.id, label: c.label, hint: c.hint ?? null })),
    riskAreas:  p.riskAreas.map(r =>  ({ id: r.id, label: r.label, hint: r.hint ?? null })),
  });
}

function renderKeyClausesBlock(p: Persona): string {
  const lines = p.keyClauses.map(c =>
    `  - ${c.id}: ${c.label}${c.hint ? ` — ${c.hint}` : ''}`
  );
  return `<key_clauses>\nFocus your clause-level analysis on these clauses. When you report a clause, set key_clause_id to one of these IDs.\n${lines.join('\n')}\n</key_clauses>`;
}

function renderRiskAreasBlock(p: Persona): string {
  const lines = p.riskAreas.map(r =>
    `  - ${r.id}: ${r.label}${r.hint ? ` — ${r.hint}` : ''}`
  );
  return `<risk_areas>\nReport risks under one of these areas. When you report a risk, set risk_area_id to one of these IDs.\n${lines.join('\n')}\n</risk_areas>`;
}

export function compile(input: CompileInput): CompileResult {
  const { persona, contractText, userContext } = input;
  const { OUTPUT_SCHEMA_JSON } = buildOutputSchema(persona);

  const userBlock = userContext
    ? `<user_context>\n${userContext}\n</user_context>`
    : '<user_context>(none provided)</user_context>';

  // Deterministic ordering. Any change here bumps prompt_hash for every run.
  //
  // Block order rationale:
  //   1. Core guardrails       — data/instruction boundary up front.
  //   2. Persona description    — analytical lens.
  //   3. Key clauses (enum)     — anchors clause-level output IDs.
  //   4. Risk areas (enum)      — anchors risk-level output IDs.
  //   5. Contract               — primary subject of analysis.
  //   6. User context           — informs analysis of the contract above it.
  //   7. Output schema          — adjacent to the final instruction.
  //   8. Final instruction      — recency bias for format adherence.
  const prompt = [
    CORE_GUARDRAILS,
    `<persona_description>\n${persona.description}\n</persona_description>`,
    renderKeyClausesBlock(persona),
    renderRiskAreasBlock(persona),
    `<contract>\n${contractText}\n</contract>`,
    userBlock,
    `<output_schema>\n${JSON.stringify(OUTPUT_SCHEMA_JSON)}\n</output_schema>`,
    FINAL_INSTRUCTION,
  ].join('\n\n');

  const promptHash  = sha256(prompt);
  const contextHash = userContext ? sha256(userContext) : null;
  const personaHash = sha256(canonicalSerializePersona(persona));

  return { prompt, promptHash, contextHash, personaHash };
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
