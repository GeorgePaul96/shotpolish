import { useState } from 'react'
import { track } from '../lib/analytics'

/**
 * Floating feedback button — bottom right corner.
 * Links to a Tally form. Replace TALLY-FORM-ID with your form ID from tally.so.
 *
 * To create the form (10 min):
 *   1. Go to tally.so → New form
 *   2. Add questions:
 *      - "What brought you here today?" (short text)
 *      - "Did you get the result you wanted?" (Yes / No / Almost)
 *      - "Would you pay for this tool?" (Yes / No / Maybe)
 *      - "What would make it better?" (long text, optional)
 *   3. Copy the form ID from the share URL: tally.so/r/FORM-ID
 *   4. Replace TALLY-FORM-ID below
 */
const TALLY_FORM_ID = 'TALLY-FORM-ID'

export function FeedbackButton() {
  const [hovered, setHovered] = useState(false)

  const handleClick = () => {
    track('feedback_widget_opened')
    window.open(`https://tally.so/r/${TALLY_FORM_ID}`, '_blank', 'noopener')
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        padding: hovered ? '10px 20px' : '10px 16px',
        background: hovered ? '#818cf8' : 'rgba(129,140,248,0.15)',
        color: hovered ? '#0f172a' : '#818cf8',
        border: '1px solid #818cf8',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        backdropFilter: 'blur(8px)',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
      title="Share feedback"
    >
      {hovered ? 'Share feedback →' : '💬 Feedback'}
    </button>
  )
}
