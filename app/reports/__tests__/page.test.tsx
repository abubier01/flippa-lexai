/**
 * Unit tests for app/reports/page.tsx (RSC).
 *
 * Strategy: mock the chart child component to capture the props the page passes
 * to it, mock the supabase server client via createSupabaseMock, then await the
 * page's default export and assert on the captured props + the recorded RPC
 * calls.
 *
 * Why we mock next/dynamic:
 *   - In production, next/dynamic returns a lazy wrapper. In a node test env
 *     `renderToStaticMarkup` would render the `loading` fallback (the loader
 *     promise resolves on a microtask, after sync render finishes).
 *   - The minimal mock below awaits the loader (which resolves to OUR mocked
 *     chart module via `vi.mock` above) and returns the resolved component
 *     directly. Then `renderToStaticMarkup(tree)` forces React to invoke the
 *     dynamic child, which triggers the prop-capture mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentType, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Capture chart props
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const capturedProps: any[] = []

vi.mock('@/components/reports/reports-charts', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    capturedProps.push(props)
    return null
  },
}))

// Minimal next/dynamic shim: synchronously await the loader on first call and
// cache the resolved component. Because the loader resolves to our mocked
// chart module (see vi.mock above), rendering the dynamic child triggers the
// prop-capture mock.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: <P,>(loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>) => {
    let Resolved: ComponentType<P> | null = null
    const ready = loader().then(mod => {
      Resolved = 'default' in mod ? mod.default : mod
    })
    const Dyn = (props: P) => {
      if (!Resolved) return null
      const C = Resolved
      return <C {...(props as P & object)} />
    }
    // Attach the ready promise so callers can await loader resolution.
    ;(Dyn as unknown as { __ready: Promise<void> }).__ready = ready
    return Dyn
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

const mockedCreateClient = vi.mocked(createClient)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type RpcConfig = Parameters<typeof createSupabaseMock>[0] extends infer T
  ? T extends { rpc?: infer R } ? R : never
  : never

async function renderPageWith(opts: { rpc: RpcConfig }) {
  const { client, calls } = createSupabaseMock({ rpc: opts.rpc })
  mockedCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)

  // Re-import the page after mocks are wired so module-level state is fresh.
  vi.resetModules()
  // Re-stub createClient on the fresh module instance.
  const freshServer = await import('@/lib/supabase/server')
  vi.mocked(freshServer.createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  )

  const PageModule = await import('@/app/reports/page')
  const tree = (await PageModule.default()) as ReactElement

  // Drain the next/dynamic loader microtask so the dynamic child resolves to
  // the mocked chart module before we render.
  await new Promise(resolve => setImmediate(resolve))

  // renderToStaticMarkup forces React to invoke the dynamic child, triggering
  // the prop-capture mock above.
  const html = renderToStaticMarkup(tree)

  return { calls, html }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  capturedProps.length = 0
  vi.clearAllMocks()
})

describe('ReportsPage (RSC)', () => {
  it('happy path: aggregates RPC data into chart props', async () => {
    const { calls } = await renderPageWith({
      rpc: {
        get_user_risk_distribution: {
          single: {
            data: [
              { severity: 'high', count: 2 },
              { severity: 'medium', count: 2 },
              { severity: 'low', count: 1 },
            ],
            error: null,
          },
        },
        get_user_monthly_contracts: {
          single: {
            data: [
              { month: '2026-01-01', count: 1 },
              { month: '2026-02-01', count: 2 },
              { month: '2026-03-01', count: 3 },
            ],
            error: null,
          },
        },
        // Single-row roll-up (PostgREST returns it as a one-element array).
        // total=3, 2 completed scored 80 + 20 → avg 50, highRisk 1, buckets 0-20=1 and 61-80=1.
        get_user_contract_score_summary: {
          single: {
            data: [{
              total: 3,
              completed_count: 2,
              high_risk_count: 1,
              avg_risk_score: 50,
              bucket_0_20: 1,
              bucket_21_40: 0,
              bucket_41_60: 0,
              bucket_61_80: 1,
              bucket_81_100: 0,
            }],
            error: null,
          },
        },
      },
    })

    // Exactly 3 RPCs, in the documented order.
    const rpcNames = calls.rpc.map(r => r.name)
    expect(rpcNames).toEqual([
      'get_user_risk_distribution',
      'get_user_monthly_contracts',
      'get_user_contract_score_summary',
    ])
    // No `contracts` table query — total now comes from the summary RPC.
    expect(calls.fromByTable.contracts ?? 0).toBe(0)

    const props = capturedProps[capturedProps.length - 1]
    expect(props).toBeDefined()

    // Total is sourced from the summary RPC, not a head-count select.
    expect(props.total).toBe(3)

    // Risk distribution with expected fills.
    expect(props.riskDistribution).toEqual([
      { name: 'High', value: 2, fill: 'var(--color-chart-4)' },
      { name: 'Medium', value: 2, fill: 'var(--color-chart-3)' },
      { name: 'Low', value: 1, fill: 'var(--color-chart-2)' },
    ])

    // Monthly data shape — 3 entries, 'short, 2-digit' format (e.g. "Jan 26").
    expect(props.monthlyData).toHaveLength(3)
    for (const entry of props.monthlyData) {
      // Format: "Mon YY" (3-letter month, space, 2-digit year)
      expect(entry.month).toMatch(/^[A-Z][a-z]{2} \d{2}$/)
      expect(typeof entry.count).toBe('number')
    }

    // Per-contract derived stats now passed straight through from the summary.
    expect(props.completed).toBe(2)
    expect(props.avgRisk).toBe(50)
    expect(props.highRisk).toBe(1)
    expect(props.riskBuckets).toEqual([
      { range: '0-20', count: 1 },
      { range: '21-40', count: 0 },
      { range: '41-60', count: 0 },
      { range: '61-80', count: 1 },
      { range: '81-100', count: 0 },
    ])
  })

  it('empty state: zero data produces zeroed aggregates', async () => {
    await renderPageWith({
      rpc: {
        get_user_risk_distribution: { single: { data: [], error: null } },
        get_user_monthly_contracts: { single: { data: [], error: null } },
        // The RPC still returns a one-row array when the user has no contracts;
        // mirror that here so the unwrap path is exercised.
        get_user_contract_score_summary: {
          single: {
            data: [{
              total: 0,
              completed_count: 0,
              high_risk_count: 0,
              avg_risk_score: 0,
              bucket_0_20: 0,
              bucket_21_40: 0,
              bucket_41_60: 0,
              bucket_61_80: 0,
              bucket_81_100: 0,
            }],
            error: null,
          },
        },
      },
    })

    const props = capturedProps[capturedProps.length - 1]
    expect(props).toBeDefined()
    expect(props.total).toBe(0)
    expect(props.completed).toBe(0)
    expect(props.avgRisk).toBe(0)
    expect(props.highRisk).toBe(0)
    expect(props.riskDistribution).toEqual([
      { name: 'High', value: 0, fill: 'var(--color-chart-4)' },
      { name: 'Medium', value: 0, fill: 'var(--color-chart-3)' },
      { name: 'Low', value: 0, fill: 'var(--color-chart-2)' },
    ])
    expect(props.monthlyData).toEqual([])
    expect(props.riskBuckets).toEqual([
      { range: '0-20', count: 0 },
      { range: '21-40', count: 0 },
      { range: '41-60', count: 0 },
      { range: '61-80', count: 0 },
      { range: '81-100', count: 0 },
    ])
  })

  it('passes summary-row scalars straight through to chart props', async () => {
    // The TS `computed ?? stored ?? 0` fallback now lives in SQL — the page
    // just forwards whatever the summary RPC returns. Asserting on a unique,
    // non-trivial row proves nothing is being recomputed in JS.
    await renderPageWith({
      rpc: {
        get_user_risk_distribution: { single: { data: [], error: null } },
        get_user_monthly_contracts: { single: { data: [], error: null } },
        get_user_contract_score_summary: {
          single: {
            data: [{
              total: 1,
              completed_count: 1,
              high_risk_count: 0,
              avg_risk_score: 42,
              bucket_0_20: 0,
              bucket_21_40: 0,
              bucket_41_60: 1,
              bucket_61_80: 0,
              bucket_81_100: 0,
            }],
            error: null,
          },
        },
      },
    })

    const props = capturedProps[capturedProps.length - 1]
    expect(props.total).toBe(1)
    expect(props.completed).toBe(1)
    expect(props.avgRisk).toBe(42)
    expect(props.highRisk).toBe(0)
    expect(props.riskBuckets).toEqual([
      { range: '0-20', count: 0 },
      { range: '21-40', count: 0 },
      { range: '41-60', count: 1 },
      { range: '61-80', count: 0 },
      { range: '81-100', count: 0 },
    ])
  })

  it('renders an error banner when a reports RPC fails', async () => {
    const { html } = await renderPageWith({
      rpc: {
        get_user_risk_distribution: {
          single: { data: null, error: { message: 'function does not exist' } },
        },
        get_user_monthly_contracts: { single: { data: [], error: null } },
        get_user_contract_score_summary: {
          single: {
            data: [{
              total: 0,
              completed_count: 0,
              high_risk_count: 0,
              avg_risk_score: 0,
              bucket_0_20: 0,
              bucket_21_40: 0,
              bucket_41_60: 0,
              bucket_61_80: 0,
              bucket_81_100: 0,
            }],
            error: null,
          },
        },
      },
    })

    expect(html).toContain('Some report metrics are currently unavailable')
  })
})
