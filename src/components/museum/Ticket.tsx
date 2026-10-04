import { useMemo, useState } from 'react'
import { prefersReducedMotion } from './useMuseumFonts'

interface TicketProps {
  recipientName: string
  curatorName: string | null
  roomCount: number
  onEnter: () => void
}

/** Stable six-digit "ticket number" so the same museum always prints the same ticket. */
function ticketNumber(name: string): string {
  let h = 2166136261
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return String((h >>> 0) % 1_000_000).padStart(6, '0')
}

export function Ticket({ recipientName, curatorName, roomCount, onEnter }: TicketProps) {
  const [leaving, setLeaving] = useState(false)
  const date = useMemo(() => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()), [])

  const enter = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onEnter, prefersReducedMotion() ? 0 : 650)
  }

  return (
    <div className={`mu-ticket-wrap${leaving ? ' is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mu-ticket-name">
      <div className="mu-ticket">
        <div className="mu-tk-stub" aria-hidden="true"><span>Admit one</span></div>
        <div className="mu-tk-main">
          <p className="mu-tk-eyebrow">The Museum of {recipientName} · Opening night</p>
          <h1 id="mu-ticket-name" className="mu-tk-name">{recipientName}</h1>
          <p className="mu-tk-by">{curatorName ? `A private exhibition curated by ${curatorName}` : 'A private exhibition'}</p>
          <div className="mu-tk-row">
            <span>No. {ticketNumber(recipientName)}</span>
            <span>{date}</span>
            <span>{roomCount} rooms</span>
          </div>
          <button type="button" className="mu-btn-gold" onClick={enter} autoFocus>Tap to enter</button>
        </div>
      </div>
    </div>
  )
}
