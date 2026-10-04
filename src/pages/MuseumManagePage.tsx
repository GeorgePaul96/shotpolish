import '../components/museum/museum.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MuseumHeader } from '../components/museum/MuseumHeader'
import { MuseumNotice, useDocumentTitle } from '../components/museum/MuseumNotice'
import { useMuseumFonts } from '../components/museum/useMuseumFonts'
import { Events } from '../lib/analytics'
import {
  deleteMuseum, getMuseum, manageUrl, museumUrl, publishMuseum, type GetMuseumResult, type OwnerInfo,
} from '../lib/museum/api'
import { findEditKey, forgetMuseum, rememberMuseum } from '../lib/museum/draftStore'
import { FREE_DAYS, FREE_EXHIBITS, PRICE_LABEL, daysLeft } from '../lib/museum/rules'

type Status = 'loading' | 'nokey' | 'ready' | 'missing' | 'error' | 'deleted'
type Owned = Exclude<GetMuseumResult, { state: 'missing' }> & { owner: OwnerInfo }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isOwned = (r: GetMuseumResult | null): r is Owned => !!r && r.state !== 'missing' && !!r.owner
const nameOf = (r: Owned) => (r.state === 'open' ? r.museum.recipientName : r.recipientName)

/** /museum/manage/:slug, where the creator shares, upgrades, or deletes. */
export function MuseumManagePage() {
  useMuseumFonts()
  useDocumentTitle('Your museum · Museum of You')
  const { slug = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const initialQuery = useRef(new URLSearchParams(location.search))
  const [key, setKey] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [museum, setMuseum] = useState<Owned | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState<'link' | 'manage' | null>(null)

  // The key comes from the private manage link (#k=...) or this device's list.
  useEffect(() => {
    const fromHash = /(?:^#|&)k=([0-9A-Za-z]{32})/.exec(window.location.hash)?.[1] ?? null
    const k = fromHash ?? findEditKey(slug)
    if (fromHash) {
      rememberMuseum({ slug, editKey: fromHash, recipientName: '', createdAt: Date.now() })
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
    setKey(k)
    if (!k) setStatus('nokey')
  }, [slug])

  const load = useCallback(async (k: string): Promise<GetMuseumResult | null> => {
    try {
      const r = await getMuseum(slug, k)
      if (isOwned(r)) {
        setMuseum(r)
        setStatus('ready')
        rememberMuseum({ slug, editKey: k, recipientName: nameOf(r), createdAt: Date.now() })
      } else {
        setStatus('missing')
      }
      return r
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
      return null
    }
  }, [slug])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const q = initialQuery.current
    const paid = q.get('paid') === '1'
    const canceled = q.get('canceled') === '1'
    const isNew = q.get('new') === '1'
    if (paid || canceled || isNew) navigate(location.pathname, { replace: true })
    void (async () => {
      const first = await load(key)
      if (cancelled) return
      if (isNew) setBanner('Your museum is open. Send them the link below.')
      if (canceled) setBanner('Payment canceled. Your museum is saved, and you can open it whenever you’re ready.')
      if (!paid) return
      const full = (r: GetMuseumResult | null) => isOwned(r) && r.owner.tier === 'full'
      if (full(first)) {
        setBanner('Payment received. Your museum is open forever.')
        Events.museumPaidConfirmed()
        return
      }
      setBanner('Payment received. Opening your museum…')
      const started = Date.now()
      while (!cancelled && Date.now() - started < 30_000) {
        await sleep(2000)
        if (cancelled) return
        if (full(await load(key))) {
          setBanner('Payment received. Your museum is open forever.')
          Events.museumPaidConfirmed()
          return
        }
      }
      if (!cancelled) setBanner('Payment received. It can take a minute to open. Refresh this page in a moment.')
    })()
    return () => { cancelled = true }
    // Runs once per key; the query is read from the first render on purpose,
    // so clearing it from the URL doesn't re-trigger this effect.
  }, [key, load])

  if (status === 'loading') return <MuseumNotice title="Loading your museum…" />
  if (status === 'nokey') {
    return (
      <MuseumNotice title="Open this on your device" body="Use the device you built the museum on, or your private manage link.">
        <Link className="mu-btn-gold" to="/museum/new">Build a new museum</Link>
      </MuseumNotice>
    )
  }
  if (status === 'missing') {
    return (
      <MuseumNotice title="We couldn’t find this museum" body="It may have been deleted, or this manage link is incomplete.">
        <Link className="mu-btn-gold" to="/museum/new">Build a new museum</Link>
      </MuseumNotice>
    )
  }
  if (status === 'deleted') {
    return (
      <MuseumNotice title="Deleted" body="The photos and plaques are gone, and the link no longer works.">
        <Link className="mu-btn-gold" to="/museum/new">Build a new museum</Link>
      </MuseumNotice>
    )
  }
  if (status === 'error' || !museum || !key) {
    return (
      <MuseumNotice title="Couldn’t load your museum" body={error ?? 'Check your connection and try again.'}>
        <button type="button" className="mu-btn-gold" onClick={() => { setStatus('loading'); if (key) void load(key) }}>Try again</button>
      </MuseumNotice>
    )
  }

  const name = nameOf(museum)
  const { owner } = museum
  const left = daysLeft(owner.expiresAt, new Date())
  const link = museumUrl(slug)
  const privateLink = manageUrl(slug, key)
  const isOpen = museum.state === 'open'
  const canOpenFree = museum.state === 'draft' && owner.exhibitCount <= FREE_EXHIBITS

  const title = isOpen
    ? owner.tier === 'full' ? 'Open forever' : `Open · closes in ${left} day${left === 1 ? '' : 's'}`
    : museum.state === 'closed' ? 'Closed' : 'Not open yet'
  const lede = isOpen
    ? 'Send them the link. They’ll get a ticket at the door.'
    : museum.state === 'closed'
      ? `Free museums close after ${FREE_DAYS} days. Reopen it for good and the same link works again.`
      : canOpenFree
        ? `Your museum is saved but not open yet. Open it free for ${FREE_DAYS} days, or forever for ${PRICE_LABEL}.`
        : 'Your museum is saved. Finish payment to open it.'

  const copy = async (text: string, which: 'link' | 'manage', inputId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      const el = document.getElementById(inputId) as HTMLInputElement | null
      el?.select()
    }
  }

  const shareLink = async () => {
    try {
      await navigator.share({ title: `The Museum of ${name}`, text: 'I made you something. Tap to enter.', url: link })
    } catch {
      // Share sheet dismissed.
    }
  }

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setActionError(null)
    try { await fn() } catch (err) { setActionError((err as Error).message) } finally { setBusy(false) }
  }

  const upgrade = () => act(async () => {
    Events.museumPublishClicked('full')
    const r = await publishMuseum(slug, key, 'full')
    if ('checkoutUrl' in r) {
      Events.museumCheckoutStarted()
      window.location.assign(r.checkoutUrl)
      return
    }
    await load(key)
  })

  const openFree = () => act(async () => {
    Events.museumPublishClicked('free')
    await publishMuseum(slug, key, 'free')
    Events.museumPublished('free')
    await load(key)
    setBanner('Your museum is open. Send them the link below.')
  })

  const remove = () => act(async () => {
    await deleteMuseum(slug, key)
    forgetMuseum(slug)
    setStatus('deleted')
  })

  return (
    <main className="mu mu-page">
      <MuseumHeader right={<Link to="/museum/new" className="mu-mini mu-mini-link">New museum</Link>} />
      <div className="mu-container">
        {banner ? <p className="mu-paynote" role="status">{banner}</p> : null}
        <div>
          <p className="mu-eyebrow">The Museum of {name}</p>
          <h1 className="mu-title">{title}</h1>
          <p className="mu-lede">{lede}</p>
        </div>
        {actionError ? <p className="mu-error" role="alert">{actionError}</p> : null}

        {isOpen ? (
          <section className="mu-section" aria-labelledby="mu-link">
            <h2 id="mu-link">Their link</h2>
            <div className="mu-input-row">
              <input id="mu-link-input" className="mu-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link to the museum" />
              <button type="button" className="mu-mini" onClick={() => copy(link, 'link', 'mu-link-input')}>{copied === 'link' ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="mu-actions">
              {typeof navigator.share === 'function' ? <button type="button" className="mu-btn-gold" onClick={shareLink}>Send the ticket</button> : null}
              <a className="mu-btn-ghost" href={`/m/${slug}`} target="_blank" rel="noreferrer">Walk through it yourself</a>
            </div>
          </section>
        ) : null}

        {owner.tier === 'free' ? (
          <section className="mu-section" aria-labelledby="mu-forever">
            <h2 id="mu-forever">{isOpen ? 'Keep it open forever' : 'Open the museum'}</h2>
            <p className="mu-hint-text">{PRICE_LABEL}, paid once. The link never closes, and their share card has no badge.</p>
            <div className="mu-actions">
              <button type="button" className="mu-btn-gold" disabled={busy} onClick={upgrade}>Open forever for {PRICE_LABEL}</button>
              {canOpenFree ? <button type="button" className="mu-btn-ghost" disabled={busy} onClick={openFree}>Open free for {FREE_DAYS} days</button> : null}
            </div>
          </section>
        ) : null}

        <section className="mu-section" aria-labelledby="mu-private">
          <h2 id="mu-private">Your private manage link</h2>
          <p className="mu-hint-text">Keep this link private. It lets you manage or delete the museum from any device.</p>
          <div className="mu-input-row">
            <input id="mu-private-input" className="mu-input" readOnly value={privateLink} onFocus={(e) => e.currentTarget.select()} aria-label="Private manage link" />
            <button type="button" className="mu-mini" onClick={() => copy(privateLink, 'manage', 'mu-private-input')}>{copied === 'manage' ? 'Copied' : 'Copy'}</button>
          </div>
        </section>

        <section className="mu-section" aria-labelledby="mu-delete">
          <h2 id="mu-delete">Delete museum</h2>
          <p className="mu-hint-text">Removes the photos and plaques for good. The link stops working.</p>
          {confirmDelete ? (
            <div className="mu-actions">
              <button type="button" className="mu-btn-danger" disabled={busy} onClick={remove}>Delete forever</button>
              <button type="button" className="mu-btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          ) : (
            <div><button type="button" className="mu-btn-ghost" onClick={() => setConfirmDelete(true)}>Delete museum</button></div>
          )}
        </section>
      </div>
    </main>
  )
}
