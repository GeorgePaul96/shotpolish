import { useEffect } from 'react'

// Museum pages use their own faces. Loaded on demand (not in index.html) so the
// ShotPolish pages don't pay for them; museum.html also preloads the same link.
const HREF = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@400;500;600&display=swap'

export function useMuseumFonts(): void {
  useEffect(() => {
    if (document.getElementById('museum-fonts')) return
    const link = document.createElement('link')
    link.id = 'museum-fonts'
    link.rel = 'stylesheet'
    link.href = HREF
    document.head.appendChild(link)
  }, [])
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
