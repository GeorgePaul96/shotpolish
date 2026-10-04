import '../components/museum/museum.css'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MuseumHeader } from '../components/museum/MuseumHeader'
import { useDocumentTitle } from '../components/museum/MuseumNotice'
import { Plaque, exhibitMedium, exhibitMeta } from '../components/museum/Plaque'
import { useMuseumFonts } from '../components/museum/useMuseumFonts'
import { FREE_DAYS, FREE_EXHIBITS, MAX_EXHIBITS, PRICE_LABEL } from '../lib/museum/rules'
import { exampleMuseum } from '../lib/museum/samples'

const STEPS = [
  { title: 'Hang your photos', body: `Up to ${MAX_EXHIBITS} moments, each in its own gilt frame under its own light.` },
  { title: 'Write the plaques', body: 'A title, a place, a year, and a medium. “Two aux cords, zero compromise.”' },
  { title: 'Send the ticket', body: 'They walk through the rooms. The last one has a surprise only they can see.' },
]

/** /museum, the front door for Museum of You. */
export function MuseumLandingPage() {
  useMuseumFonts()
  useDocumentTitle('Museum of You · Build a museum about someone you love')
  const sample = useMemo(() => exampleMuseum().exhibits[0], [])

  return (
    <main className="mu mu-page">
      <MuseumHeader right={<Link to="/museum/example" className="mu-mini mu-mini-link">See an example</Link>} />
      <div className="mu-container mu-landing">
        <section className="mu-hero">
          <div className="mu-hero-copy">
            <p className="mu-eyebrow">A gift you can walk through</p>
            <h1 className="mu-title">Build a museum about someone you love.</h1>
            <p className="mu-lede">
              Hang your photos in a softly lit gallery, write the plaques, and send them a ticket.
              The last room is a surprise.
            </p>
            <div className="mu-actions">
              <Link className="mu-btn-gold" to="/museum/new">Build a museum</Link>
              <Link className="mu-btn-ghost" to="/museum/example">See an example</Link>
            </div>
          </div>
          <div className="mu-landing-stage" aria-hidden="true">
            <div className="mu-room is-lit">
              <div className="mu-wall" />
              <div className="mu-pool" />
              <div className="mu-beam" />
              <div className="mu-lamp" />
              <div className="mu-floor" />
              <div className="mu-piece">
                <div className="mu-frame">
                  <div className="mu-mat"><img className="mu-art" src={sample.photoUrl} alt="" /></div>
                </div>
                <Plaque label="Exhibit 1" title={sample.title} meta={exhibitMeta(sample.place, sample.year)} medium={exhibitMedium(sample.medium)} />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="mu-how">
          <h2 id="mu-how" className="mu-vh">How it works</h2>
          <ol className="mu-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="mu-step">
                <span className="mu-step-no">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mu-section mu-pricing" aria-labelledby="mu-price">
          <h2 id="mu-price">Free to try</h2>
          <p className="mu-hint-text">
            Free for up to {FREE_EXHIBITS} exhibits, open for {FREE_DAYS} days. {PRICE_LABEL} once for up to {MAX_EXHIBITS}, open forever.
            No account needed. Photos stay private to your link, and you can delete them anytime.
          </p>
          <div><Link className="mu-btn-gold" to="/museum/new">Start building</Link></div>
        </section>

        <p className="mu-hint-text mu-colophon">Museum of You is made by <Link className="mu-link" to="/">ShotPolish</Link>.</p>
      </div>
    </main>
  )
}
