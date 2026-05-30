// POST /api/admin/personas/[id]/draft/preview
//
// Compiles the current draft against a small stub contract and returns the
// rendered prompt so the admin can sanity-check formatting (markdown / quote
// oddities, persona-block ordering, etc.) before publishing.
//
// The draft is read from the DB rather than the request body — the DB is the
// source of truth. The caller must have saved their changes first.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { getDraft, PersonaRepoError } from '@/lib/persona/repo'
import { compile } from '@/lib/prompt/compile'

const STUB_CONTRACT = `Sample Master Services Agreement (stub)

§ 1 Definitions. "Services" means the software-as-a-service offering described in Exhibit A.

§ 2 Term. This Agreement commences on the Effective Date and continues for an initial term of twenty-four (24) months, renewing automatically for successive twelve (12) month terms unless either party gives sixty (60) days written notice of non-renewal.

§ 3 Fees. Customer shall pay the fees set out in Order Form #1 annually in advance, non-refundable.

§ 4 Limitation of Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY OR INDEMNIFICATION OBLIGATIONS, EACH PARTY'S TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID OR PAYABLE IN THE PRECEDING TWELVE MONTHS.

§ 5 Governing Law. This Agreement is governed by the laws of Delaware.
`

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    const draft = await getDraft(getServiceClient(), id)
    if (!draft) {
      return NextResponse.json({ error: 'no_draft' }, { status: 404 })
    }
    const result = compile({
      persona: draft.content,
      contractText: STUB_CONTRACT,
      userContext: undefined,
    })
    return NextResponse.json({
      prompt: result.prompt,
      promptHash: result.promptHash,
      personaHash: result.personaHash,
    })
  } catch (err) {
    if (err instanceof PersonaRepoError) {
      return NextResponse.json({ error: err.code, detail: err.detail }, { status: 500 })
    }
    return NextResponse.json(
      { error: 'preview_failed', detail: (err as Error).message },
      { status: 500 },
    )
  }
}
