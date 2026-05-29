// lib/admin/guard.ts
//
// Persona-admin guard for /api/admin/personas/* routes. Returns either the
// authenticated platform-admin's userId or a NextResponse the handler should
// return directly. Spec § Part 5 — gate every admin endpoint on
// public.profiles.is_platform_admin = true.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface PlatformAdminContext {
  userId: string
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext | NextResponse> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr || !profile?.is_platform_admin) {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 })
  }

  return { userId: user.id }
}
