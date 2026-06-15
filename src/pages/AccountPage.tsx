import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { useAuth } from '../components/AuthProvider'
import { useEntitlement } from '../hooks/useEntitlement'
import { accountPlanView, isDeleteConfirmed, deleteAccount } from '../lib/account'

export function AccountPage() {
  const { user, loading, signOut } = useAuth()
  const { plan, openPortal } = useEntitlement()
  const navigate = useNavigate()

  const [confirmInput, setConfirmInput] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F6F8]">
        <Navbar />
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </main>
    )
  }

  if (!user) return <Navigate to="/" replace />

  const hasPortal = !!import.meta.env.VITE_STRIPE_PORTAL_URL
  const { badgeLabel, cta } = accountPlanView(plan, hasPortal)
  const email = user.email ?? ''
  const canDelete = isDeleteConfirmed(confirmInput, email)

  const handleSignOut = async () => { await signOut(); navigate('/') }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await deleteAccount()
      navigate('/')
    } catch (e) {
      setModalOpen(false)
      setError(e instanceof Error ? e.message : 'Could not delete your account. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F6F8] text-[#111827]">
      <Navbar />
      <section className="mx-auto max-w-2xl px-4 pt-28 pb-20">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Profile */}
        <div className="mt-6 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-[#374151]">Profile</h2>
          <p className="mt-2 text-sm text-[#6B7280]">{email}</p>
        </div>

        {/* Plan */}
        <div className="mt-4 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#374151]">Plan</h2>
              <span className="mt-2 inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{badgeLabel}</span>
            </div>
            {cta === 'upgrade' && <Link to="/pricing" className="btn-primary px-4 py-2 text-sm">Upgrade</Link>}
            {cta === 'manage' && <button onClick={openPortal} className="btn-ghost px-4 py-2 text-sm">Manage billing</button>}
          </div>
        </div>

        {/* Brand kit */}
        <div className="mt-4 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#374151]">Brand kit</h2>
            <Link to="/settings/brand" className="btn-ghost px-4 py-2 text-sm">Edit brand kit</Link>
          </div>
        </div>

        {/* Session */}
        <div className="mt-4 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#374151]">Session</h2>
            <button onClick={handleSignOut} className="btn-ghost px-4 py-2 text-sm">Sign out</button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-8 rounded-2xl border border-red-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
          <p className="mt-2 text-sm text-[#6B7280]">
            Deleting your account permanently removes your profile, workspaces, and brand kits. This cannot be undone.
          </p>
          <p className="mt-3 text-sm text-[#374151]">
            Type your email address (<span className="font-medium">{email}</span>) to confirm.
          </p>
          <input
            type="email"
            value={confirmInput}
            onChange={e => setConfirmInput(e.target.value)}
            placeholder={email}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            disabled={!canDelete}
            onClick={() => setModalOpen(true)}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
          >
            Delete account
          </button>
        </div>
      </section>

      {/* Final confirmation modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#111827]">Delete account?</h3>
            <p className="mt-2 text-sm text-[#6B7280]">Your account and all data will be permanently deleted. This cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} disabled={deleting} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
