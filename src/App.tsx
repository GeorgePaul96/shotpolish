import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
import { StoryModePage } from './pages/StoryModePage'
import { BrandKitPage } from './pages/BrandKitPage'
import { PricingPage } from './pages/PricingPage'
import { AccountPage } from './pages/AccountPage'
import { LegalPages } from './components/LegalPages'

// Remix loop entry: a shared watermark link (shotpolish.app/r/<templateId>)
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
        <Route path="/settings/brand" element={<BrandKitPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/privacy" element={<><Navbar /><LegalPages page="privacy" /></>} />
        <Route path="/terms" element={<><Navbar /><LegalPages page="terms" /></>} />
      </Routes>
    </BrowserRouter>
  )
}
