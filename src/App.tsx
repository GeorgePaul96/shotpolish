import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
import { StoryModePage } from './pages/StoryModePage'
import { BrandKitPage } from './pages/BrandKitPage'
import { PricingPage } from './pages/PricingPage'
import { AccountPage } from './pages/AccountPage'
import { LegalPages } from './components/LegalPages'
import { isSupabaseConfigured } from './lib/supabase'

// Remix loop entry: a shared watermark link (shotpolish.org/r/<templateId>)
// hands off to the editor, which pre-applies that template. Short path keeps the
// baked-in badge readable.
function RemixRedirect() {
  const { id } = useParams()
  return <Navigate to={`/editor?remix=${encodeURIComponent(id ?? '')}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
