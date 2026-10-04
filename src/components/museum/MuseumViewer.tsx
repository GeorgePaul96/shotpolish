import './museum.css'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Events } from '../../lib/analytics'
import type { ViewerMuseum } from '../../lib/museum/api'
import { FinalRoom, type RevealSource } from './FinalRoom'
import { Gallery, type GalleryHandle } from './Gallery'
import { GiftShop } from './GiftShop'
import { Ticket } from './Ticket'
import { prefersReducedMotion, useMuseumFonts } from './useMuseumFonts'

export type ViewerMode = 'live' | 'preview' | 'example'

interface MuseumViewerProps {
  museum: ViewerMuseum
  mode: ViewerMode
  onClose?: () => void
}

/** iOS only reports device tilt after a user gesture grants it. Best-effort. */
function requestTiltPermission(): void {
  const DOE = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as
    | { requestPermission?: () => Promise<string> }
    | undefined
  DOE?.requestPermission?.().catch(() => undefined)
}

/** Full-screen museum: ticket, swipe-through rooms, the Masterpiece, the gift shop. */
export function MuseumViewer({ museum, mode, onClose }: MuseumViewerProps) {
  useMuseumFonts()
  const [entered, setEntered] = useState(false)
  const [portrait, setPortrait] = useState<HTMLCanvasElement | null>(null)
  const [giftOpen, setGiftOpen] = useState(false)
  const gallery = useRef<GalleryHandle>(null)
  const giftTimer = useRef(0)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      window.clearTimeout(giftTimer.current)
    }
  }, [])

  const enter = () => {
    setEntered(true)
    Events.museumEntered(mode)
    requestTiltPermission()
  }

  const reveal = (still: HTMLCanvasElement, source: RevealSource) => {
    setPortrait(still)
    Events.museumFinalReveal(source, mode)
    window.clearTimeout(giftTimer.current)
    giftTimer.current = window.setTimeout(() => setGiftOpen(true), prefersReducedMotion() ? 400 : 2800)
  }

  const walkAgain = () => {
    setGiftOpen(false)
    gallery.current?.goTo(0)
  }

  return (
    <div className="mu mu-viewer">
      <Gallery
        ref={gallery}
        museum={museum}
        entered={entered}
        keyboard={entered && !giftOpen}
        revealed={!!portrait}
        finalRoom={
          <FinalRoom
            recipientName={museum.recipientName}
            number={museum.exhibits.length + 1}
            finalPhotoUrl={museum.finalPhotoUrl}
            portrait={portrait}
            onReveal={reveal}
          />
        }
      />
      {mode !== 'live' ? (
        <div className="mu-float-top">
          {mode === 'example' ? (
            <span className="mu-ribbon">Example museum <Link to="/museum/new">Build your own</Link></span>
          ) : (
            <span className="mu-ribbon">Preview</span>
          )}
          {mode === 'preview' && onClose ? <button type="button" className="mu-close" onClick={onClose}>Close preview</button> : null}
        </div>
      ) : null}
      {!entered ? (
        <Ticket recipientName={museum.recipientName} curatorName={museum.curatorName} roomCount={museum.exhibits.length + 1} onEnter={enter} />
      ) : null}
      {giftOpen && portrait ? (
        <GiftShop recipientName={museum.recipientName} portrait={portrait} branded={museum.branded} mode={mode} onAgain={walkAgain} onClose={onClose} />
      ) : null}
    </div>
  )
}
