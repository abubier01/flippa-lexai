// Verifies the GIT_SHA fail-fast in lib/prompt/core.ts. The constant is
// evaluated at module load, so each scenario uses vi.resetModules + a fresh
// dynamic import.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const origNodeEnv = (process.env as Record<string, string | undefined>).NODE_ENV
const origGitSha = process.env.GIT_SHA
const origVercelSha = process.env.VERCEL_GIT_COMMIT_SHA

describe('lib/prompt/core — CORE_VERSION GIT_SHA fail-fast', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.VERCEL_GIT_COMMIT_SHA
  })

  afterEach(() => {
    // Restore env between tests so we don't pollute the rest of the suite.
    if (origNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV
    else (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv
    if (origGitSha === undefined) delete process.env.GIT_SHA
    else process.env.GIT_SHA = origGitSha
    if (origVercelSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA
    else process.env.VERCEL_GIT_COMMIT_SHA = origVercelSha
  })

  it('throws in production when neither GIT_SHA nor VERCEL_GIT_COMMIT_SHA is set', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.GIT_SHA
    await expect(import('../core')).rejects.toThrow(/GIT_SHA or VERCEL_GIT_COMMIT_SHA is required/)
  })

  it('uses GIT_SHA when present in production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.GIT_SHA = 'abc123'
    const mod = await import('../core')
    expect(mod.CORE_VERSION).toBe('abc123')
  })

  it('falls back to VERCEL_GIT_COMMIT_SHA in production when GIT_SHA is unset', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.GIT_SHA
    process.env.VERCEL_GIT_COMMIT_SHA = 'vercel-sha-xyz'
    const mod = await import('../core')
    expect(mod.CORE_VERSION).toBe('vercel-sha-xyz')
  })

  it("defaults to 'dev' when not production and neither sha is set", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test'
    delete process.env.GIT_SHA
    const mod = await import('../core')
    expect(mod.CORE_VERSION).toBe('dev')
  })
})
