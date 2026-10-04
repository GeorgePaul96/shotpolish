import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { LIMITS, nextMedium, type DraftExhibit } from '../../lib/museum/rules'

/** Object URL for a Blob, revoked when the Blob changes or the component unmounts. */
export function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

interface ExhibitEditorProps {
  exhibit: DraftExhibit
  index: number
  total: number
  onChange: (patch: Partial<DraftExhibit>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  onReplacePhoto: (file: File) => void
}

export function ExhibitEditor({ exhibit, index, total, onChange, onMove, onRemove, onReplacePhoto }: ExhibitEditorProps) {
  const thumb = useBlobUrl(exhibit.photo)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = `ex-${exhibit.id}`
  const n = index + 1

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onReplacePhoto(file)
  }

  return (
    <li className="mu-exhibit">
      <div className="mu-exhibit-side">
        {thumb ? (
          <img className="mu-thumb" src={thumb} alt={`Exhibit ${n} photo`} />
        ) : (
          <div className="mu-thumb mu-thumb-empty">No photo</div>
        )}
        <button type="button" className="mu-mini" onClick={() => fileRef.current?.click()}>{thumb ? 'Change photo' : 'Add photo'}</button>
        <input ref={fileRef} type="file" accept="image/*" className="mu-vh" tabIndex={-1} aria-hidden="true" onChange={pick} />
      </div>
      <div className="mu-exhibit-main">
        <span className="mu-exhibit-no">Exhibit {n}</span>
        <div className="mu-field">
          <label htmlFor={`${id}-title`}>Title</label>
          <input id={`${id}-title`} className="mu-input" value={exhibit.title} maxLength={LIMITS.title}
            placeholder="The Night We Missed the Last Train" onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="mu-fields">
          <div className="mu-field">
            <label htmlFor={`${id}-place`}>Place</label>
            <input id={`${id}-place`} className="mu-input" value={exhibit.place} maxLength={LIMITS.place}
              placeholder="Lisbon" onChange={(e) => onChange({ place: e.target.value })} />
          </div>
          <div className="mu-field">
            <label htmlFor={`${id}-year`}>Year</label>
            <input id={`${id}-year`} className="mu-input" value={exhibit.year} maxLength={LIMITS.year}
              placeholder="2024" onChange={(e) => onChange({ year: e.target.value })} />
          </div>
        </div>
        <div className="mu-field">
          <label htmlFor={`${id}-medium`}>Medium</label>
          <div className="mu-input-row">
            <input id={`${id}-medium`} className="mu-input" value={exhibit.medium} maxLength={LIMITS.medium}
              placeholder="bad decisions, one shared umbrella" onChange={(e) => onChange({ medium: e.target.value })} />
            <button type="button" className="mu-mini" onClick={() => onChange({ medium: nextMedium(exhibit.medium) })}>Suggest</button>
          </div>
        </div>
        <div className="mu-exhibit-tools">
          <button type="button" className="mu-mini" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move exhibit ${n} earlier`}>Move up</button>
          <button type="button" className="mu-mini" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move exhibit ${n} later`}>Move down</button>
          <button type="button" className="mu-mini" onClick={onRemove} aria-label={`Remove exhibit ${n}`}>Remove</button>
        </div>
      </div>
    </li>
  )
}
