import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { LegalPages } from './components/LegalPages'
import PostHogPageview from './components/PostHogPageview'
import { isSupabaseConfigured } from './lib/supabase'

// Remix loop entry: a shared watermark link (shotpolish.org/r/<templateId>)
// hands off to the editor, which pre-applies that template. Short path keeps the
// baked-in badge readable.
function RemixRedirect() {
  const { id } = useParams()
  return <Navigate to={`/editor?remix=${encodeURIComponent(id ?? '')}`} replace />
}

// Pages load on demand so a gift link (/m/...) doesn't download the editor or
// the animated homepage (framer-motion). The fallback is blank; pages render
// their own chrome.
const Navbar = lazy(() => import('./components/Navbar').then((m) => ({ default: m.Navbar })))
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })))
const StoryModePage = lazy(() => import('./pages/StoryModePage').then((m) => ({ default: m.StoryModePage })))
const BrandKitPage = lazy(() => import('./pages/BrandKitPage').then((m) => ({ default: m.BrandKitPage })))
const PricingPage = lazy(() => import('./pages/PricingPage').then((m) => ({ default: m.PricingPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })))

// Museum of You lives in its own lazy chunks so the ShotPolish bundle doesn't
// grow. The fallback matches the museum's night background to avoid a flash.
const MuseumViewerPage = lazy(() => import('./pages/MuseumViewerPage').then((m) => ({ default: m.MuseumViewerPage })))
const MuseumExamplePage = lazy(() => import('./pages/MuseumViewerPage').then((m) => ({ default: m.MuseumExamplePage })))
const MuseumBuilderPage = lazy(() => import('./pages/MuseumBuilderPage').then((m) => ({ default: m.MuseumBuilderPage })))
const MuseumManagePage = lazy(() => import('./pages/MuseumManagePage').then((m) => ({ default: m.MuseumManagePage })))
const MuseumLandingPage = lazy(() => import('./pages/MuseumLandingPage').then((m) => ({ default: m.MuseumLandingPage })))

function MuseumRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a1411' }} />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <PostHogPageview />
      <Suspense fallback={null}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Navbar />
              <HomePage />
            </>
          }
        />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/r/:id" element={<RemixRedirect />} />
        <Route path="/remix/:id" element={<RemixRedirect />} />
        <Route path="/story" element={<StoryModePage />} />
        <Route path="/museum" element={<MuseumRoute><MuseumLandingPage /></MuseumRoute>} />
        <Route path="/m/:slug" element={<MuseumRoute><MuseumViewerPage /></MuseumRoute>} />
        <Route path="/museum/example" element={<MuseumRoute><MuseumExamplePage /></MuseumRoute>} />
        <Route path="/museum/new" element={<MuseumRoute><MuseumBuilderPage /></MuseumRoute>} />
        <Route path="/museum/manage/:slug" element={<MuseumRoute><MuseumManagePage /></MuseumRoute>} />
        {/* Account/billing routes only exist when auth is live, so anonymous
            visitors can't land on a broken sign-in/upgrade page. */}
        {isSupabaseConfigured && <Route path="/settings/brand" element={<BrandKitPage />} />}
        {isSupabaseConfigured && <Route path="/pricing" element={<PricingPage />} />}
        {isSupabaseConfigured && <Route path="/account" element={<AccountPage />} />}
        <Route path="/privacy" element={<><Navbar /><LegalPages page="privacy" /></>} />
        <Route path="/terms" element={<><Navbar /><LegalPages page="terms" /></>} />
        {/* Catch-all: unknown paths (and disabled routes) bounce to home instead
            of rendering a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
