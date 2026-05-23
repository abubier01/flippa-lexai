import { vi } from 'vitest'

type AdminEnv = Partial<{
  NODE_ENV: string
  ENABLE_ADMIN_ROUTES: string
  ADMIN_API_KEY: string
  ADMIN_EMAIL_ALLOWLIST: string
}>

export function stubAdminEnv(env: AdminEnv): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    vi.stubEnv(key, value)
  }
}

export function restoreAdminEnv(): void {
  vi.unstubAllEnvs()
}
