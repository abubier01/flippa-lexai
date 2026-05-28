import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.INT_SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.INT_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.INT_SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'INT_SUPABASE_ANON_KEY and INT_SUPABASE_SERVICE_ROLE_KEY must be set. ' +
      'Run `npx supabase status` and copy the keys into .env.test.local, or export them in your shell.',
  )
}

export function makeServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function createTestUser(): Promise<{
  id: string
  email: string
  password: string
  userScopedClient: SupabaseClient
}> {
  const admin = makeServiceRoleClient()
  const email = `int-test-${randomUUID()}@example.test`
  const password = `pw-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`)

  return { id: data.user.id, email, password, userScopedClient: anon }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = makeServiceRoleClient()
  await admin.auth.admin.deleteUser(userId)
}
