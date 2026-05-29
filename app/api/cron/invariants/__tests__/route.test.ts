import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockVerify = vi.fn()
vi.mock('@upstash/qstash', () => ({
  Receiver: class {
    verify = mockVerify
  },
}))

const mockRpc = vi.fn()
vi.mock('@/lib/supabase/service-role-core', () => ({
  getServiceClient: () => ({ rpc: mockRpc }),
}))

const mockLogError = vi.fn()
const mockLogInfo = vi.fn()
const mockLogWarn = vi.fn()
vi.mock('@/lib/log', () => ({
  log: {
    error: mockLogError,
    info: mockLogInfo,
    warn: mockLogWarn,
    debug: vi.fn(),
  },
}))

const mockSentryCapture = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: mockSentryCapture,
}))

const ORIGINAL_ENV = { ...process.env }

async function importRouteFresh() {
  vi.resetModules()
  return import('../route')
}

function makeRequest(body = '{}', signature = 'sig-ok'): Request {
  return new Request('http://localhost/api/cron/invariants', {
    method: 'POST',
    headers: { 'Upstash-Signature': signature, 'content-type': 'application/json' },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  process.env.QSTASH_CURRENT_SIGNING_KEY = 'curr'
  process.env.QSTASH_NEXT_SIGNING_KEY = 'next'
  delete process.env.HEALTHCHECKS_INVARIANTS_PING_URL
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('POST /api/cron/invariants', () => {
  it('returns 503 when QSTASH_CURRENT_SIGNING_KEY is unset', async () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 503 when QSTASH_NEXT_SIGNING_KEY is unset', async () => {
    delete process.env.QSTASH_NEXT_SIGNING_KEY
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })

  it('returns 401 when signature verify rejects', async () => {
    mockVerify.mockRejectedValueOnce(new Error('bad sig'))
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSentryCapture).not.toHaveBeenCalled()
  })

  it('returns 500 when the RPC errors', async () => {
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(mockSentryCapture).not.toHaveBeenCalled()
  })

  it('returns 200 with drift_count=0 and no Sentry capture when no drift', async () => {
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ drift_count: 0, rows: null })
    expect(mockRpc).toHaveBeenCalledWith('check_current_run_invariants')
    expect(mockSentryCapture).not.toHaveBeenCalled()
  })

  it('pings Healthchecks when HEALTHCHECKS_INVARIANTS_PING_URL is set', async () => {
    process.env.HEALTHCHECKS_INVARIANTS_PING_URL = 'https://hc-ping.test/inv'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const { POST } = await importRouteFresh()
    await POST(makeRequest())
    expect(fetchSpy).toHaveBeenCalledWith('https://hc-ping.test/inv', { method: 'POST' })
    fetchSpy.mockRestore()
  })

  it('skips Healthchecks ping when env var is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const { POST } = await importRouteFresh()
    await POST(makeRequest())
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('returns 200 with rows and fires Sentry capture when drift is seeded', async () => {
    const driftRows = [
      { kind: 'pointer_not_current', contract_id: 'c-1', run_id: 'r-1' },
      { kind: 'multiple_current', contract_id: 'c-2', run_id: null },
    ]
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: driftRows, error: null })
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drift_count).toBe(2)
    expect(body.rows).toEqual(driftRows)
    expect(mockSentryCapture).toHaveBeenCalledWith(
      'cron.invariants.drift',
      expect.objectContaining({
        level: 'warning',
        tags: { event: 'invariants_drift' },
        extra: expect.objectContaining({ drift_count: 2, rows: driftRows }),
      }),
    )
  })

  it('caps Sentry extra.rows to first 50 when drift is large', async () => {
    const big = Array.from({ length: 73 }, (_, i) => ({
      kind: 'pointer_not_current',
      contract_id: `c-${i}`,
      run_id: `r-${i}`,
    }))
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: big, error: null })
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(body.drift_count).toBe(73)
    expect(body.rows).toHaveLength(73)
    const sentryCall = mockSentryCapture.mock.calls[0][1]
    expect((sentryCall.extra.rows as unknown[]).length).toBe(50)
  })
})
