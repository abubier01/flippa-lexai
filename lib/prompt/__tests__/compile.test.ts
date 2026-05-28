import { describe, expect, it } from 'vitest';
import { compile } from '../compile';
import { CORE_GUARDRAILS, FINAL_INSTRUCTION } from '../core';
import { PROCUREMENT_PERSONA } from '../persona-procurement';
import { PersonaSchema } from '../persona-types';

const contractText = 'This Master Services Agreement is between Buyer and Vendor...';

describe('compile()', () => {
  it('produces identical prompt and hashes for identical inputs (determinism)', () => {
    const a = compile({ persona: PROCUREMENT_PERSONA, contractText, userContext: 'NY jurisdiction' });
    const b = compile({ persona: PROCUREMENT_PERSONA, contractText, userContext: 'NY jurisdiction' });

    expect(a.prompt).toBe(b.prompt);
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.personaHash).toBe(b.personaHash);
    expect(a.contextHash).toBe(b.contextHash);
    expect(a.contextHash).not.toBeNull();
  });

  it('returns null contextHash when userContext is undefined', () => {
    const result = compile({ persona: PROCUREMENT_PERSONA, contractText });
    expect(result.contextHash).toBeNull();
    expect(result.prompt).toContain('<user_context>(none provided)</user_context>');
  });

  it('orders blocks per spec: core, persona, key_clauses, risk_areas, contract, user_context, output_schema, final', () => {
    const { prompt } = compile({
      persona: PROCUREMENT_PERSONA,
      contractText,
      userContext: 'sample context',
    });

    const order = [
      CORE_GUARDRAILS,
      '<persona_description>',
      '<key_clauses>',
      '<risk_areas>',
      '<contract>',
      '<user_context>',
      '<output_schema>',
      FINAL_INSTRUCTION,
    ];

    let cursor = 0;
    for (const marker of order) {
      const idx = prompt.indexOf(marker, cursor);
      expect(idx, `expected to find "${marker.slice(0, 40)}" after position ${cursor}`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + marker.length;
    }
  });

  it('changes promptHash when userContext changes', () => {
    const a = compile({ persona: PROCUREMENT_PERSONA, contractText });
    const b = compile({ persona: PROCUREMENT_PERSONA, contractText, userContext: 'something' });
    expect(a.promptHash).not.toBe(b.promptHash);
    // personaHash and contract are unchanged
    expect(a.personaHash).toBe(b.personaHash);
  });

  it('PROCUREMENT_PERSONA fixture validates against PersonaSchema', () => {
    expect(() => PersonaSchema.parse(PROCUREMENT_PERSONA)).not.toThrow();
  });
});
