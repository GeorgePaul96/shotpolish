import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
import { StoryModePage } from './pages/StoryModePage'
import { BrandKitPage } from './pages/BrandKitPage'
import { LegalPages } from './components/LegalPages'

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
        <Route path="/story" element={<StoryModePage />} />
        <Route path="/settings/brand" element={<BrandKitPage />} />
        <Route path="/privacy" element={<><Navbar /><LegalPages page="privacy" /></>} />
        <Route path="/terms" element={<><Navbar /><LegalPages page="terms" /></>} />
      </Routes>
    </BrowserRouter>
  )
}
