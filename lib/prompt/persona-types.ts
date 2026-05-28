// lib/prompt/persona-types.ts
//
// Types + Zod schema. Runtime code (compile, output-schema, admin loader,
// route handler) imports from here, not from persona-procurement.ts. This
// keeps runtime imports decoupled from the seed file, which is consumed only
// by the migration and by tests.

import { z } from 'zod';

const SLUG = /^[a-z][a-z0-9_]{0,31}$/;

const KeyClauseSchema = z.object({
  id:    z.string().regex(SLUG),
  label: z.string().min(1).max(80),
  hint:  z.string().max(280).optional(),
});

const RiskAreaSchema = z.object({
  id:    z.string().regex(SLUG),
  label: z.string().min(1).max(80),
  hint:  z.string().max(280).optional(),
});

// Source of truth for persona shape. Used by the admin publish endpoint to
// validate incoming content AND by the route handler to re-validate content
// loaded from persona_versions.content (defense against direct-SQL writes
// that bypassed the publish path).
export const PersonaSchema = z.object({
  id:          z.string().regex(SLUG),
  description: z.string().min(1).max(8_000),
  keyClauses:  z.array(KeyClauseSchema).min(1).max(50),
  riskAreas:   z.array(RiskAreaSchema).min(1).max(50),
}).strict().superRefine((p, ctx) => {
  // Unique IDs within each array (matches lib/prompt/persona-procurement.ts assertion).
  const seenK = new Set<string>();
  for (const c of p.keyClauses) {
    if (seenK.has(c.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keyClauses'], message: `duplicate keyClause id: ${c.id}` });
    seenK.add(c.id);
  }
  const seenR = new Set<string>();
  for (const r of p.riskAreas) {
    if (seenR.has(r.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['riskAreas'], message: `duplicate riskArea id: ${r.id}` });
    seenR.add(r.id);
  }
});

export type KeyClause = z.infer<typeof KeyClauseSchema>;
export type RiskArea  = z.infer<typeof RiskAreaSchema>;
export type Persona   = z.infer<typeof PersonaSchema>;
