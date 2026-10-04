import '../components/museum/museum.css'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExhibitEditor, useBlobUrl } from '../components/museum/ExhibitEditor'
import { MuseumHeader } from '../components/museum/MuseumHeader'
import { useDocumentTitle } from '../components/museum/MuseumNotice'
import { MuseumViewer } from '../components/museum/MuseumViewer'
import { PublishSheet } from '../components/museum/PublishSheet'
import { useMuseumFonts } from '../components/museum/useMuseumFonts'
import { Events } from '../lib/analytics'
import type { ViewerMuseum } from '../lib/museum/api'
import { loadDraft, saveDraft } from '../lib/museum/draftStore'
import { prepareImage } from '../lib/museum/image'
import {
  FREE_EXHIBITS, LIMITS, MAX_EXHIBITS, PRICE_LABEL, draftProblems, emptyDraft, newExhibit, requiredTier,
  type DraftExhibit, type MuseumDraft,
} from '../lib/museum/rules'

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Builds the viewer shape from local Blobs; URLs live only while the preview is open. */
function DraftPreview({ draft, onClose }: { draft: MuseumDraft; onClose: () => void }) {
  const [museum, setMuseum] = useState<ViewerMuseum | null>(null)
  useEffect(() => {
    const urls: string[] = []
    const url = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u }
    setMuseum({
      recipientName: draft.recipientName.trim() || 'Someone special',
      curatorName: draft.curatorName.trim() || null,
      branded: requiredTier(draft.exhibits.length) === 'free',
      exhibits: draft.exhibits.filter((e) => e.photo).map((e) => ({
        title: e.title.trim() || 'Untitled',
        place: e.place.trim() || null,
        year: e.year.trim() || null,
        medium: e.medium.trim() || null,
        photoUrl: url(e.photo as Blob),
      })),
      finalPhotoUrl: draft.finalPhoto ? url(draft.finalPhoto) : null,
    })
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [draft])
  return museum ? <MuseumViewer museum={museum} mode="preview" onClose={onClose} /> : null
}

