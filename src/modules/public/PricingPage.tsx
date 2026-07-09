import type { ProductPackageId } from "../../lib/productPackages"
import { PRICING_TIERS } from "../../lib/pricingPageContent"
import PricingLayoutCards from "./pricing/PricingLayoutCards"
import {
  PricingAddonsSection,
  PricingFeesSection,
  PricingFooter,
  PricingHeader,
  PricingHero,
  PricingPageShell,
  usePricingExpanded,
  usePricingResponsive,
} from "./pricing/PricingShared"

type Props = {
  onBack: () => void
  onSignup: () => void
  onSignupWithPackage: (packageId: ProductPackageId) => void
  onHelpDecidingProduct?: () => void
}

export default function PricingPage({ onBack, onSignup, onSignupWithPackage, onHelpDecidingProduct }: Props) {
  const isMobile = usePricingResponsive()
  const [expandedId, setExpandedId] = usePricingExpanded("office_manager_pro")

  return (
    <PricingPageShell>
      <PricingHeader onBack={onBack} onSignup={onSignup} onHelpDecidingProduct={onHelpDecidingProduct} isMobile={isMobile} />
      <PricingHero onSignup={onSignup} />
      <PricingLayoutCards
        tiers={PRICING_TIERS}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        onSignupWithPackage={onSignupWithPackage}
        isMobile={isMobile}
      />
      <PricingAddonsSection />
      <PricingFeesSection />
      <PricingFooter />
    </PricingPageShell>
  )
}
