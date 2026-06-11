import { describe, it, expect, beforeEach } from 'vitest'
import { setPendingUpload, consumePendingUpload } from './pendingUpload'

// A minimal stand-in for File — we only need object identity, not real File APIs.
const fakeFile = (name: string) => ({ name }) as unknown as File

describe('pendingUpload', () => {
  beforeEach(() => { consumePendingUpload() }) // clear any leftover state

  it('returns null when nothing is pending', () => {
    expect(consumePendingUpload()).toBeNull()
  })

  it('returns the file once, then null', () => {
    const f = fakeFile('shot.png')
    setPendingUpload(f)
    expect(consumePendingUpload()).toBe(f)
    expect(consumePendingUpload()).toBeNull()
  })

  it('keeps only the most recent pending file', () => {
    const a = fakeFile('a.png')
    const b = fakeFile('b.png')
    setPendingUpload(a)
    setPendingUpload(b)
    expect(consumePendingUpload()).toBe(b)
  })
})
