import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { fitWithin, loadImageEl, prepareImage } from '../../lib/museum/image'
import { Plaque } from './Plaque'

export type RevealSource = 'camera' | 'photo' | 'upload'

interface FinalRoomProps {
  recipientName: string
  number: number
  finalPhotoUrl: string | null
  portrait: HTMLCanvasElement | null
  onReveal: (portrait: HTMLCanvasElement, source: RevealSource) => void
}

type Phase = 'idle' | 'starting' | 'camera' | 'choose'

function toCanvas(source: CanvasImageSource, width: number, height: number, mirror = false): HTMLCanvasElement {
  const size = fitWithin(width, height)
  const c = document.createElement('canvas')
  c.width = size.width
  c.height = size.height
  const g = c.getContext('2d')!
  if (mirror) {
    // The live preview is mirrored like a bathroom mirror; keep the still the same.
    g.translate(size.width, 0)
    g.scale(-1, 1)
  }
  g.drawImage(source, 0, 0, size.width, size.height)
  return c
}

/**
 * The empty gilt frame. "Step closer" opens the front camera so the visitor
 * sees themselves inside it. If the camera is unavailable (denied, in-app
 * browser, no camera) it falls back to the creator's photo of them, then to
 * letting the visitor pick a photo. Camera frames never leave the device.
 */
export function FinalRoom({ recipientName, number, finalPhotoUrl, portrait, onReveal }: FinalRoomProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const portraitUrl = useMemo(() => (portrait ? portrait.toDataURL('image/jpeg', 0.9) : null), [portrait])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])
  useEffect(() => stopCamera, [stopCamera])

  useEffect(() => {
    const video = videoRef.current
    if (phase !== 'camera' || !video || !streamRef.current) return
    video.srcObject = streamRef.current
    video.play().catch(() => undefined)
  }, [phase])

  const fallback = async () => {
    stopCamera()
    if (finalPhotoUrl) {
      try {
        const img = await loadImageEl(finalPhotoUrl)
        setPhase('idle')
        onReveal(toCanvas(img, img.naturalWidth, img.naturalHeight), 'photo')
        return
      } catch {
        // Fall through to letting them choose a photo.
      }
    }
    setPhase('choose')
  }

  const stepCloser = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      await fallback()
      return
    }
    setPhase('starting')
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false,
      })
      setPhase('camera')
    } catch {
      await fallback()
    }
  }

  const snap = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const still = toCanvas(video, video.videoWidth, video.videoHeight, true)
    stopCamera()
    setPhase('idle')
    onReveal(still, 'camera')
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const url = URL.createObjectURL(await prepareImage(file))
      try {
        const img = await loadImageEl(url)
        setPhase('idle')
        onReveal(toCanvas(img, img.naturalWidth, img.naturalHeight), 'upload')
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const year = new Date().getFullYear()

  return (
    <>
      <div className="mu-frame">
        <div className="mu-mat">
          <div className="mu-void">
            {portraitUrl ? (
              <img className="mu-void-portrait" src={portraitUrl} alt={`${recipientName}, framed as The Masterpiece`} />
            ) : null}

            {!portrait && phase === 'camera' ? (
              <>
                <video ref={videoRef} className="mu-void-video" playsInline muted autoPlay aria-label="Your camera, shown inside the frame" />
                <div className="mu-void-snap">
                  <button type="button" className="mu-btn-gold" onClick={snap}>Take my portrait</button>
                  <button type="button" className="mu-void-alt" onClick={() => { stopCamera(); setPhase('choose') }}>Use a photo instead</button>
                </div>
              </>
            ) : null}

            {!portrait && (phase === 'idle' || phase === 'starting') ? (
              <div className="mu-void-cta">
                <button type="button" className="mu-btn-gold" onClick={stepCloser} disabled={phase === 'starting'}>
                  {phase === 'starting' ? 'Step closer…' : 'Step closer'}
                </button>
              </div>
            ) : null}

            {!portrait && phase === 'choose' ? (
              <div className="mu-void-cta">
                <button type="button" className="mu-btn-gold" onClick={() => fileRef.current?.click()}>Choose a photo</button>
                <p className="mu-void-note" role={error ? 'alert' : undefined}>{error ?? 'Pick a photo of yourself to hang in the frame. It stays on this device.'}</p>
              </div>
            ) : null}

            <input ref={fileRef} type="file" accept="image/*" className="mu-vh" tabIndex={-1} aria-hidden="true" onChange={onFile} />
          </div>
        </div>
      </div>
      {portrait ? (
        <Plaque label="Permanent collection" title="The Masterpiece" meta={`${recipientName}, ${year}`} medium="Medium: priceless. On permanent display." />
      ) : phase === 'camera' ? (
        <Plaque label={`Exhibit ${number}`} title="Reserved" meta="The final piece" medium="Only you can see this. Nothing is uploaded." />
      ) : (
        <Plaque label={`Exhibit ${number}`} title="Reserved" meta="The final piece" medium="Medium: to be revealed." />
      )}
    </>
  )
}
