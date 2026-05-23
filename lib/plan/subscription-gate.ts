export const SUBSCRIPTION_ENFORCEMENT_ENV = 'NEXT_PUBLIC_REQUIRE_SUBSCRIPTION'
export const SUBSCRIPTION_CACHE_COOKIE = 'lexai_subscription_gate'
export const SUBSCRIPTION_CACHE_TTL_SECONDS = 60

export function isSubscriptionEnforcementEnabled(): boolean {
  return process.env[SUBSCRIPTION_ENFORCEMENT_ENV] === 'true'
}

export function hasSubscribedAccess(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}
