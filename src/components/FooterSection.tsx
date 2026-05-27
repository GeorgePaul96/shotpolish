import { Link } from 'react-router-dom'

export function FooterSection() {
  return (
    <footer className="relative border-t border-[#E5E7EC] py-10 px-4">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
            S
          </div>
          <span className="text-sm font-semibold text-[#111827] tracking-tight">
            <span className="text-accent">Shot</span>Polish
          </span>
          <span className="text-[#6B7280] text-xs ml-1">— Turn screenshots into stories</span>
        </div>

        {/* Links */}
        <nav className="flex items-center gap-6 text-xs text-[#6B7280]">
          <a href="#features" className="hover:text-[#111827] transition-colors">Features</a>
          <a href="#preview" className="hover:text-[#111827] transition-colors">Preview</a>
          <Link to="/editor" className="hover:text-[#111827] transition-colors">Editor</Link>
          <Link to="/privacy" className="hover:text-[#111827] transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-[#111827] transition-colors">Terms</Link>
        </nav>

        {/* Copyright */}
        <p className="text-xs text-[#9CA3AF]">
          © {new Date().getFullYear()} ShotPolish
        </p>
      </div>
    </footer>
  )
}
