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
vi.mock('@/lib/log', () => ({
  log: { error: mockLogError, info: mockLogInfo, warn: vi.fn(), debug: vi.fn() },
}))

const ORIGINAL_ENV = { ...process.env }

async function importRouteFresh() {
  vi.resetModules()
  return import('../route')
}

function makeRequest(body = '{}', signature = 'sig-ok'): Request {
  return new Request('http://localhost/api/cron/reap', {
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
  delete process.env.HEALTHCHECK_REAP_URL
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('POST /api/cron/reap', () => {
  it('returns 503 when QSTASH_CURRENT_SIGNING_KEY is unset', async () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    expect(mockLogError).toHaveBeenCalledWith(
      'cron.misconfigured',
      expect.objectContaining({ subsystem: 'cron' }),
    )
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
  })

  it('returns 200 with reaped count when signature verifies and RPC succeeds', async () => {
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: 3, error: null })
    const { POST } = await importRouteFresh()
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ reaped: 3 })
    expect(mockRpc).toHaveBeenCalledWith('reap_stuck_processing')
  })

  it('pings Healthchecks when HEALTHCHECK_REAP_URL is set and skips when not', async () => {
    process.env.HEALTHCHECK_REAP_URL = 'https://hc-ping.test/abc'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: 0, error: null })
    const { POST } = await importRouteFresh()
    await POST(makeRequest())
    expect(fetchSpy).toHaveBeenCalledWith('https://hc-ping.test/abc', { method: 'POST' })

    fetchSpy.mockClear()
    delete process.env.HEALTHCHECK_REAP_URL
    mockVerify.mockResolvedValueOnce(true)
    mockRpc.mockResolvedValueOnce({ data: 0, error: null })
    const fresh = await importRouteFresh()
    await fresh.POST(makeRequest())
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })
})
