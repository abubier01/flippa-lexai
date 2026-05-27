import { describe, it, expect, afterEach } from 'vitest'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from './helpers/supabase-int'

describe('P0-1 chat_messages UPDATE RLS policy', () => {
  const cleanup: string[] = []
  afterEach(async () => {
    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  it('allows a user to update their own placeholder assistant message via the user-scoped client', async () => {
    const u = await createTestUser()
    cleanup.push(u.id)
    const admin = makeServiceRoleClient()

    // Seed: contract + empty assistant placeholder owned by the test user
    const { data: contract, error: cErr } = await admin
      .from('contracts')
      .insert({ user_id: u.id, status: 'completed', raw_text: 'x', title: 'test', file_name: 'test.pdf' })
      .select('id')
      .single()
    expect(cErr).toBeNull()

    const { data: placeholder, error: pErr } = await admin
      .from('chat_messages')
      .insert({
        contract_id: contract!.id,
        user_id: u.id,
        role: 'assistant',
        content: '',
      })
      .select('id')
      .single()
    expect(pErr).toBeNull()

    // Act: update via the user-scoped client (RLS active)
    const { data: updated, error: uErr } = await u.userScopedClient
      .from('chat_messages')
      .update({ content: 'final assistant reply' })
      .eq('id', placeholder!.id)
      .select('id')
    expect(uErr).toBeNull()
    expect(updated).toHaveLength(1)

    // Assert persisted
    const { data: reread } = await admin
      .from('chat_messages')
      .select('content')
      .eq('id', placeholder!.id)
      .single()
    expect(reread?.content).toBe('final assistant reply')
  })
})
