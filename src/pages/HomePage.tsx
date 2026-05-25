import { HeroSection } from '../components/HeroSection'
import { LivePreviewSection } from '../components/LivePreviewSection'
import { FeaturesSection } from '../components/FeaturesSection'
import { FooterSection } from '../components/FooterSection'
import { CtaSection } from '../components/CtaSection'

export function HomePage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <HeroSection />
      <LivePreviewSection />
      <FeaturesSection />
      <CtaSection />
      <FooterSection />
    </main>
  )
}
