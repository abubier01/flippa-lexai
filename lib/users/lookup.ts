// lib/users/lookup.ts
//
// Server-side lookup of auth.users.email by id, batched. Used by admin pages
// that need to render "edited by <email>" for persona versions / drafts.
// Service role required.

import { getServiceClient } from '@/lib/supabase/service-role-core'

/**
 * Fetch emails for the given user ids. Returns a Map (id → email | null).
 * Missing users map to null instead of being omitted, so callers don't crash
 * on a deleted user reference.
 */
export async function getUserEmails(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return out

  const svc = getServiceClient()
  // Supabase JS exposes admin user lookup; do it one-by-one (Tier 1 calls this
  // for at most a handful of ids per page).
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data, error } = await svc.auth.admin.getUserById(id)
        out.set(id, error || !data?.user ? null : data.user.email ?? null)
      } catch {
        out.set(id, null)
      }
    }),
  )
  return out
}
