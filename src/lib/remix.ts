// Remix loop: the watermark on every free export carries a short, readable link
// back to the exact template that made it. A viewer types/clicks it, lands on
// /r/<id>, and is dropped into the editor with that style pre-applied — closing
// the viral loop. Pure helpers so they can be unit-tested and reused by both the
// canvas badge (display URL) and the router (internal path).

// Production host. Override per-env with VITE_PUBLIC_URL (e.g. https://shotpolish.app).
const RAW_BASE = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || 'https://shotpolish.app'

/** Bare host (no protocol, no trailing slash) — e.g. "shotpolish.app". */
export function remixHost(): string {
  return RAW_BASE.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

/**
 * Human-readable link baked into the watermark badge.
 * With a template id: "shotpolish.app/r/launch-indigo".
 * Without one (custom style): just the host, so the badge always carries a link.
 */
export function buildRemixUrl(templateId?: string): string {
  const host = remixHost()
  return templateId ? `${host}/r/${templateId}` : host
}

/** In-app destination the /r/:id route redirects to. */
export function remixPath(templateId: string): string {
  return `/editor?remix=${encodeURIComponent(templateId)}`
}
