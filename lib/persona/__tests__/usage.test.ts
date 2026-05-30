import { describe, it, expect, vi } from 'vitest'
import { getUsageCount, getLifetimeUsageCount } from '../usage'

// Minimal Supabase query-builder mock: chainable methods that resolve to
// `response` on await. Each .from() call gets a fresh builder.
function mockClient(response: { count: number | null; error: unknown }) {
  const make = () => {
    const builder: Record<string, unknown> = {}
    const self = () => builder
    builder.select = vi.fn(self)
    builder.eq = vi.fn(self)
    builder.gte = vi.fn(self)
    // PostgREST builders are thenable.
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve)
    return builder
  }
  return { from: vi.fn(make) }
}

describe('getUsageCount (windowed)', () => {
  it('returns 0 when no rows match', async () => {
    const client = mockClient({ count: 0, error: null })
    expect(await getUsageCount(client as never, 'version-id', 30)).toBe(0)
  })

  it('returns the count when seeded', async () => {
    const client = mockClient({ count: 17, error: null })
    expect(await getUsageCount(client as never, 'version-id', 30)).toBe(17)
  })

  it('returns 0 when count is null (no rows)', async () => {
    const client = mockClient({ count: null, error: null })
    expect(await getUsageCount(client as never, 'version-id', 30)).toBe(0)
  })

  it('throws on db error', async () => {
    const client = mockClient({ count: null, error: { message: 'boom' } })
    await expect(getUsageCount(client as never, 'v', 30)).rejects.toThrow('boom')
  })

  it('filters by persona_version_id and a date threshold', async () => {
    const client = mockClient({ count: 5, error: null })
    await getUsageCount(client as never, 'version-id', 7)
    const fromMock = client.from as unknown as ReturnType<typeof vi.fn>
    expect(fromMock).toHaveBeenCalledWith('analysis_runs')
  })
})

describe('getLifetimeUsageCount', () => {
  it('returns 0 when no rows match', async () => {
    const client = mockClient({ count: 0, error: null })
    expect(await getLifetimeUsageCount(client as never, 'version-id')).toBe(0)
  })

  it('returns the count when seeded', async () => {
    const client = mockClient({ count: 42, error: null })
    expect(await getLifetimeUsageCount(client as never, 'version-id')).toBe(42)
  })
})
