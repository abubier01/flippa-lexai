import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { decideActivePlan, type SubscriptionRow } from '@/lib/plan/access-logic'
import {
  hasSubscribedAccess,
  isSubscriptionEnforcementEnabled,
  SUBSCRIPTION_CACHE_COOKIE,
  SUBSCRIPTION_CACHE_TTL_SECONDS,
} from '@/lib/plan/subscription-gate'

const authProtectedPaths = [
  '/dashboard',
  '/contracts',
  '/upload',
  '/reports',
  '/settings',
  '/team',
  '/upgrade',
  '/my-tickets',
  '/onboarding',
]

const subscriptionProtectedPagePaths = [
  '/dashboard',
  '/contracts',
  '/upload',
  '/reports',
  '/settings',
  '/team',
  '/upgrade',
  '/my-tickets',
]

const subscriptionBypassPaths = ['/onboarding/subscribe']

function pathMatches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname.startsWith(prefix))
}

function readCachedSubscriptionDecision(request: NextRequest, userId: string): boolean | null {
  const raw = request.cookies.get(SUBSCRIPTION_CACHE_COOKIE)?.value
  if (!raw) return null

  const [cachedUserId, result] = raw.split(':')
  if (cachedUserId !== userId) return null
  if (result === '1') return true
  if (result === '0') return false
  return null
}

function setCachedSubscriptionDecision(response: NextResponse, userId: string, allowed: boolean) {
  response.cookies.set(SUBSCRIPTION_CACHE_COOKIE, `${userId}:${allowed ? '1' : '0'}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SUBSCRIPTION_CACHE_TTL_SECONDS,
  })
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.redirect(url)
}

async function checkSubscription(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<{ allowed: boolean; ok: boolean }> {
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[middleware] subscription query failed:', userId, error.message)
    return { allowed: false, ok: false }
  }

  const sub = (subs?.[0] ?? null) as SubscriptionRow | null
  const active = decideActivePlan(sub)
  return { allowed: hasSubscribedAccess(active.status), ok: true }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthProtected = pathMatches(pathname, authProtectedPaths)

  if (isAuthProtected && !user) {
    return redirectTo(request, '/auth/login')
  }

  if (user && (pathname === '/auth/login' || pathname === '/auth/sign-up')) {
    return redirectTo(request, '/dashboard')
  }

  if (!user || !isSubscriptionEnforcementEnabled()) {
    return supabaseResponse
  }

  const isSubscriptionBypass = pathMatches(pathname, subscriptionBypassPaths)
  const isSubscriptionProtected = pathMatches(pathname, subscriptionProtectedPagePaths)

  if (!isSubscriptionProtected || isSubscriptionBypass) {
    return supabaseResponse
  }

  const cached = readCachedSubscriptionDecision(request, user.id)
  if (cached === true) {
    setCachedSubscriptionDecision(supabaseResponse, user.id, true)
    return supabaseResponse
  }
  if (cached === false) {
    const redirect = redirectTo(request, '/onboarding/subscribe')
    setCachedSubscriptionDecision(redirect, user.id, false)
    return redirect
  }

  const entitlement = await checkSubscription(supabase, user.id)
  if (!entitlement.ok || !entitlement.allowed) {
    const redirect = redirectTo(request, '/onboarding/subscribe')
    setCachedSubscriptionDecision(redirect, user.id, false)
    return redirect
  }

  setCachedSubscriptionDecision(supabaseResponse, user.id, true)
  return supabaseResponse
}
