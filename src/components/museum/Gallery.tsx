import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import type { ViewerMuseum } from '../../lib/museum/api'
import { Plaque, exhibitMedium, exhibitMeta } from './Plaque'
import { prefersReducedMotion } from './useMuseumFonts'

export interface GalleryHandle { goTo: (index: number) => void }

interface GalleryProps {
  museum: ViewerMuseum
  entered: boolean
  keyboard: boolean
  revealed: boolean
  finalRoom: ReactNode
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v))

function RoomDecor() {
  return (
    <>
      <div className="mu-wall" />
      <div className="mu-pool" />
      <div className="mu-beam" />
      <div className="mu-lamp" />
      <div className="mu-floor" />
    </>
  )
}

/**
 * Swipe-through rooms on a native scroll-snap track. Depth comes from per-room
 * transforms computed from scroll position in one rAF (no React state per
 * frame), plus a pointer/device tilt exposed as --tx/--ty CSS variables.
 */
export const Gallery = forwardRef<GalleryHandle, GalleryProps>(function Gallery(
  { museum, entered, keyboard, revealed, finalRoom },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const roomRefs = useRef<(HTMLElement | null)[]>([])
  const activeRef = useRef(0)
  // Room a smooth scroll is heading to, so rapid taps step past it instead of
  // re-targeting the room we're leaving. Cleared once the scroll settles.
  const targetRef = useRef<number | null>(null)
  const enteredRef = useRef(entered)
  enteredRef.current = entered
  const [active, setActive] = useState(0)
  const roomCount = museum.exhibits.length + 1
  roomRefs.current.length = roomCount
  const reduce = prefersReducedMotion()

  const update = useCallback(() => {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    const w = track.clientWidth
    const x = track.scrollLeft
    let best = Infinity
    let index = 0
    roomRefs.current.forEach((el, i) => {
      if (!el) return
      const p = (i * w - x) / w
      const ap = Math.abs(p)
      if (ap < best) { best = ap; index = i }
      el.classList.toggle('is-lit', enteredRef.current && ap < 0.35)
      if (ap > 1.1) return
      const c = clamp(p)
      const piece = el.querySelector<HTMLElement>('.mu-piece')
      const beam = el.querySelector<HTMLElement>('.mu-beam')
      if (piece && !reduce) {
        piece.style.transform = `translate3d(${(c * 26).toFixed(2)}%,0,0) rotateY(${(c * -16).toFixed(2)}deg) scale(${(1 - Math.abs(c) * 0.08).toFixed(3)})`
      }
      if (beam) beam.style.transform = `translateX(calc(-50% + ${(c * -14).toFixed(2)}%))`
    })
    if (targetRef.current === index && best < 0.02) targetRef.current = null
    if (index !== activeRef.current) {
      activeRef.current = index
      setActive(index)
    }
  }, [reduce])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let raf = 0
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() })
    }
    const ro = new ResizeObserver(() => {
      track.scrollLeft = activeRef.current * track.clientWidth
      update()
    })
    // A manual swipe or wheel overrides any button-driven target.
    const onManual = () => { targetRef.current = null }
    track.addEventListener('scroll', onScroll, { passive: true })
    track.addEventListener('touchstart', onManual, { passive: true })
    track.addEventListener('wheel', onManual, { passive: true })
    ro.observe(track)
    update()
    return () => {
      track.removeEventListener('scroll', onScroll)
      track.removeEventListener('touchstart', onManual)
      track.removeEventListener('wheel', onManual)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [update])

  useEffect(() => { update() }, [entered, update])

  const goTo = useCallback((i: number) => {
    const track = trackRef.current
    if (!track) return
    const n = Math.max(0, Math.min(roomCount - 1, i))
    targetRef.current = n
    track.scrollTo({ left: n * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }, [roomCount, reduce])
  const step = useCallback((delta: number) => goTo((targetRef.current ?? activeRef.current) + delta), [goTo])
  useImperativeHandle(ref, () => ({ goTo }), [goTo])

  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, step])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || reduce) return
    const set = (x: number, y: number) => {
      stage.style.setProperty('--tx', x.toFixed(3))
      stage.style.setProperty('--ty', y.toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const r = stage.getBoundingClientRect()
      set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2)
    }
    const onLeave = () => set(0, 0)
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      set(clamp(e.gamma / 20), clamp((e.beta - 40) / 20))
    }
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerleave', onLeave)
    window.addEventListener('deviceorientation', onOrient)
    return () => {
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('deviceorientation', onOrient)
    }
  }, [reduce])

  const last = roomCount - 1

  return (
    <div className="mu-stage" ref={stageRef}>
      <div className="mu-track" ref={trackRef} tabIndex={0} aria-label="Gallery rooms. Use the arrow keys to move between rooms.">
        {museum.exhibits.map((ex, i) => (
          <article key={i} ref={(el) => { roomRefs.current[i] = el }} className="mu-room" aria-label={`Room ${i + 1} of ${roomCount}`}>
            <RoomDecor />
            <div className="mu-piece">
              <div className="mu-frame">
                <div className="mu-mat">
                  <img className="mu-art" src={ex.photoUrl} alt={ex.title} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                </div>
              </div>
              <Plaque label={`Exhibit ${i + 1}`} title={ex.title} meta={exhibitMeta(ex.place, ex.year)} medium={exhibitMedium(ex.medium)} />
            </div>
          </article>
        ))}
        <article
          ref={(el) => { roomRefs.current[last] = el }}
          className={`mu-room mu-room-final${revealed ? ' is-revealed' : ''}`}
          aria-label={`Room ${roomCount} of ${roomCount}: the final room`}
        >
          <RoomDecor />
          <div className="mu-piece">{finalRoom}</div>
        </article>
      </div>
      <div className="mu-nav">
        <button type="button" aria-label="Previous room" disabled={active === 0} onClick={() => step(-1)}>‹</button>
        <span aria-live="polite">{active === last ? 'Final room' : `Room ${active + 1} of ${roomCount}`}</span>
        <button type="button" aria-label="Next room" disabled={active === last} onClick={() => step(1)}>›</button>
      </div>
      <p className="mu-hint"><span><b>Swipe</b> between rooms</span></p>
    </div>
  )
})
