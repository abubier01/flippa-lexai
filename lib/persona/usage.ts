// lib/persona/usage.ts
//
// Helpers for counting analysis_runs that referenced a given persona version.
// Used by the admin persona detail and version-history pages.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Count analysis_runs that used `personaVersionId` within the last `days`
 * days. Returns 0 if no rows match. Errors propagate.
 */
export async function getUsageCount(
  client: SupabaseClient,
  personaVersionId: string,
  days: number,
): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await client
    .from('analysis_runs')
    .select('id', { count: 'exact', head: true })
    .eq('persona_version_id', personaVersionId)
    .gte('created_at', since)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * Lifetime usage count for a persona version (no date window).
 */
export async function getLifetimeUsageCount(
  client: SupabaseClient,
  personaVersionId: string,
): Promise<number> {
  const { count, error } = await client
    .from('analysis_runs')
    .select('id', { count: 'exact', head: true })
    .eq('persona_version_id', personaVersionId)
  if (error) throw new Error(error.message)
  return count ?? 0
}
