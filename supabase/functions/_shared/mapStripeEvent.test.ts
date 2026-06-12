import { describe, it, expect } from 'vitest'
import { mapStripeEvent, type StripeEventLike } from './mapStripeEvent'

const checkout = (overrides: Record<string, any> = {}): StripeEventLike => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: { client_reference_id: 'user-123', customer: 'cus_1', metadata: { plan: 'pro' }, ...overrides } },
})

describe('mapStripeEvent', () => {
  it('checkout.session.completed with metadata.plan=pro maps to pro for the user', () => {
    expect(mapStripeEvent(checkout())).toEqual({ userId: 'user-123', stripeCustomerId: 'cus_1', plan: 'pro' })
  })

  it('checkout.session.completed with metadata.plan=ltd maps to ltd', () => {
    const e = checkout({ metadata: { plan: 'ltd' } })
    expect(mapStripeEvent(e)).toEqual({ userId: 'user-123', stripeCustomerId: 'cus_1', plan: 'ltd' })
  })

  it('checkout without client_reference_id returns null (no silent wrong write)', () => {
    const e = checkout({ client_reference_id: null })
    expect(mapStripeEvent(e)).toBeNull()
  })

  it('checkout without a valid metadata.plan returns null', () => {
    const e = checkout({ metadata: {} })
    expect(mapStripeEvent(e)).toBeNull()
  })

  it('customer.subscription.updated maps customer to pro with renewal date', () => {
    const e: StripeEventLike = {
      id: 'evt_2', type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_9', current_period_end: 1750000000 } },
    }
    expect(mapStripeEvent(e)).toEqual({
      stripeCustomerId: 'cus_9', plan: 'pro', planRenewsAt: new Date(1750000000 * 1000).toISOString(),
    })
  })

  it('customer.subscription.deleted maps customer to free and clears renewal', () => {
    const e: StripeEventLike = {
      id: 'evt_3', type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_9' } },
    }
    expect(mapStripeEvent(e)).toEqual({ stripeCustomerId: 'cus_9', plan: 'free', planRenewsAt: null })
  })

  it('unhandled event type returns null', () => {
    const e: StripeEventLike = { id: 'evt_4', type: 'invoice.paid', data: { object: {} } }
    expect(mapStripeEvent(e)).toBeNull()
  })
})
