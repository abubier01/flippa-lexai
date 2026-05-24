import 'server-only'

import { log } from '@/lib/log'

/**
 * Run a SQL statement via the Supabase Management API.
 * Use only for DDL or other ops the JS client can't perform.
 * Caller is responsible for SQL injection safety — do not pass user input.
 *
 * Auth: bearer token resolved in this preference order:
 *   1. SUPABASE_ACCESS_TOKEN (Personal Access Token — what the Management
 *      API expects per Supabase docs)
 *   2. SUPABASE_SERVICE_ROLE_KEY (backward-compatible fallback; emits a
 *      warn-level log when used)
 *
 * Endpoint: https://api.supabase.com/v1/projects/{project_ref}/database/query
 * The project ref is the subdomain of NEXT_PUBLIC_SUPABASE_URL.
 *
 * @param sql       — SQL statement(s) to execute
 * @param fetchImpl — fetch implementation (DI for tests); defaults to globalThis.fetch
 */
export type ExecuteAdminSqlResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status: number }

export async function executeAdminSql(
  sql: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<ExecuteAdminSqlResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!supabaseUrl) {
    return {
      ok: false,
      error: 'NEXT_PUBLIC_SUPABASE_URL is not configured',
      status: 500,
    }
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  let bearer: string
  if (accessToken) {
    bearer = accessToken
  } else if (serviceRoleKey) {
    log.warn(
      '[admin-db] Using SUPABASE_SERVICE_ROLE_KEY as Management API bearer; SUPABASE_ACCESS_TOKEN preferred per Supabase docs.',
    )
    bearer = serviceRoleKey
  } else {
    return {
      ok: false,
      error:
        'missing bearer token (set SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY)',
      status: 500,
    }
  }

  const projectRef = supabaseUrl
    .replace('https://', '')
    .replace('.supabase.co', '')
    .split('.')[0]

  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ query: sql }),
    })
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 500,
    }
  }

  const text = await res.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // leave data as raw text
  }

  if (!res.ok) {
    return {
      ok: false,
      error: typeof data === 'string' ? data : JSON.stringify(data),
      status: res.status,
    }
  }

  return { ok: true, data }
}
