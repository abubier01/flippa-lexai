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

// Rate-limit mock — default: allowed. Individual tests can override with
// mockReturnValueOnce to simulate the limit being hit.
vi.mock('@/lib/security/rate-limit', () => ({
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  consumeRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 10,
    remaining: 9,
    resetAt: Date.now() + 60 * 60 * 1000,
    retryAfterSeconds: 0,
  }),
  rateLimitHeaders: vi.fn().mockReturnValue({
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.floor((Date.now() + 3600 * 1000) / 1000)),
    'Retry-After': '3600',
  }),
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
import * as rateLimitMod from '@/lib/security/rate-limit'

const pdfParse = pdfParseMod as unknown as ReturnType<typeof vi.fn>
const mammothExtract = mammothMod.extractRawText as unknown as ReturnType<typeof vi.fn>
const consumeRateLimitMock = rateLimitMod.consumeRateLimit as unknown as ReturnType<typeof vi.fn>

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

// ---------------------------------------------------------------------------
// Server-side size cap tests (audit findings #5, partial #12)
// ---------------------------------------------------------------------------

/**
 * Build a NextRequest whose formData() method is replaced with a stub that
 * returns a plain-object FormData-alike containing a fake File with the
 * desired `size` property. This bypasses multipart round-tripping so we can
 * test boundary conditions without allocating 10+ MB of real memory.
 */
function buildFakeFileRequest(sizeBytes: number, fileName = 'big.pdf'): NextRequest {
  const fakeFile = {
    name: fileName,
    size: sizeBytes,
    type: 'application/pdf',
    // arrayBuffer should not be called for oversized files (the size guard
    // fires first), but we stub it in case it is invoked by the 9 MB test.
    arrayBuffer: () => Promise.resolve(Buffer.from('%PDF-1.4 tiny').buffer),
    text: () => Promise.resolve(''),
  }

  const fakeFormData = {
    get(key: string) {
      if (key === 'title') return 'Big Contract'
      if (key === 'file') return fakeFile
      return null
    },
  }

  const req = new NextRequest('http://localhost/api/contracts/upload', {
    method: 'POST',
    // Provide a minimal body to satisfy NextRequest construction; formData()
    // is replaced below before POST() uses it.
    body: '{}',
  })
  // Replace formData() so the route receives our controlled fake.
  req.formData = () => Promise.resolve(fakeFormData as unknown as FormData)
  return req
}

function buildTextRequest(text: string): NextRequest {
  const form = new FormData()
  form.set('title', 'Pasted Contract')
  form.set('text', text)
  form.set('fileName', 'pasted.txt')
  return new NextRequest('http://localhost/api/contracts/upload', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/contracts/upload — server-side size caps', () => {
  const ELEVEN_MB = 11 * 1024 * 1024
  const NINE_MB = 9 * 1024 * 1024

  it('returns 413 for an 11 MB file with "File too large" message', async () => {
    const res = await POST(buildFakeFileRequest(ELEVEN_MB))
    const body = await res.json()

    expect(res.status).toBe(413)
    expect(body.error).toMatch(/file too large/i)
    expect(body.error).toMatch(/10 MB/i)
  })

  it('returns 413 for 60,000-character text with "~12 pages" message', async () => {
    const longText = 'a'.repeat(60_000)
    const res = await POST(buildTextRequest(longText))
    const body = await res.json()

    expect(res.status).toBe(413)
    expect(body.error).toMatch(/text too long/i)
    expect(body.error).toMatch(/~12 pages/i)
  })

  it('returns 200 for a 9 MB file (within limit)', async () => {
    // pdf-parse mock returns 'extracted pdf content' by default
    const res = await POST(buildFakeFileRequest(NINE_MB))

    expect(res.status).toBe(200)
  })

  it('returns 200 with X-Lexai-Truncated header for 30,000-character text', async () => {
    // 30,000 chars is within the 50K limit but exceeds the 12K analyzer window
    const longText = 'a'.repeat(30_000)
    const res = await POST(buildTextRequest(longText))

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Lexai-Truncated')).toBe('analysis-window-exceeded')
  })

  it('returns 200 without X-Lexai-Truncated header for 5,000-character text', async () => {
    const shortText = 'a'.repeat(5_000)
    const res = await POST(buildTextRequest(shortText))

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Lexai-Truncated')).toBeNull()
  })

  it('returns 400 with "Invalid text field" when text is a File object (non-string)', async () => {
    const fakeFile = {
      name: 'evil.txt',
      size: 100,
      type: 'text/plain',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      text: () => Promise.resolve(''),
    }

    const fakeFormData = {
      get(key: string) {
        if (key === 'title') return 'Malicious Contract'
        if (key === 'text') return fakeFile
        return null
      },
    }

    const req = new NextRequest('http://localhost/api/contracts/upload', {
      method: 'POST',
      body: '{}',
    })
    req.formData = () => Promise.resolve(fakeFormData as unknown as FormData)

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Invalid text field')
  })
})

// ---------------------------------------------------------------------------
// Rate-limit tests (audit finding #6)
// ---------------------------------------------------------------------------

describe('POST /api/contracts/upload — rate limiting', () => {
  it('returns 429 with correct error and Retry-After header when rate limit is exceeded', async () => {
    consumeRateLimitMock.mockReturnValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 60 * 60 * 1000,
      retryAfterSeconds: 3600,
    })

    const form = new FormData()
    form.set('title', 'Rate Limited Contract')
    const blob = new Blob(['plain text contract'], { type: 'text/plain' })
    const file = new File([blob], 'contract.txt', { type: 'text/plain' })
    form.set('file', file)
    const req = new NextRequest('http://localhost/api/contracts/upload', {
      method: 'POST',
      body: form,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error).toBe('Too many uploads. Please try again later.')
    expect(res.headers.get('Retry-After')).not.toBeNull()
  })
})
