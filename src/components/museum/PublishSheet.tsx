import { useRef, useState } from 'react'
import { Events } from '../../lib/analytics'
import {
  NOT_ENABLED_MESSAGE, createMuseum, publishMuseum, publishingEnabled, uploadPhotos, type CreatedMuseum,
} from '../../lib/museum/api'
import { clearDraft, rememberMuseum } from '../../lib/museum/draftStore'
import { FREE_DAYS, FREE_EXHIBITS, MAX_EXHIBITS, PRICE_LABEL, requiredTier, type MuseumDraft, type Tier } from '../../lib/museum/rules'

interface PublishSheetProps {
  draft: MuseumDraft
  onClose: () => void
  onPublished: (slug: string) => void
}

type Phase = 'choose' | 'working' | 'error'

/**
 * "Open the museum": pick free or full, then create the museum, upload the
 * photos, and open it (free) or hand off to Stripe Checkout (full). A failed
 * attempt keeps the created museum so a retry only redoes what's left.
 */
export function PublishSheet({ draft, onClose, onPublished }: PublishSheetProps) {
  const [phase, setPhase] = useState<Phase>('choose')
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastTier, setLastTier] = useState<Tier>('free')
  const created = useRef<CreatedMuseum | null>(null)
  const uploaded = useRef(false)
  const freeAllowed = requiredTier(draft.exhibits.length) === 'free'

  const run = async (tier: Tier) => {
    setLastTier(tier)
    Events.museumPublishClicked(tier)
    setPhase('working')
    setError(null)
    try {
      if (!created.current) {
        setStep('Creating your museum…')
        created.current = await createMuseum(draft)
        rememberMuseum({ slug: created.current.slug, editKey: created.current.editKey, recipientName: draft.recipientName.trim(), createdAt: Date.now() })
      }
      const museum = created.current
      if (!uploaded.current) {
        const blobs = [...draft.exhibits.map((e) => e.photo as Blob), ...(draft.finalPhoto ? [draft.finalPhoto] : [])]
        setStep(`Hanging photos (0 of ${blobs.length})…`)
        await uploadPhotos(museum.uploads, blobs, (done, total) => setStep(`Hanging photos (${done} of ${total})…`))
        uploaded.current = true
      }
      setStep('Opening the doors…')
      const result = await publishMuseum(museum.slug, museum.editKey, tier)
      await clearDraft()
      if ('checkoutUrl' in result) {
        Events.museumCheckoutStarted()
        window.location.assign(result.checkoutUrl)
        return
      }
      Events.museumPublished(tier)
      onPublished(museum.slug)
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  return (
    <div className="mu-sheet" role="dialog" aria-modal="true" aria-labelledby="mu-publish-title">
      <div className="mu-sheet-card">
        <p className="mu-eyebrow">Opening night</p>
        <h2 id="mu-publish-title">Open the museum</h2>

        {phase === 'working' ? (
          <div className="mu-progress" role="status">
            <div className="mu-spinner" aria-hidden="true" />
            <p className="mu-note">{step}</p>
          </div>
        ) : (
          <>
            {!publishingEnabled ? <p className="mu-paynote">{NOT_ENABLED_MESSAGE}</p> : null}
            {phase === 'error' && error ? <p className="mu-error" role="alert">{error}</p> : null}
            <div className="mu-tiers">
              {freeAllowed ? (
                <button type="button" className="mu-tier" disabled={!publishingEnabled} onClick={() => run('free')}>
                  <span className="mu-tier-name">Free</span>
                  <span className="mu-tier-detail">Open for {FREE_DAYS} days. Up to {FREE_EXHIBITS} exhibits. Their share card carries a small Museum of You badge.</span>
                </button>
              ) : null}
              <button type="button" className="mu-tier mu-tier-full" disabled={!publishingEnabled} onClick={() => run('full')}>
                <span className="mu-tier-name">{PRICE_LABEL}, paid once</span>
                <span className="mu-tier-detail">Open forever. Up to {MAX_EXHIBITS} exhibits. No badge. Secure checkout by Stripe.</span>
              </button>
            </div>
            {!freeAllowed ? (
              <p className="mu-note">Your museum has {draft.exhibits.length} exhibits. Free museums hold up to {FREE_EXHIBITS}.</p>
            ) : null}
            <div className="mu-actions">
              {phase === 'error' ? <button type="button" className="mu-btn-gold" onClick={() => run(lastTier)}>Try again</button> : null}
              <button type="button" className="mu-btn-ghost" onClick={onClose}>Keep editing</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
