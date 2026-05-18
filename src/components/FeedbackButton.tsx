import { useState } from 'react'
import { track } from '../lib/analytics'

/**
 * Self-contained feedback modal.
 * Uses the same Formspree endpoint as the waitlist — responses tagged with type.
 * No external redirects. No Tally. No broken links.
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mnjrqgpw'

type Status = 'idle' | 'open' | 'submitting' | 'success' | 'error'

export function FeedbackButton() {
  const [status,   setStatus]   = useState<Status>('idle')
  const [result,   setResult]   = useState('')
  const [willing,  setWilling]  = useState('')
  const [improve,  setImprove]  = useState('')

  const open = () => {
    track('feedback_widget_opened')
    setStatus('open')
  }

  const close = () => {
    setStatus('idle')
    setResult('')
    setWilling('')
    setImprove('')
  }

  const submit = async () => {
    if (!result) return
    setStatus('submitting')
    track('feedback_submitted', { result, willing })
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _type: 'feedback',
          'Did it work?': result,
          'Would you pay?': willing,
          'What would improve it?': improve,
        }),
      })
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      {/* Floating trigger — bottom LEFT to avoid overlap with waitlist banner */}
      <button onClick={open} style={s.trigger}>
        💬 Feedback
      </button>

      {/* Modal overlay — click outside to close */}
      {status !== 'idle' && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && close()}>
          <div style={s.modal}>

            <div style={s.header}>
              <span style={s.title}>Quick feedback</span>
              <button onClick={close} style={s.closeBtn}>✕</button>
            </div>

            {status === 'success' ? (
              <div style={s.centered}>
                <div style={{ fontSize: 28 }}>🙏</div>
                <p style={s.successText}>Thank you — genuinely read by the founder.</p>
                <button onClick={close} style={s.submitBtn}>Close</button>
              </div>
            ) : status === 'error' ? (
              <div style={s.centered}>
                <div style={{ fontSize: 28 }}>⚠️</div>
                <p style={s.successText}>Something went wrong. Please try again.</p>
                <button onClick={() => setStatus('open')} style={s.submitBtn}>Try again</button>
              </div>
            ) : (
              <>
                <div style={s.field}>
                  <label style={s.label}>Did you get the result you wanted? *</label>
                  <div style={s.pills}>
                    {['Yes ✓', 'Almost', 'No'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setResult(opt)}
                        style={{ ...s.pill, ...(result === opt ? s.pillActive : {}) }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={s.field}>
                  <label style={s.label}>Would you pay for a Pro version?</label>
                  <div style={s.pills}>
                    {['Yes', 'Maybe', 'No'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setWilling(opt)}
                        style={{ ...s.pill, ...(willing === opt ? s.pillActive : {}) }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={s.field}>
                  <label style={s.label}>
                    What would make it better?{' '}
                    <span style={{ opacity: 0.35 }}>(optional)</span>
                  </label>
                  <textarea
                    value={improve}
                    onChange={e => setImprove(e.target.value)}
                    placeholder="Any feature, complaint, or idea..."
                    rows={3}
                    style={s.textarea}
                  />
                </div>

                <button
                  onClick={submit}
                  disabled={!result || status === 'submitting'}
                  style={{
                    ...s.submitBtn,
                    opacity: !result || status === 'submitting' ? 0.4 : 1,
                    cursor: !result || status === 'submitting' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {status === 'submitting' ? 'Sending…' : 'Send feedback →'}
                </button>

                <p style={s.hint}>Takes 20 seconds.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  trigger: {
    position: 'fixed',
    bottom: 24,
    left: 24,           // ← LEFT side, away from waitlist banner (bottom-right)
    zIndex: 9000,
    padding: '10px 18px',
    background: 'rgba(129,140,248,0.12)',
    color: '#818cf8',
    border: '1px solid rgba(129,140,248,0.35)',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    fontFamily: "'Inter', system-ui, sans-serif",
    whiteSpace: 'nowrap',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',  // anchors modal to bottom-left above button
    padding: '0 24px 80px',
  },
  modal: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '24px',
    width: '100%',
    maxWidth: 340,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.2px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    cursor: 'pointer',
    fontSize: 16,
    padding: 4,
    lineHeight: 1,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 500,
  },
  pills: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  pill: {
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.12s',
  },
  pillActive: {
    background: '#818cf8',
    borderColor: '#818cf8',
    color: '#0f172a',
    fontWeight: 700,
  },
  textarea: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: 1.5,
    boxSizing: 'border-box' as const,
    width: '100%',
  },
  submitBtn: {
    padding: '11px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#818cf8',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
    cursor: 'pointer',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    textAlign: 'center' as const,
    padding: '8px 0',
  },
  successText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
  },
  hint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center' as const,
    margin: '-6px 0 0',
  },
}
