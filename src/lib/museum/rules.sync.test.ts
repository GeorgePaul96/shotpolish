// Client and edge bundles can't share an import, so the museum limits live in
// two files. This test fails the moment they drift apart.
import { describe, it, expect } from 'vitest'
import * as client from './rules'
import * as edge from '../../../supabase/functions/_shared/museum'

describe('museum rules stay in sync (client vs edge)', () => {
  it('limits and price match', () => {
    expect(client.FREE_EXHIBITS).toBe(edge.FREE_EXHIBITS)
    expect(client.MAX_EXHIBITS).toBe(edge.MAX_EXHIBITS)
    expect(client.FREE_DAYS).toBe(edge.FREE_DAYS)
    expect(client.PRICE_CENTS).toBe(edge.PRICE_CENTS)
    expect(client.LIMITS).toEqual(edge.LIMITS)
  })
})