export function MuseumBuilderPage() {
  useMuseumFonts()
  useDocumentTitle('Build a museum · Museum of You')
  const navigate = useNavigate()
  const [draft, setDraft] = useState<MuseumDraft | null>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [showProblems, setShowProblems] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)
  const finalRef = useRef<HTMLInputElement>(null)
  const finalThumb = useBlobUrl(draft?.finalPhoto ?? null)

  useEffect(() => {
    let cancelled = false
    loadDraft().then((d) => { if (!cancelled) setDraft(d ?? emptyDraft()) })
    Events.museumBuilderStarted()
    return () => { cancelled = true }
  }, [])

  // Autosave (debounced) so a reload or an evicted mobile tab keeps the gift.
  useEffect(() => {
    if (!draft) return
    const t = window.setTimeout(() => { void saveDraft(draft) }, 600)
    return () => window.clearTimeout(t)
  }, [draft])

  if (!draft) return <main className="mu mu-page" />

  const update = (patch: Partial<MuseumDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const updateExhibit = (id: string, patch: Partial<DraftExhibit>) =>
    setDraft((d) => (d ? { ...d, exhibits: d.exhibits.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : d))
  const moveExhibit = (index: number, delta: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d
      const list = [...d.exhibits]
      const [item] = list.splice(index, 1)
      list.splice(index + delta, 0, item)
      return { ...d, exhibits: list }
    })
  const removeExhibit = (id: string) => setDraft((d) => (d ? { ...d, exhibits: d.exhibits.filter((e) => e.id !== id) } : d))

  const addPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setAddError(null)
    const room = MAX_EXHIBITS - draft.exhibits.length
    if (files.length > room) {
      const left = files.length - room
      setAddError(`A museum holds up to ${MAX_EXHIBITS} exhibits, so ${left} photo${left > 1 ? 's were' : ' was'} left out.`)
    }
    setAdding(true)
    const added: DraftExhibit[] = []
    for (const file of files.slice(0, room)) {
      try {
        added.push(newExhibit(newId(), await prepareImage(file)))
      } catch (err) {
        setAddError((err as Error).message)
      }
    }
    setAdding(false)
    if (!added.length) return
    setDraft((d) => (d ? { ...d, exhibits: [...d.exhibits, ...added] } : d))
    Events.museumExhibitAdded(draft.exhibits.length + added.length)
  }

  const replacePhoto = async (id: string, file: File) => {
    try {
      updateExhibit(id, { photo: await prepareImage(file) })
    } catch (err) {
      setAddError((err as Error).message)
    }
  }

  const pickFinal = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      update({ finalPhoto: await prepareImage(file) })
    } catch (err) {
      setAddError((err as Error).message)
    }
  }

  const count = draft.exhibits.length
  const problems = draftProblems(draft)
  const canPreview = draft.exhibits.some((e) => e.photo)
  const openMuseum = () => {
    if (problems.length) { setShowProblems(true); return }
    setShowProblems(false)
    setPublishing(true)
  }

  return (
    <main className="mu mu-page">
      <MuseumHeader />
      <div className="mu-container">
        <div>
          <h1 className="mu-title">Build a museum</h1>
          <p className="mu-lede">Hang your photos, write the plaques, then send them the ticket. The last room is a surprise for them.</p>
        </div>

        <section className="mu-section" aria-labelledby="mu-who">
          <h2 id="mu-who">Who is it for?</h2>
          <div className="mu-fields">
            <div className="mu-field">
              <label htmlFor="mu-recipient">Their name</label>
              <input id="mu-recipient" className="mu-input" value={draft.recipientName} maxLength={LIMITS.name} placeholder="Sam"
                autoComplete="off" onChange={(e) => update({ recipientName: e.target.value })} />
            </div>
            <div className="mu-field">
              <label htmlFor="mu-curator">Your name (optional)</label>
              <input id="mu-curator" className="mu-input" value={draft.curatorName} maxLength={LIMITS.name} placeholder="Alex"
                autoComplete="off" onChange={(e) => update({ curatorName: e.target.value })} />
            </div>
          </div>
          <p className="mu-hint-text">Your name appears on their ticket as the curator.</p>
        </section>

        <section className="mu-section" aria-labelledby="mu-exhibits">
          <div className="mu-section-head">
            <h2 id="mu-exhibits">The exhibits</h2>
            <span className="mu-counter">
              {count <= FREE_EXHIBITS ? `${count} of ${FREE_EXHIBITS} free` : `${count} exhibits · full museum`}
            </span>
          </div>
          {count > FREE_EXHIBITS ? (
            <p className="mu-paynote">Museums with more than {FREE_EXHIBITS} exhibits are {PRICE_LABEL} to open, paid once. You can keep building.</p>
          ) : null}
          {count === 0 ? (
            <div className="mu-empty">
              <p>Start with 3 to 6 photos you both remember.</p>
              <button type="button" className="mu-btn-gold" onClick={() => addRef.current?.click()} disabled={adding}>
                {adding ? 'Framing photos…' : 'Add photos'}
              </button>
            </div>
          ) : (
            <>
              <ol className="mu-exhibits">
                {draft.exhibits.map((ex, i) => (
                  <ExhibitEditor
                    key={ex.id}
                    exhibit={ex}
                    index={i}
                    total={count}
                    onChange={(patch) => updateExhibit(ex.id, patch)}
                    onMove={(delta) => moveExhibit(i, delta)}
                    onRemove={() => removeExhibit(ex.id)}
                    onReplacePhoto={(file) => replacePhoto(ex.id, file)}
                  />
                ))}
              </ol>
              {count < MAX_EXHIBITS ? (
                <div>
                  <button type="button" className="mu-btn-ghost" onClick={() => addRef.current?.click()} disabled={adding}>
                    {adding ? 'Framing photos…' : 'Add more photos'}
                  </button>
                </div>
              ) : null}
            </>
          )}
          {addError ? <p className="mu-error" role="alert">{addError}</p> : null}
          <input ref={addRef} type="file" accept="image/*" multiple className="mu-vh" tabIndex={-1} aria-hidden="true" onChange={addPhotos} />
        </section>

        <section className="mu-section" aria-labelledby="mu-final">
          <h2 id="mu-final">The final room</h2>
          <p className="mu-hint-text">
            The last room holds an empty gold frame. When they step closer, their camera puts them inside it.
            Add a photo of them in case their camera isn’t available.
          </p>
          <div className="mu-final-row">
            {finalThumb ? <img className="mu-thumb" src={finalThumb} alt="Photo for the final frame" /> : null}
            <button type="button" className="mu-btn-ghost" onClick={() => finalRef.current?.click()}>
              {draft.finalPhoto ? 'Change photo' : 'Add a photo of them'}
            </button>
            {draft.finalPhoto ? <button type="button" className="mu-mini" onClick={() => update({ finalPhoto: null })}>Remove</button> : null}
          </div>
          <input ref={finalRef} type="file" accept="image/*" className="mu-vh" tabIndex={-1} aria-hidden="true" onChange={pickFinal} />
        </section>

        {showProblems && problems.length ? (
          <ul className="mu-problems" role="alert">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
      </div>

      <div className="mu-bottom-bar">
        <div className="mu-bottom-inner">
          <p className="mu-hint-text">Your draft saves on this device as you go.</p>
          <div className="mu-bottom-actions">
            <button type="button" className="mu-btn-ghost" disabled={!canPreview} onClick={() => { setPreviewing(true); Events.museumPreviewOpened() }}>
              Preview
            </button>
            <button type="button" className="mu-btn-gold" onClick={openMuseum}>Open the museum</button>
          </div>
        </div>
      </div>

      {previewing ? <DraftPreview draft={draft} onClose={() => setPreviewing(false)} /> : null}
      {publishing ? (
        <PublishSheet draft={draft} onClose={() => setPublishing(false)} onPublished={(slug) => navigate(`/museum/manage/${slug}?new=1`)} />
      ) : null}
    </main>
  )
}
