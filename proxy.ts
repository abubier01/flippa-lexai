import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === 'production' &&
    request.nextUrl.pathname.startsWith('/admin') &&
    process.env.ENABLE_ADMIN_ROUTES !== 'true'
  ) {
    return new NextResponse('Not Found', { status: 404 })
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
