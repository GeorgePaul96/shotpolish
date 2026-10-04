import { describe, it, expect } from 'vitest'
import {
  validateMuseumInput, randomBase62, generateSlug, generateEditKey, hashEditKey, keyMatches,
  isValidSlug, isValidEditKey, museumState, freeExpiry, canPublishFree, expectedPhotoPaths,
  mapMuseumPayment, FREE_EXHIBITS, MAX_EXHIBITS,
} from './museum'

const ex = (title = 'Lisbon') => ({ title })

describe('validateMuseumInput', () => {
  it('accepts and trims a minimal museum', () => {
    const r = validateMuseumInput({ recipientName: '  Sam  ', exhibits: [{ title: ' Night  train ', place: '', medium: 'rain' }], hasFinalPhoto: true })
    expect(r).toEqual({ ok: true, value: { recipientName: 'Sam', curatorName: null, hasFinalPhoto: true,
      exhibits: [{ title: 'Night train', place: null, year: null, medium: 'rain' }] } })
  })
  it('requires a recipient name', () => {
    expect(validateMuseumInput({ recipientName: ' ', exhibits: [ex()] })).toEqual({ ok: false, error: 'Add the name of the person this museum is for.' })
  })
  it('requires 1..MAX exhibits, each with a title', () => {
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [] }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: Array.from({ length: MAX_EXHIBITS + 1 }, () => ex()) }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [ex(''), ex()] })).toEqual({ ok: false, error: 'Exhibit 1 needs a title.' })
  })
  it('enforces text limits', () => {
    expect(validateMuseumInput({ recipientName: 'x'.repeat(41), exhibits: [ex()] }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [ex('x'.repeat(81))] }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [{ title: 'a', medium: 'm'.repeat(101) }] }).ok).toBe(false)
  })
  it('rejects non-objects', () => {
    expect(validateMuseumInput(null).ok).toBe(false)
    expect(validateMuseumInput('x').ok).toBe(false)
  })
})

describe('slugs and edit keys', () => {
  it('generates base62 strings of the right length', () => {
    expect(isValidSlug(generateSlug())).toBe(true)
    expect(isValidEditKey(generateEditKey())).toBe(true)
    expect(generateSlug()).not.toBe(generateSlug())
  })
  it('rejects bytes >= 248 to stay unbiased', () => {
    const bytes = [255, 249, 248, 0, 61, 62, 247]
    const rand = (n: number) => Uint8Array.from({ length: n }, (_, i) => bytes[i % bytes.length])
    expect(randomBase62(4, rand)).toBe('0z0z') // 0->'0', 61->'z', 62->'0', 247%62=61->'z'
  })
  it('validators reject bad shapes', () => {
    expect(isValidSlug('abc')).toBe(false)
    expect(isValidSlug('abcdefghi!')).toBe(false)
    expect(isValidEditKey(42)).toBe(false)
  })
  it('hashes keys to sha-256 hex and matches only the right key', async () => {
    const key = generateEditKey()
    const hash = await hashEditKey(key)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await keyMatches(hash, key)).toBe(true)
    expect(await keyMatches(hash, generateEditKey())).toBe(false)
  })
})

describe('museumState / expiry', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  it('draft until live', () => expect(museumState({ status: 'draft', expires_at: null }, now)).toBe('draft'))
  it('open while not expired or forever', () => {
    expect(museumState({ status: 'live', expires_at: null }, now)).toBe('open')
    expect(museumState({ status: 'live', expires_at: '2026-10-04T00:00:00Z' }, now)).toBe('open')
  })
  it('closed at or after expiry', () => expect(museumState({ status: 'live', expires_at: '2026-10-03T12:00:00Z' }, now)).toBe('closed'))
  it('free expiry is FREE_DAYS later', () => expect(freeExpiry(now)).toBe('2026-10-10T12:00:00.000Z'))
  it('free publishing only up to FREE_EXHIBITS', () => {
    expect(canPublishFree(FREE_EXHIBITS)).toBe(true)
    expect(canPublishFree(FREE_EXHIBITS + 1)).toBe(false)
  })
  it('expected photo paths', () => {
    expect(expectedPhotoPaths('m1', 2, true)).toEqual(['m1/0.jpg', 'm1/1.jpg', 'm1/final.jpg'])
    expect(expectedPhotoPaths('m1', 1, false)).toEqual(['m1/0.jpg'])
  })
})

describe('mapMuseumPayment', () => {
  const ev = (type: string, obj: Record<string, unknown>) => ({ id: 'evt', type, data: { object: obj } })
  it('maps a paid museum checkout', () => {
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', metadata: { kind: 'museum', museum_id: 'm1' } })))
      .toEqual({ museumId: 'm1', sessionId: 'cs_1' })
  })
  it('maps async payment success', () => {
    expect(mapMuseumPayment(ev('checkout.session.async_payment_succeeded', { id: 'cs_2', payment_status: 'paid', metadata: { kind: 'museum', museum_id: 'm2' } })))
      .toEqual({ museumId: 'm2', sessionId: 'cs_2' })
  })
  it('ignores unpaid, non-museum, and other events', () => {
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs', payment_status: 'unpaid', metadata: { kind: 'museum', museum_id: 'm' } }))).toBeNull()
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs', payment_status: 'paid', metadata: { plan: 'pro' } }))).toBeNull()
    expect(mapMuseumPayment(ev('customer.subscription.updated', { metadata: { kind: 'museum', museum_id: 'm' } }))).toBeNull()
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs', payment_status: 'paid', metadata: { kind: 'museum' } }))).toBeNull()
  })
})
