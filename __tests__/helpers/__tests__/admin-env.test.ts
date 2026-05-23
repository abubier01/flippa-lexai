import { describe, it, expect, afterEach } from 'vitest'
import { stubAdminEnv, restoreAdminEnv } from '../admin-env'

afterEach(() => restoreAdminEnv())

describe('admin-env helper', () => {
  it('stubs ADMIN_API_KEY', () => {
    stubAdminEnv({ ADMIN_API_KEY: 'secret123' })
    expect(process.env.ADMIN_API_KEY).toBe('secret123')
  })

  it('stubs ADMIN_EMAIL_ALLOWLIST and NODE_ENV together', () => {
    stubAdminEnv({ ADMIN_EMAIL_ALLOWLIST: 'a@x.com, B@x.com', NODE_ENV: 'production' })
    expect(process.env.ADMIN_EMAIL_ALLOWLIST).toBe('a@x.com, B@x.com')
    expect(process.env.NODE_ENV).toBe('production')
  })

  it('restoreAdminEnv removes the stubs', () => {
    stubAdminEnv({ ADMIN_API_KEY: 'x' })
    restoreAdminEnv()
    expect(process.env.ADMIN_API_KEY).toBeUndefined()
  })
})
