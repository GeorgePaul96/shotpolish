import { Link } from 'react-router-dom'

// Hub card: ShotPolish's homepage points to Museum of You, which lives at
// /museum with its own look. Kept as a single card so the screenshot tool
// stays the focus of this page.
export function MuseumPromo() {
  return (
    <section className="px-4 py-10">
      <Link
        to="/museum"
        className="group relative mx-auto flex max-w-4xl flex-col gap-4 overflow-hidden rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        style={{ background: 'linear-gradient(135deg, #21403a 0%, #0f201b 100%)', boxShadow: '0 20px 48px rgba(15,32,27,0.25)' }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 80% at 20% 0%, rgba(255,226,176,0.16), transparent 70%)' }}
        />
        <div className="relative">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f6dc96]">New from ShotPolish</p>
          <h2 className="mb-1 text-2xl font-bold tracking-tight text-[#ece5d6] sm:text-3xl">Museum of You</h2>
          <p className="max-w-md text-[15px] leading-relaxed text-[#c9d1cb]">
            Turn your photos into a museum about someone you love, then send them the ticket.
          </p>
        </div>
        <span className="relative inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-gradient-to-b from-[#f6dc96] to-[#c99a3e] px-5 py-3 text-sm font-semibold text-[#2a1d08] transition group-hover:brightness-105 sm:self-auto">
          Build a museum <span aria-hidden="true">→</span>
        </span>
      </Link>
    </section>
  )
}
