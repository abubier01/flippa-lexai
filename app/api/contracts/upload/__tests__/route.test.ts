/**
 * Unit tests for the upload route's PDF and DOCX extraction error paths.
 *
 * The route has many infrastructure dependencies (Supabase, plan/access, PLAN_LIMITS).
 * We mock all of them to isolate the extraction logic in the PDF and DOCX branches.
 *
 * Audit finding #15: parse errors were swallowed and returned "" which was then
 * replaced with a stub string, causing analyses to run on nonsense content.
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Infrastructure mocks — vi.mock factories cannot reference outer variables
// because they are hoisted. We use vi.hoisted() for shared mock references.
// ---------------------------------------------------------------------------

const { mockFromChain, mockSupabase } = vi.hoisted(() => {
  const mockFromChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        plan: 'pro',
        contracts_this_month: 0,
        usage_reset_at: new Date().toISOString(),
      },
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'contract-id-1' }, error: null }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
      }),
    },
    from: vi.fn().mockReturnValue(mockFromChain),
  }

  return { mockFromChain, mockSupabase }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@/lib/plan/access', () => ({
  getActivePlan: vi.fn().mockResolvedValue({ tier: 'pro', status: 'active' }),
}))

vi.mock('@/lib/plan-limits', () => ({
  PLAN_LIMITS: {
    pro: { contractsPerMonth: -1 },
    free: { contractsPerMonth: 5 },
    team: { contractsPerMonth: -1 },
    solo: { contractsPerMonth: 10 },
  },
}))

// Dynamic mocks for the parsers. Individual tests override these with
// mockResolvedValueOnce / mockRejectedValueOnce.
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'extracted pdf content' }),
}))

vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: 'extracted docx content' }),
}))

// ---------------------------------------------------------------------------
// Import the route and mock references AFTER vi.mock() declarations
// ---------------------------------------------------------------------------
import { POST } from '../route'
import pdfParseMod from 'pdf-parse'
import * as mammothMod from 'mammoth'

const pdfParse = pdfParseMod as unknown as ReturnType<typeof vi.fn>
const mammothExtract = mammothMod.extractRawText as unknown as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

function buildPdfRequest(fileName = 'contract.pdf'): NextRequest {
  const form = new FormData()
  form.set('title', 'My Contract')
  const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' })
  const file = new File([blob], fileName, { type: 'application/pdf' })
  form.set('file', file)
  return new NextRequest('http://localhost/api/contracts/upload', {
    method: 'POST',
    body: form,
  })
}

function buildDocxRequest(fileName = 'contract.docx'): NextRequest {
  const form = new FormData()
  form.set('title', 'My Contract')
  const blob = new Blob(['PK fake docx bytes'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const file = new File([blob], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  form.set('file', file)
  return new NextRequest('http://localhost/api/contracts/upload', {
    method: 'POST',
    body: form,
  })
}

// ---------------------------------------------------------------------------
// PDF extraction failure tests
// ---------------------------------------------------------------------------

describe('POST /api/contracts/upload — PDF extraction failures', () => {
  it('returns 422 with "corrupted or password-protected" when pdf-parse throws', async () => {
    pdfParse.mockRejectedValueOnce(new Error('invalid PDF structure'))

    const res = await POST(buildPdfRequest())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toMatch(/corrupted or password-protected/i)
  })

  it('returns 422 with "image-based or scanned" when pdf-parse returns empty text', async () => {
    pdfParse.mockResolvedValueOnce({ text: '' })

    const res = await POST(buildPdfRequest())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toMatch(/image-based or scanned/i)
  })

  it('returns 422 with "image-based or scanned" when pdf-parse returns whitespace-only text', async () => {
    pdfParse.mockResolvedValueOnce({ text: '   \n\t  ' })

    const res = await POST(buildPdfRequest())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toMatch(/image-based or scanned/i)
  })
})

// ---------------------------------------------------------------------------
// DOCX extraction failure tests
// ---------------------------------------------------------------------------

describe('POST /api/contracts/upload — DOCX extraction failures', () => {
  it('returns 422 with "corrupted" when mammoth throws', async () => {
    mammothExtract.mockRejectedValueOnce(new Error('corrupt zip'))

    const res = await POST(buildDocxRequest())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toMatch(/corrupted/i)
  })

  it('returns 422 with "no extractable text" when mammoth returns empty value', async () => {
    mammothExtract.mockResolvedValueOnce({ value: '' })

    const res = await POST(buildDocxRequest())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toMatch(/no extractable text/i)
  })

  it('returns 422 with "no extractable text" when mammoth returns whitespace-only value', async () => {
    mammothExtract.mockResolvedValueOnce({ value: '   \n  ' })

    const res = await POST(buildDocxRequest())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toMatch(/no extractable text/i)
  })
})
