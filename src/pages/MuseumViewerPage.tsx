import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MuseumNotice, useDocumentTitle } from '../components/museum/MuseumNotice'
import { MuseumViewer } from '../components/museum/MuseumViewer'
import { Events } from '../lib/analytics'
import { getMuseum, type GetMuseumResult } from '../lib/museum/api'
import { FREE_DAYS } from '../lib/museum/rules'
import { exampleMuseum } from '../lib/museum/samples'

type PageState = GetMuseumResult | { state: 'loading' } | { state: 'error'; message: string }

/** /m/:slug, the link a recipient opens. */
export function MuseumViewerPage() {
  const { slug = '' } = useParams()
  const [page, setPage] = useState<PageState>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setPage({ state: 'loading' })
    getMuseum(slug)
      .then((r) => {
        if (cancelled) return
        setPage(r)
        Events.museumViewerOpened(r.state)
      })
      .catch((err: Error) => { if (!cancelled) setPage({ state: 'error', message: err.message }) })
    return () => { cancelled = true }
  }, [slug, attempt])

  const name = page.state === 'open' ? page.museum.recipientName : page.state === 'closed' ? page.recipientName : ''
  useDocumentTitle(name ? `The Museum of ${name}` : 'Museum of You')

  if (page.state === 'loading') return <MuseumNotice title="Opening the doors…" />
  if (page.state === 'open') return <MuseumViewer museum={page.museum} mode="live" />

  const buildOwn = <Link className="mu-btn-gold" to="/museum/new" onClick={() => Events.museumBuildOwnClicked(page.state)}>Build your own museum</Link>

  if (page.state === 'closed') {
    return (
      <MuseumNotice
        title={`The Museum of ${page.recipientName} has closed`}
        body={`Free museums stay open for ${FREE_DAYS} days. ${page.curatorName ?? 'Its curator'} can reopen it for good from their manage link.`}
      >
        {buildOwn}
      </MuseumNotice>
    )
  }
  if (page.state === 'error') {
    return (
      <MuseumNotice title="This museum couldn’t open" body={page.message}>
        <button type="button" className="mu-btn-gold" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </MuseumNotice>
    )
  }
  return (
    <MuseumNotice title="This museum doesn’t exist" body="The link may be mistyped, or the museum was taken down by its curator.">
      {buildOwn}
    </MuseumNotice>
  )
}

/** /museum/example, a walkable sample museum with painted photos. */
export function MuseumExamplePage() {
  const museum = useMemo(() => exampleMuseum(), [])
  useDocumentTitle('Example museum · Museum of You')
  useEffect(() => { Events.museumViewerOpened('example') }, [])
  return <MuseumViewer museum={museum} mode="example" />
}
