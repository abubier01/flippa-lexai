import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/components/contracts/contract-row-actions', () => ({
  default: () => null,
}))

const mockedCreateClient = vi.mocked(createClient)

async function renderPage() {
  const { client } = createSupabaseMock({
    tables: {
      contracts: {
        select: {
          data: [
            {
              id: 'c1',
              title: 'Completed Contract',
              created_at: new Date().toISOString(),
              file_name: 'completed.pdf',
              status: 'completed',
              risk_score: 82,
            },
            {
              id: 'c2',
              title: 'Pending Contract',
              created_at: new Date().toISOString(),
              file_name: 'pending.pdf',
              status: 'pending',
              risk_score: 0,
            },
            {
              id: 'c3',
              title: 'Failed Contract',
              created_at: new Date().toISOString(),
              file_name: 'failed.pdf',
              status: 'failed',
              risk_score: 0,
            },
          ],
          error: null,
          count: 3,
        },
      },
    },
  })

  mockedCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)

  vi.resetModules()
  const freshServer = await import('@/lib/supabase/server')
  vi.mocked(freshServer.createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  )

  const PageModule = await import('@/app/contracts/page')
  const tree = (await PageModule.default()) as ReactElement
  return renderToStaticMarkup(tree)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ContractsPage', () => {
  it('shows explicit score states for completed, pending, and failed contracts', async () => {
    const html = await renderPage()

    expect(html).toContain('Completed Contract')
    expect(html).toContain('>82<')
    expect(html).toContain('Pending Contract')
    expect(html).toContain('Analyzing')
    expect(html).toContain('Failed Contract')
    expect(html).toContain('Unavailable')
  })
})
