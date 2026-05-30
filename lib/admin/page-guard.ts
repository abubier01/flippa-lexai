// lib/admin/page-guard.ts
//
// Server-component guard for /admin/personas/** pages. Mirrors the API-route
// guard in lib/admin/guard.ts: requires an authenticated user whose
// public.profiles.is_platform_admin = true. Page guard redirects rather than
// returning a NextResponse.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data?.is_platform_admin) {
    redirect('/admin/personas/forbidden')
  }

  return { userId: user.id }
}
