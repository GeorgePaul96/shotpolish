import { describe, it, expect } from 'vitest'
import { buildRemixUrl, remixHost, remixPath } from './remix'

describe('remix url helpers', () => {
  it('host strips protocol and trailing slash', () => {
    // Default (no VITE_PUBLIC_URL in test env) falls back to https://shotpolish.org
    expect(remixHost()).toBe('shotpolish.org')
  })

  it('builds a per-template remix url', () => {
    expect(buildRemixUrl('launch-indigo')).toBe('shotpolish.org/r/launch-indigo')
  })

  it('falls back to the bare host when there is no template', () => {
    expect(buildRemixUrl()).toBe('shotpolish.org')
  })

  it('builds the in-app redirect path and encodes the id', () => {
    expect(remixPath('launch-indigo')).toBe('/editor?remix=launch-indigo')
    expect(remixPath('a b')).toBe('/editor?remix=a%20b')
  })
})
