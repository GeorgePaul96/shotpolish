import type { ReactNode } from 'react'

interface PlaqueProps {
  label: string
  title: string
  meta?: string | null
  medium?: string | null
  children?: ReactNode
}

/** The paper label beside every frame. Title is user-written, so it wraps anywhere. */
export function Plaque({ label, title, meta, medium, children }: PlaqueProps) {
  return (
    <div className="mu-plaque">
      <p className="mu-pl-no">{label}</p>
      <h2 className="mu-pl-title">{title}</h2>
      {meta ? <p className="mu-pl-meta">{meta}</p> : null}
      {medium ? <p className="mu-pl-medium">{medium}</p> : null}
      {children}
    </div>
  )
}

export const exhibitMeta = (place: string | null, year: string | null) => [place, year].filter(Boolean).join(', ') || null
export const exhibitMedium = (medium: string | null) => (medium ? `Medium: ${medium}` : null)
