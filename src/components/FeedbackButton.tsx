import { useState } from 'react'
import { track } from '../lib/analytics'

/**
 * Self-contained feedback modal — no Tally, no external dependencies.
 * Responses are sent to Formspree (free, no backend needed).
 *
 * Setup (2 min):
 *   1. Go to https://formspree.io → New Form → name it "ShotPolish Feedback"
 *   2. Copy your form endpoint — looks like: https://formspree.io/f/xyzabcde
 *   3. Replace FORMSPREE_ENDPOINT below with that URL
 *
 * Formspree free tier: 50 submissions/month, responses emailed to you.
 * If you hit the limit, that's a good problem — upgrade or swap for another service.
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xvzyowzb'

type Status = 'idle' | 'open' | 'submitting' | 'success' | 'error'

export function FeedbackButton() {
  const [status, setStatus]   = useState<Status>('idle')
  const [result, setResult]   = useState('')
  const [willing, setWilling] = useState('')
  const [improve, setImprove] = useState('')

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
    if (!result) return          // result is required
    setStatus('submitting')
    track('feedback_submitted', { result, willing })

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
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
      {/* Floating trigger button */}
      <button onClick={open} style={styles.trigger}>
        💬 Feedback
      </button>

      {/* Modal overlay */}
      {(status === 'open' || status === 'submitting' || status === 'success' || status === 'error') && (
        <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && close()}>
          <div style={styles.modal}>

            {/* Header */}
            <div style={styles.header}>
              <span style={styles.title}>Quick feedback</span>
              <button onClick={close} style={styles.closeBtn}>✕</button>
            </div>

            {status === 'success' ? (
              <div style={styles.successBox}>
                <div style={{ fontSize: 32 }}>🙏</div>
                <div style={styles.successText}>Thank you — this genuinely helps.</div>
                <button onClick={close} style={styles.submitBtn}>Close</button>
              </div>
            ) : status === 'error' ? (
              <div style={styles.successBox}>
                <div style={{ fontSize: 32 }}>⚠️</div>
                <div style={styles.successText}>Something went wrong. Please try again.</div>
                <button onClick={() => setStatus('open')} style={styles.submitBtn}>Try again</button>
              </div>
            ) : (
              <>
                {/* Q1 */}
                <div style={styles.field}>
                  <label style={styles.label}>Did you get the result you wanted? *</label>
                  <div style={styles.pills}>
                    {['Yes', 'Almost', 'No'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setResult(opt)}
                        style={{ ...styles.pill, ...(result === opt ? styles.pillActive : {}) }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q2 */}
                <div style={styles.field}>
                  <label style={styles.label}>Would you pay for a Pro version?</label>
                  <div style={styles.pills}>
                    {['Yes', 'Maybe', 'No'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setWilling(opt)}
                        style={{ ...styles.pill, ...(willing === opt ? styles.pillActive : {}) }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q3 */}
                <div style={styles.field}>
                  <label style={styles.label}>What would make it better? <span style={{ opacity: 0.4 }}>(optional)</span></label>
                  <textarea
                    value={improve}
                    onChange={e => setImprove(e.target.value)}
                    placeholder="Any feature, complaint, or idea..."
                    rows={3}
                    style={styles.textarea}
                  />
                </div>

                <button
                  onClick={submit}
                  disabled={!result || status === 'submitting'}
                  style={{
                    ...styles.submitBtn,
                    opacity: (!result || status === 'submitting') ? 0.4 : 1,
                    cursor: (!result || status === 'submitting') ? 'not-allowed' : 'pointer',
                  }}
                >
                  {status === 'submitting' ? 'Sending…' : 'Send feedback →'}
                </button>

                <p style={styles.hint}>Takes 20 seconds. Genuinely read by the founder.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    position: 'fixed',
    bottom: 24,
    right: 24,
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
    fontFamily: "'Inter', system-ui, sans-serif",
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '0 24px 90px',
  },
  modal: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '24px',
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
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
    gap: 10,
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: 500,
  },
  pills: {
    display: 'flex',
    gap: 8,
  },
  pill: {
    padding: '7px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
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
    fontFamily: "'Inter', system-ui, sans-serif",
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: 1.5,
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
  },
  successBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
    textAlign: 'center',
  },
  successText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 1.5,
  },
  hint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center' as const,
    margin: '-8px 0 0',
  },
}
