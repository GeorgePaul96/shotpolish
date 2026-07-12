import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { phCapture } from '../lib/posthog'

// Sends a manual $pageview to PostHog on each route change. We disable PostHog's
// built-in capture_pageview (SPA-unaware) and drive it from the router instead.
// Pageviews are the broadest retention signal; they carry no PII and no cookies.
export default function PostHogPageview() {
  const location = useLocation()
  useEffect(() => {
    phCapture('$pageview', { path: location.pathname })
  }, [location.pathname])
  return null
}
