// Public, unauthenticated build-info endpoint.
//
// Used by scripts/_checks/post-deploy-verify.sh (check #6) to confirm the
// deployed bundle's GIT_SHA matches what the deploy lead expected to ship.
//
// Returns nothing sensitive — only the git SHA the build was tagged with
// (or null in local dev) plus a server-generated timestamp.
//
// Do NOT add auth here: the verifier needs to call it before flipping
// ANALYSIS_ENABLED, and any auth dependency would couple build-verification
// to the auth stack we may be debugging.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    ok: true,
    sha: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
  })
}
