import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Events } from '../../lib/analytics'
import { canvasToBlob } from '../../lib/museum/image'
import { renderShareCard } from '../../lib/museum/shareCard'
import type { ViewerMode } from './MuseumViewer'

interface GiftShopProps {
  recipientName: string
  portrait: HTMLCanvasElement
  branded: boolean
  mode: ViewerMode
  onAgain: () => void
  onClose?: () => void
}

/** The exit: the shareable Masterpiece card and the "build one back" loop. */
export function GiftShop({ recipientName, portrait, branded, mode, onAgain, onClose }: GiftShopProps) {
  const [card, setCard] = useState<{ url: string; file: File } | null>(null)
  const [failed, setFailed] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { cardRef.current?.focus() }, [])

  useEffect(() => {
    let url = ''
    let cancelled = false
    renderShareCard(portrait, portrait.width, portrait.height, recipientName, branded)
      .then((c) => canvasToBlob(c, 0.9))
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setCard({ url, file: new File([blob], 'museum-masterpiece.jpg', { type: 'image/jpeg' }) })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [portrait, recipientName, branded])

  const canShare = !!card && typeof navigator.canShare === 'function' && navigator.canShare({ files: [card.file] })

  const share = async () => {
    if (!card) return
    try {
      await navigator.share({ files: [card.file], title: 'The Masterpiece' })
      Events.museumCardShared('share')
    } catch {
      // Share sheet dismissed.
    }
  }

  const note = mode === 'live'
    ? 'Post it or keep it. You are in the permanent collection now.'
    : `This is the card ${recipientName} can save or post.`

  return (
    <div className="mu-sheet" role="dialog" aria-modal="true" aria-labelledby="mu-gs-title">
      <div className="mu-sheet-card" ref={cardRef} tabIndex={-1}>
        <p className="mu-eyebrow">Exit through the gift shop</p>
        <h2 id="mu-gs-title">The museum was about {recipientName} all along.</h2>
        {card ? (
          <img src={card.url} alt={`${recipientName} framed in gold above a plaque reading The Masterpiece`} />
        ) : (
          <div className="mu-card-placeholder">{failed ? 'The card couldn’t be made on this device.' : 'Framing your card…'}</div>
        )}
        <p className="mu-note">{note}</p>
        {card ? (
          <div className="mu-actions">
            {canShare ? <button type="button" className="mu-btn-gold" onClick={share}>Share</button> : null}
            <a className={canShare ? 'mu-btn-ghost' : 'mu-btn-gold'} href={card.url} download="museum-masterpiece.jpg" onClick={() => Events.museumCardShared('save')}>
              Save image
            </a>
          </div>
        ) : null}
        <div className="mu-actions">
          {mode === 'preview' ? (
            <button type="button" className="mu-btn-ghost" onClick={onClose}>Back to editing</button>
          ) : (
            <Link className="mu-btn-ghost" to="/museum/new" onClick={() => Events.museumBuildOwnClicked(mode)}>Build a museum for someone</Link>
          )}
          <button type="button" className="mu-btn-ghost" onClick={onAgain}>Walk through again</button>
        </div>
      </div>
    </div>
  )
}
