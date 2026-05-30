import { describe, it, expect } from 'vitest'
import { rejected, failed, success } from '../responses'

describe('responses', () => {
  it('rejected: code + http, includes legacy error alias', async () => {
    const r = rejected('RATE_LIMITED', 429, { scope: 'user', retry_after_seconds: 30 })
    expect(r.status).toBe(429)
    const body = await r.json()
    expect(body).toMatchObject({
      status: 'rejected',
      code: 'RATE_LIMITED',
      scope: 'user',
      retry_after_seconds: 30,
      error: 'RATE_LIMITED',
    })
  })

  it('rejected: forwards headers via init', async () => {
    const r = rejected('RATE_LIMITED', 429, {}, { headers: { 'Retry-After': '30' } })
    expect(r.headers.get('Retry-After')).toBe('30')
  })

  it('failed: maps to status=failed with error alias', async () => {
    const r = failed('MODEL_ERROR', 502, { analysis_run_id: 'run-1' })
    expect(r.status).toBe(502)
    const body = await r.json()
    expect(body).toMatchObject({
      status: 'failed',
      code: 'MODEL_ERROR',
      error: 'MODEL_ERROR',
      analysis_run_id: 'run-1',
    })
  })

  it('success: passes payload, 200', async () => {
    const r = success({ foo: 'bar' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ foo: 'bar' })
  })
})
