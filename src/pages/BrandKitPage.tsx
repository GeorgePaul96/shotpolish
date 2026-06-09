import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Navbar } from '../components/Navbar'
import { useAuth } from '../components/AuthProvider'

export function BrandKitPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [kitId, setKitId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: 'My Brand Kit',
    primary: '#111827',
    secondary: '#4F46E5',
    accent: '#3B82F6',
    font_family: 'Inter',
    padding: 100,
    shadow_opacity: 0.5,
    border_radius: 12,
  })

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    async function fetchKit() {
      const { data, error } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (data) {
        setKitId(data.id)
        setForm({
          name: data.name || 'My Brand Kit',
          primary: data.colors?.primary || '#111827',
          secondary: data.colors?.secondary || '#4F46E5',
          accent: data.colors?.accent || '#3B82F6',
          font_family: data.typography?.font_family || 'Inter',
          padding: data.visual_defaults?.padding || 100,
          shadow_opacity: data.visual_defaults?.shadow_opacity || 0.5,
          border_radius: data.visual_defaults?.border_radius || 12,
        })
      }
      setLoading(false)
    }

    fetchKit()
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setMessage('')

    const payload = {
      user_id: user.id,
      name: form.name,
      colors: {
        primary: form.primary,
        secondary: form.secondary,
        accent: form.accent,
      },
      typography: {
        font_family: form.font_family,
      },
      visual_defaults: {
        padding: Number(form.padding),
        shadow_opacity: Number(form.shadow_opacity),
        border_radius: Number(form.border_radius),
      }
    }

    let error
    if (kitId) {
      const res = await supabase.from('brand_kits').update(payload).eq('id', kitId)
      error = res.error
    } else {
      const res = await supabase.from('brand_kits').insert(payload).select().single()
      error = res.error
      if (res.data) setKitId(res.data.id)
    }

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('Brand kit saved successfully!')
    }
    setSaving(false)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <Navbar />
        <div className="pt-24 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Sign in to manage Brand Kits</h1>
          <p className="mt-2 text-gray-600">You must be logged in to save brand settings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <Navbar />
      <div className="pt-24 px-4 pb-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Brand Kit Settings</h1>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kit Name</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent" required />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={form.primary} onChange={e => setForm({...form, primary: e.target.value})} className="h-9 w-9 rounded border border-gray-300 cursor-pointer" />
                  <input type="text" value={form.primary} onChange={e => setForm({...form, primary: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary</label>
                <div className="flex gap-2">
                  <input type="color" value={form.secondary} onChange={e => setForm({...form, secondary: e.target.value})} className="h-9 w-9 rounded border border-gray-300 cursor-pointer" />
                  <input type="text" value={form.secondary} onChange={e => setForm({...form, secondary: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent</label>
                <div className="flex gap-2">
                  <input type="color" value={form.accent} onChange={e => setForm({...form, accent: e.target.value})} className="h-9 w-9 rounded border border-gray-300 cursor-pointer" />
                  <input type="text" value={form.accent} onChange={e => setForm({...form, accent: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Typography (Font Family)</label>
              <input type="text" value={form.font_family} onChange={e => setForm({...form, font_family: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Padding</label>
                <input type="number" value={form.padding} onChange={e => setForm({...form, padding: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shadow Opacity (0-1)</label>
                <input type="number" step="0.1" value={form.shadow_opacity} onChange={e => setForm({...form, shadow_opacity: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Border Radius</label>
                <input type="number" value={form.border_radius} onChange={e => setForm({...form, border_radius: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent" />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-gray-100">
              <span className="text-sm text-green-600">{message}</span>
              <button type="submit" disabled={saving} className="btn-primary px-6 py-2 shadow-sm">
                {saving ? 'Saving...' : 'Save Brand Kit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
