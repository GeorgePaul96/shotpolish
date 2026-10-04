import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Slim top bar for museum pages (landing, builder, manage). */
export function MuseumHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="mu-header">
      <Link to="/museum" className="mu-wordmark">Museum of You</Link>
      {right}
    </header>
  )
}
