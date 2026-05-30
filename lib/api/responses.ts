import { NextResponse } from 'next/server'

// Unified API response envelope.
//
// The analyze route uses { status: 'rejected' | 'failed', code } shapes; older
// routes use { error: string, limitReached?: boolean }. Until every UI consumer
// migrates, the helpers below emit BOTH so the legacy `error` field stays
// available as a deprecated alias for one release. See MIGRATION-NOTES.md for
// the tracker of unmigrated callsites.

export function rejected(
  code: string,
  http: number,
  extras: Record<string, unknown> = {},
  init?: ResponseInit,
) {
  return NextResponse.json(
    { status: 'rejected', code, error: code, ...extras },
    { status: http, ...init },
  )
}

export function failed(
  code: string,
  http: number,
  extras: Record<string, unknown> = {},
  init?: ResponseInit,
) {
  return NextResponse.json(
    { status: 'failed', code, error: code, ...extras },
    { status: http, ...init },
  )
}

export function success<T>(payload: T, init?: ResponseInit) {
  return NextResponse.json(payload, { status: 200, ...init })
}
