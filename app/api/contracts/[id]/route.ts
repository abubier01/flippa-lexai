import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consumeRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit'
import { log } from '@/lib/log'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await consumeRateLimit({
    action: 'contract-delete',
    userId: user.id,
    // Anti-abuse flat-limit action — tier doesn't affect the cap.
    // Pass 'free' as a sentinel; the limit is the same across all tiers.
    tier: 'free',
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many delete requests', limitReached: true },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  // RLS policy contracts_delete_own restricts to user_id = auth.uid().
  // The explicit .eq('user_id', user.id) is belt-and-suspenders.
  // contract_analyses + chat_messages cascade via FK.
  const { error, count } = await supabase
    .from('contracts')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    log.error('contract delete failed', { err: error, subsystem: 'supabase', op: 'contracts.delete' })
    return NextResponse.json({ error: 'Failed to delete contract' }, { status: 500 })
  }

  // IMPORTANT: verify supabase-js v2 returns `count: number` (not `null`) for
  // DELETE with `{ count: 'exact' }` when RLS filters all matching rows. In
  // some versions/configs, DELETE without an explicit `Prefer: count=exact`
  // header may return `count: null`. If null, the 404 branch never fires and
  // RLS-blocked deletes silently 200.
  //
  // A one-off integration test should POST a DELETE for another user's contract
  // ID and assert `count === 0` (not `null`). If the test shows `null`, switch
  // to a SELECT-then-DELETE pattern:
  //   const { data: existing } = await supabase.from('contracts')
  //     .select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  //   if (!existing) return 404
  //   then perform the delete
  if (count === 0 || count === null) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  // NOTE: contracts_this_month is intentionally NOT decremented on delete.
  // Quota is "analyses initiated," not "contracts retained." Keeps billing
  // integrity simple and prevents users from clearing the counter by repeatedly
  // uploading+deleting.

  return NextResponse.json({ success: true })
}
