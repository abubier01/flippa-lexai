import { describe, it, expect, afterEach } from 'vitest'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from './helpers/supabase-int'

describe('P0-3 reap_stuck_processing RPC', () => {
  const cleanup: string[] = []
  afterEach(async () => {
    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  it('flips rows older than 10 min to failed, leaves fresh rows alone, returns reaped count', async () => {
    const u = await createTestUser()
    cleanup.push(u.id)
    const admin = makeServiceRoleClient()

    const eleven = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const four = new Date(Date.now() - 4 * 60 * 1000).toISOString()

    const seed = await admin.from('contracts').insert([
      { user_id: u.id, status: 'processing', processing_started_at: eleven, raw_text: 'stale', title: 'stale c', file_name: 's.txt' },
      { user_id: u.id, status: 'processing', processing_started_at: four, raw_text: 'fresh', title: 'fresh c', file_name: 'f.txt' },
      { user_id: u.id, status: 'completed', processing_started_at: eleven, raw_text: 'done', title: 'done c', file_name: 'd.txt' },
    ]).select('id, raw_text')
    expect(seed.error).toBeNull()

    const { data: reaped, error } = await admin.rpc('reap_stuck_processing')
    expect(error).toBeNull()
    expect(reaped).toBe(1)

    const rows = await admin
      .from('contracts')
      .select('raw_text, status, processing_started_at, updated_at')
      .in('id', seed.data!.map((r: { id: string }) => r.id))
    const byText = Object.fromEntries(rows.data!.map((r: { raw_text: string }) => [r.raw_text, r]))
    expect(byText.stale.status).toBe('failed')
    expect(byText.stale.processing_started_at).toBeNull()
    expect(byText.fresh.status).toBe('processing')
    expect(byText.done.status).toBe('completed')
  })
})
