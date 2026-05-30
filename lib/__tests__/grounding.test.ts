import { describe, expect, it } from 'vitest';
import { verifyGrounding } from '../grounding';
import type { AnalysisOutput } from '../prompt/output-schema';

// Spec § Test surface tests #17 (rejects fabricated) and #18 (accepts
// close-but-not-exact). Plus skip-absence, JSONPath formatting, and perf.

function mkOutput(partial: Partial<AnalysisOutput> = {}): AnalysisOutput {
  return {
    summary: '',
    risk_score: 0,
    risks: [],
    clauses: [],
    suggestions: [],
    ...partial,
  };
}

const CONTRACT = `
This Master Services Agreement ("Agreement") is entered into between Buyer and Vendor.
Section 11. Termination. Either party may terminate for convenience with 30 days written notice.
Section 12.3. The Term shall auto-renew unless either party gives notice 90 days prior to renewal.
Section 14.2. Vendor's aggregate liability shall not exceed fees paid in the prior 12 months.
Section 17. Buyer shall make annual prepayment due in advance of Year 1 services commencement.
`.trim();

describe('verifyGrounding — basic substring match', () => {
  it('exact substring → no failure', () => {
    const out = mkOutput({
      risks: [{
        risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
        evidence: { type: 'quoted', clause_reference: '§ 11', quoted_text: 'Either party may terminate for convenience with 30 days written notice' },
      }],
    });
    expect(verifyGrounding(out, CONTRACT)).toEqual([]);
  });

  it('whitespace-normalized variant (double spaces) still grounds', () => {
    const out = mkOutput({
      risks: [{
        risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
        evidence: { type: 'quoted', clause_reference: '§ 14', quoted_text: "Vendor's  aggregate    liability shall not exceed fees paid in the prior 12 months" },
      }],
    });
    expect(verifyGrounding(out, CONTRACT)).toEqual([]);
  });

  it('smart-quote substitution still grounds', () => {
    const out = mkOutput({
      risks: [{
        risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
        evidence: { type: 'quoted', clause_reference: '§ 1', quoted_text: '“Agreement” is entered into between Buyer and Vendor' },
      }],
    });
    expect(verifyGrounding(out, CONTRACT)).toEqual([]);
  });
});

describe('verifyGrounding — fabricated quotes', () => {
  it('fabricated quote returns failure with best_match populated', () => {
    const fabricated = 'This exact sentence does not appear in the contract anywhere at all';
    const out = mkOutput({
      risks: [{
        risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
        evidence: { type: 'quoted', clause_reference: '§ 99', quoted_text: fabricated },
      }],
    });
    const failures = verifyGrounding(out, CONTRACT);
    expect(failures).toHaveLength(1);
    expect(failures[0].path).toBe('risks[0].evidence.quoted_text');
    expect(failures[0].quoted_text).toBe(fabricated);
    expect(failures[0].similarity).toBeLessThan(0.85);
    expect(typeof failures[0].best_match).toBe('string');
  });
});

describe('verifyGrounding — skips non-quoted entries', () => {
  it('evidence.type === "absence" is skipped', () => {
    const out = mkOutput({
      risks: [{
        risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
        evidence: { type: 'absence', missing_concept: 'no liability cap defined anywhere' },
      }],
    });
    expect(verifyGrounding(out, CONTRACT)).toEqual([]);
  });

  it('presence.status === "absent" is skipped', () => {
    const out = mkOutput({
      clauses: [{ key_clause_id: 'k', presence: { status: 'absent' } }],
    });
    expect(verifyGrounding(out, CONTRACT)).toEqual([]);
  });
});

describe('verifyGrounding — multiple failures with JSONPath', () => {
  it('accumulates failures across risks and clauses with correct paths', () => {
    const fab = 'absolutely fabricated sentence that does not exist';
    const out = mkOutput({
      risks: [
        { risk_area_id: 'r', severity: 'low', title: 't', description: 'd',
          evidence: { type: 'absence', missing_concept: 'no SLA defined at all' } },
        { risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
          evidence: { type: 'quoted', clause_reference: '§ x', quoted_text: fab } },
      ],
      clauses: [
        { key_clause_id: 'k', presence: { status: 'absent' } },
        { key_clause_id: 'k', presence: { status: 'present', quoted_text: fab + ' two' } },
      ],
    });
    const failures = verifyGrounding(out, CONTRACT);
    expect(failures).toHaveLength(2);
    expect(failures[0].path).toBe('risks[1].evidence.quoted_text');
    expect(failures[1].path).toBe('clauses[1].presence.quoted_text');
  });
});

describe('verifyGrounding — performance', () => {
  it('320 KB contract, 5 quotes, completes in < 500 ms', () => {
    // Build a ~320 KB contract by repeating CONTRACT.
    const big = (CONTRACT + '\n').repeat(Math.ceil(320_000 / CONTRACT.length));
    const out = mkOutput({
      risks: [
        { risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
          evidence: { type: 'quoted', clause_reference: '§ 11', quoted_text: 'Either party may terminate for convenience with 30 days written notice' } },
        { risk_area_id: 'r', severity: 'high', title: 't', description: 'd',
          evidence: { type: 'quoted', clause_reference: '§ 14', quoted_text: "Vendor's aggregate liability shall not exceed fees paid in the prior 12 months" } },
        { risk_area_id: 'r', severity: 'med' as 'medium', title: 't', description: 'd',
          evidence: { type: 'quoted', clause_reference: '§ 17', quoted_text: 'Buyer shall make annual prepayment due in advance of Year 1 services commencement' } },
      ],
      clauses: [
        { key_clause_id: 'k', presence: { status: 'present', quoted_text: 'auto-renew unless either party gives notice 90 days prior' } },
        { key_clause_id: 'k', presence: { status: 'present', quoted_text: 'Master Services Agreement ("Agreement") is entered into between Buyer and Vendor' } },
      ],
    });
    // Patch severity for test fixture (avoids widening AnalysisOutput type).
    (out.risks[2] as { severity: string }).severity = 'medium';

    const t0 = performance.now();
    const failures = verifyGrounding(out, big);
    const elapsed = performance.now() - t0;
    expect(failures).toEqual([]);
    expect(elapsed).toBeLessThan(500);
  });
});
