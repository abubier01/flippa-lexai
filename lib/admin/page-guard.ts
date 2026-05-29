// lib/admin/page-guard.ts
//
// Server-component guard for /admin/personas/** pages. Mirrors the API-route
// guard in lib/admin/guard.ts: requires an authenticated user whose
// public.profiles.is_platform_admin = true. Page guard redirects rather than
// returning a NextResponse.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-role-core'

export interface PlatformAdminPageContext {
  userId: string
}

export async function requirePlatformAdminPage(
  loginNext: string = '/admin/personas',
): Promise<PlatformAdminPageContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(loginNext)}`)
  }

  // Use the service role here for parity with the API guard's intent (the
  // user's own profile row IS readable under RLS, but going through service
  // role avoids RLS round-trips and matches the lib/persona/repo conventions).
  const svc = getServiceClient()
  const { data, error } = await svc
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data?.is_platform_admin) {
    redirect('/admin/personas/forbidden')
  }

  return { userId: user.id }
}
