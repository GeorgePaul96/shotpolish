import { Link } from 'react-router-dom'

export function FooterSection() {
  return (
    <footer className="relative border-t border-white/[0.06] py-10 px-4">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
            S
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">
            <span className="text-accent">Shot</span>Polish
          </span>
          <span className="text-zinc-600 text-xs ml-1">— Turn screenshots into stories</span>
        </div>

        {/* Links */}
        <nav className="flex items-center gap-6 text-xs text-zinc-500">
          <a href="#features" className="hover:text-zinc-300 transition-colors">Features</a>
          <a href="#preview" className="hover:text-zinc-300 transition-colors">Preview</a>
          <Link to="/editor" className="hover:text-zinc-300 transition-colors">Editor</Link>
          <Link to="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
        </nav>

        {/* Copyright */}
        <p className="text-xs text-zinc-700">
          © {new Date().getFullYear()} ShotPolish
        </p>
      </div>
    </footer>
  )
}
