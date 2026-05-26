import 'server-only'
import { requireAdminAccess } from '@/lib/security/admin-guard'

// Admin-only smoke test for the Sentry pipeline (capture → sourcemap → Slack).
// Throws on GET so an exception flows through the unhandled-error path. Gated
// behind the same admin guard as other /api/admin routes — non-admins get the
// guard's failure response (401/403/404/500 depending on configuration).
export async function GET(request: Request) {
  const denied = await requireAdminAccess(request)
  if (denied) return denied

  throw new Error('Sentry test route — intentional throw')
}

export const dynamic = 'force-dynamic'
