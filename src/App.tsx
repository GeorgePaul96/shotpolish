import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
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
        <Route path="/privacy" element={<><Navbar /><LegalPages page="privacy" /></>} />
        <Route path="/terms" element={<><Navbar /><LegalPages page="terms" /></>} />
      </Routes>
    </BrowserRouter>
  )
}
