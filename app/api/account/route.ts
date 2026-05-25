import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-role'
import { consumeRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit'
import { log } from '@/lib/log'

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Aggressive rate limit — this endpoint is destructive and high-value to attackers.
  const rl = await consumeRateLimit({
    action: 'account-delete',
    userId: user.id,
    // Anti-abuse flat-limit action — tier doesn't affect the cap.
    // Pass 'free' as a sentinel; the limit is the same across all tiers.
    tier: 'free',
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many delete requests', limitReached: true },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  // Check for active paid subscription BEFORE reading the request body.
  // This way the user doesn't need to type their password just to hit a 409.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()
  if (profile?.plan && profile.plan !== 'free') {
    return NextResponse.json(
      {
        error: 'Cancel your subscription first.',
        plan: profile.plan,
        requiresPortal: true,
      },
      { status: 409 },
    )
  }

  const { password, confirmation } = await req.json()
  if (confirmation !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation phrase required.' }, { status: 400 })
  }

  // OAuth / passwordless users cannot re-auth via password.
  // OTP re-auth is deferred to a follow-up PR; for now return a clear error.
  const provider = user.app_metadata?.provider
  if (provider && provider !== 'email') {
    return NextResponse.json(
      {
        error:
          'Account deletion via OAuth is not yet supported. Please contact support.',
        oauthDeferred: true,
      },
      { status: 400 },
    )
  }

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required.' }, { status: 400 })
  }

  // Re-auth: verify the password by hitting Supabase's /auth/v1/token endpoint
  // DIRECTLY with fetch — do NOT use supabase.auth.signInWithPassword on the
  // server-bound client. That method rotates the active session cookie as a
  // side effect, which can leave the user in a half-deleted, half-rotated state
  // if any subsequent step fails.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const reauthRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ email: user.email, password }),
  })
  const reauthBody = await reauthRes.json().catch(() => ({}))
  if (!reauthRes.ok || reauthBody.error || !reauthBody.access_token) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }
  // Body is intentionally not assigned beyond this check — we don't want
  // the access_token or refresh_token persisted; they'd rotate the session
  // we're about to destroy.

  // Now perform the destructive admin call.
  const service = getServiceClient()
  const { error: deleteError } = await service.auth.admin.deleteUser(user.id)
  if (deleteError) {
    log.error('account delete failed', { err: deleteError, subsystem: 'supabase', op: 'account.delete' })
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  // Best-effort signout; cookies will be cleared client-side regardless.
  await supabase.auth.signOut().catch(() => {})

  return NextResponse.json({ success: true })
}
