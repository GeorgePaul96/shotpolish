import './museum.css'
import { useEffect, type ReactNode } from 'react'
import { useMuseumFonts } from './useMuseumFonts'

interface MuseumNoticeProps {
  title: string
  body?: ReactNode
  children?: ReactNode
  frame?: boolean
}

/** Full-page museum message: loading, closed, not found. */
export function MuseumNotice({ title, body, children, frame = true }: MuseumNoticeProps) {
  useMuseumFonts()
  return (
    <main className="mu mu-notice">
      <div className="mu-notice-card">
        {frame ? <div className="mu-empty-frame" aria-hidden="true" /> : null}
        <h1>{title}</h1>
        {body ? <p>{body}</p> : null}
        {children ? <div className="mu-actions mu-actions-center">{children}</div> : null}
      </div>
    </main>
  )
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => { document.title = prev }
  }, [title])
}
