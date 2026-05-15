/**
 * Minimal legal pages — Privacy Policy and Terms of Service.
 *
 * These are intentionally simple. You are not a lawyer and neither is this file.
 * For a no-auth, no-payment, no-backend MVP that processes nothing server-side,
 * this is sufficient to launch. Update when you add auth or payments.
 *
 * Usage in App.tsx:
 *   Show based on URL hash: window.location.hash === '#privacy'
 */

const COMPANY_NAME = 'ShotPolish'
const CONTACT_EMAIL = 'shotpolish.app@gmail.com' 
const EFFECTIVE_DATE = '2025'

export function PrivacyPolicy() {
  return (
    <div style={s.page}>
      <div style={s.content}>
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.meta}>Effective: {EFFECTIVE_DATE}</p>

        <h2 style={s.h2}>What we collect</h2>
        <p style={s.p}>
          {COMPANY_NAME} does not collect or store your screenshots or exported images.
          All image processing happens entirely in your browser. No image data is ever
          sent to our servers.
        </p>
        <p style={s.p}>
          We use Plausible Analytics, a privacy-focused analytics tool, to collect
          anonymous usage data: page views, referral sources, country, device type,
          and product events (uploads, exports). Plausible does not use cookies and
          does not collect personally identifiable information.
        </p>

        <h2 style={s.h2}>Cookies</h2>
        <p style={s.p}>
          We do not use tracking cookies. We store a single anonymous identifier
          in your browser's local storage to understand returning usage patterns.
          This contains no personal information and can be cleared at any time
          by clearing your browser storage.
        </p>

        <h2 style={s.h2}>Third-party services</h2>
        <p style={s.p}>
          We use Plausible Analytics (plausible.io). Their privacy policy is
          available at plausible.io/privacy.
        </p>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}>Questions? Email us at {CONTACT_EMAIL}</p>
      </div>
    </div>
  )
}

export function TermsOfService() {
  return (
    <div style={s.page}>
      <div style={s.content}>
        <h1 style={s.h1}>Terms of Service</h1>
        <p style={s.meta}>Effective: {EFFECTIVE_DATE}</p>

        <h2 style={s.h2}>Use of the service</h2>
        <p style={s.p}>
          {COMPANY_NAME} is provided free during the beta period. You may use it
          for personal and commercial purposes. You retain all rights to screenshots
          and images you process with the tool.
        </p>

        <h2 style={s.h2}>Prohibited use</h2>
        <p style={s.p}>
          You may not use {COMPANY_NAME} to process images that are illegal,
          defamatory, or infringe on the rights of others.
        </p>

        <h2 style={s.h2}>Disclaimer</h2>
        <p style={s.p}>
          {COMPANY_NAME} is provided "as is" without warranties of any kind.
          We are not liable for any damages arising from use of the service.
        </p>

        <h2 style={s.h2}>Changes</h2>
        <p style={s.p}>
          We may update these terms as the product evolves. Continued use
          after changes constitutes acceptance.
        </p>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}>Questions? Email us at {CONTACT_EMAIL}</p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#080c14',
    padding: '60px 20px',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  content: {
    maxWidth: 640,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  h1: { fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 16 },
  p:  { fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.5)' },
  meta: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },
}
