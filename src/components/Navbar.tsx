import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const isEditor = location.pathname === '/editor'

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <motion.header
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || isEditor
          ? 'border-b border-[#E5E7EC] bg-white/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold transition-all duration-200 group-hover:bg-accent/20">
              S
            </div>
            <span className="text-sm font-semibold text-[#111827] tracking-tight">
              <span className="text-accent">Shot</span>Polish
            </span>
          </Link>

          {/* Desktop nav */}
          {!isEditor && (
            <nav className="hidden md:flex items-center gap-1">
              <a href="#features" className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors duration-150 rounded-lg hover:bg-gray-100">
                Features
              </a>
              <a href="#preview" className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors duration-150 rounded-lg hover:bg-gray-100">
                Preview
              </a>
            </nav>
          )}

          {/* CTA */}
          <div className="flex items-center gap-2">
            {isEditor ? (
              <Link
                to="/"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors duration-150 rounded-lg hover:bg-gray-100"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Home
              </Link>
            ) : (
              <>
                <Link
                  to="/editor"
                  className="btn-primary text-xs px-4 py-2"
                >
                  Open editor
                </Link>
                <button
                  onClick={() => setMobileOpen(!mobileOpen)}
                  className="md:hidden p-1.5 text-[#6B7280] hover:text-[#111827] transition-colors"
                  aria-label="Toggle menu"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    {mobileOpen ? (
                      <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    ) : (
                      <>
                        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </>
                    )}
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && !isEditor && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="md:hidden border-t border-[#E5E7EC] bg-white/95 backdrop-blur-xl px-4 py-3 flex flex-col gap-1"
          >
            <a href="#features" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-gray-100 transition-colors">Features</a>
            <a href="#preview" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-gray-100 transition-colors">Preview</a>
            <div className="pt-2 border-t border-[#E5E7EC]">
              <Link to="/editor" onClick={() => setMobileOpen(false)} className="btn-primary w-full justify-center text-xs py-2">
                Open editor
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
