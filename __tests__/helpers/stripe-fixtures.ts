import type Stripe from 'stripe'

 
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

 
function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base
  if (typeof base !== 'object' || base === null) return (override as T) ?? base
  if (Array.isArray(base)) return (override as T) ?? base
   
  const result: any = { ...(base as any) }
  for (const key of Object.keys(override)) {
     
    const o = (override as any)[key]
    if (o && typeof o === 'object' && !Array.isArray(o)) {
       
      result[key] = deepMerge((base as any)[key] ?? {}, o)
    } else if (o !== undefined) {
      result[key] = o
    }
  }
  return result as T
}

const NOW = 1_700_000_000
const PERIOD_END = NOW + 30 * 86_400

function baseSubscription(): Stripe.Subscription {
  return {
    id: 'sub_default',
    object: 'subscription',
    customer: 'cus_default',
    status: 'active',
    current_period_end: PERIOD_END,
    current_period_start: NOW,
    cancel_at_period_end: false,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_default',
          object: 'subscription_item',
          price: {
            id: 'price_pro_default',
            object: 'price',
          } as Stripe.Price,
          quantity: 1,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '',
    },
    metadata: {},
  } as unknown as Stripe.Subscription
}

export function buildCheckoutSessionCompleted(
  override?: DeepPartial<Stripe.CheckoutSessionCompletedEvent>,
): Stripe.CheckoutSessionCompletedEvent {
  const base: Stripe.CheckoutSessionCompletedEvent = {
    id: 'evt_checkout_default',
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_default',
        object: 'checkout.session',
        mode: 'subscription',
        client_reference_id: 'user-1',
        customer: 'cus_default',
        subscription: 'sub_default',
        metadata: { userId: 'user-1' },
      } as unknown as Stripe.Checkout.Session,
    },
  } as Stripe.CheckoutSessionCompletedEvent
  return deepMerge(base, override)
}

export function buildSubscriptionUpdated(
  override?: DeepPartial<Stripe.CustomerSubscriptionUpdatedEvent>,
): Stripe.CustomerSubscriptionUpdatedEvent {
  const base = {
    id: 'evt_sub_updated_default',
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'customer.subscription.updated',
    data: { object: baseSubscription() },
  } as unknown as Stripe.CustomerSubscriptionUpdatedEvent
  return deepMerge(base, override)
}

export function buildSubscriptionDeleted(
  override?: DeepPartial<Stripe.CustomerSubscriptionDeletedEvent>,
): Stripe.CustomerSubscriptionDeletedEvent {
  const sub = baseSubscription()
  ;(sub as unknown as Record<string, unknown>).status = 'canceled'
  const base = {
    id: 'evt_sub_deleted_default',
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'customer.subscription.deleted',
    data: { object: sub },
  } as unknown as Stripe.CustomerSubscriptionDeletedEvent
  return deepMerge(base, override)
}

function baseInvoice(): Stripe.Invoice {
  return {
    id: 'in_default',
    object: 'invoice',
    customer: 'cus_default',
    subscription: 'sub_default',
    period_end: PERIOD_END,
    period_start: NOW,
  } as unknown as Stripe.Invoice
}

export function buildInvoicePaymentFailed(
  override?: DeepPartial<Stripe.InvoicePaymentFailedEvent>,
): Stripe.InvoicePaymentFailedEvent {
  const base = {
    id: 'evt_invoice_failed_default',
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'invoice.payment_failed',
    data: { object: baseInvoice() },
  } as unknown as Stripe.InvoicePaymentFailedEvent
  return deepMerge(base, override)
}

export function buildInvoicePaymentSucceeded(
  override?: DeepPartial<Stripe.InvoicePaymentSucceededEvent>,
): Stripe.InvoicePaymentSucceededEvent {
  const base = {
    id: 'evt_invoice_succeeded_default',
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'invoice.payment_succeeded',
    data: { object: baseInvoice() },
  } as unknown as Stripe.InvoicePaymentSucceededEvent
  return deepMerge(base, override)
}
