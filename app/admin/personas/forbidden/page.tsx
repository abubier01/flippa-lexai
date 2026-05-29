// Forbidden page for /admin/personas — the redirect target used by
// requirePlatformAdminPage when a signed-in user lacks is_platform_admin.

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground">
        Persona administration is restricted to LexAI platform staff.
      </p>
      <Link href="/" className="text-sm text-primary underline">
        Return home
      </Link>
    </div>
  )
}
