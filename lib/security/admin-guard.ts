import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function parseAllowlist(input: string | undefined): Set<string> {
  if (!input) return new Set()
  return new Set(
    input
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  )
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function validateAdminApiKey(request: Request): 'valid' | 'invalid' | 'missing' | 'not-configured' {
  const expectedApiKey = process.env.ADMIN_API_KEY?.trim()
  if (!expectedApiKey) return 'not-configured'

  const providedApiKey = request.headers.get('x-admin-key')?.trim() ?? ''
  if (!providedApiKey) return 'missing'

  return safeCompare(providedApiKey, expectedApiKey) ? 'valid' : 'invalid'
}

export async function requireAdminAccess(request: Request): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_ADMIN_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Admin routes are disabled.' }, { status: 404 })
  }

  const apiKeyValidation = validateAdminApiKey(request)
  if (apiKeyValidation === 'valid') {
    return null
  }
  if (apiKeyValidation === 'invalid') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowedEmails = parseAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST)
  if (allowedEmails.size === 0) {
    if (process.env.ADMIN_API_KEY?.trim() && apiKeyValidation === 'missing') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Admin access is not configured.' }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!allowedEmails.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}
