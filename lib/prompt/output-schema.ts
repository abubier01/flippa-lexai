// lib/prompt/output-schema.ts
//
// Persona-parameterized factory. The schema's key-clause and risk-area enums
// are derived from the loaded persona, NOT from a module-level constant.
// Called at request time by the route handler with the loaded persona version.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Persona } from './persona-types';

// Static type for consumers (UI renderers, contract-side reads). Stable across
// persona-version changes — only the ID strings inside it change.
export interface AnalysisOutput {
  summary: string;
  risk_score: number;
  risks: Array<{
    risk_area_id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    evidence:
      | { type: 'quoted';  clause_reference: string; quoted_text: string }
      | { type: 'absence'; missing_concept: string };
  }>;
  clauses: Array<{
    key_clause_id: string;
    presence:
      | { status: 'present'; quoted_text: string; concern?: string }
      | { status: 'absent' };
  }>;
  suggestions: string[];
}

export function buildOutputSchema(persona: Persona) {
  const KEY_CLAUSE_IDS = persona.keyClauses.map(c => c.id) as [string, ...string[]];
  const RISK_AREA_IDS  = persona.riskAreas.map(r => r.id)  as [string, ...string[]];

  // Each risk must be grounded — either a quoted citation OR a deliberate
  // absence-flag. Discriminated union forces the model to declare which.
  const RiskEvidence = z.discriminatedUnion('type', [
    z.object({
      type:             z.literal('quoted'),
      clause_reference: z.string().min(1),             // "§ 14.2" or "Termination clause, ¶3"
      quoted_text:      z.string().min(20).max(500),   // verbatim contract text; verified post-schema
    }),
    z.object({
      type:            z.literal('absence'),
      missing_concept: z.string().min(10).max(500),    // "no liability cap defined"; not verified
    }),
  ]);

  // Each key-clause finding is either present (with verified quote) or absent.
  const ClausePresence = z.discriminatedUnion('status', [
    z.object({
      status:      z.literal('present'),
      quoted_text: z.string().min(20).max(500),
      concern:     z.string().optional(),
    }),
    z.object({
      status: z.literal('absent'),
    }),
  ]);

  const OutputSchema = z.object({
    summary: z.string(),
    // Integer 0-100 end-to-end: matches the persona rubric's integer bands and the
    // ::int cast used by the partial index in § Indexing. Provider structured-output
    // declares this as `{ type: "integer", minimum: 0, maximum: 100 }`.
    risk_score: z.number().int().min(0).max(100),

    risks: z.array(z.object({
      risk_area_id: z.enum(RISK_AREA_IDS),             // MUST match a persona.riskAreas[].id
      severity:     z.enum(['low', 'medium', 'high', 'critical']),
      title:        z.string(),
      description:  z.string(),
      evidence:     RiskEvidence,                      // required — grounding invariant 14
    })),

    clauses: z.array(z.object({
      key_clause_id: z.enum(KEY_CLAUSE_IDS),           // MUST match a persona.keyClauses[].id
      presence:      ClausePresence,                    // required — grounding invariant 14
    })),

    suggestions: z.array(z.string()),
  }).strict();

  // Generated per-persona-version. Used by the provider structured-output call
  // (so the model is enum-constrained at generation) AND embedded redundantly
  // in the prompt as a safety net.
  const OUTPUT_SCHEMA_JSON = zodToJsonSchema(OutputSchema);

  return { OutputSchema, OUTPUT_SCHEMA_JSON };
}
