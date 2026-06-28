import type { ProductPackageId } from "../../lib/productPackages"
import { PRICING_TIERS } from "../../lib/pricingPageContent"
import { DEFAULT_PRICING_LAYOUT, type PricingLayoutVariant } from "../../lib/pricingLayoutVariants"
import PricingLayoutBento from "./pricing/PricingLayoutBento"
import PricingLayoutCards from "./pricing/PricingLayoutCards"
import PricingLayoutCompare from "./pricing/PricingLayoutCompare"
import PricingLayoutRail from "./pricing/PricingLayoutRail"
import {
  PricingAddonsSection,
  PricingFeesSection,
  PricingFooter,
  PricingHeader,
  PricingHero,
  PricingPageShell,
  usePricingExpanded,
  usePricingResponsive,
  type PricingLayoutProps,
} from "./pricing/PricingShared"

type Props = {
  onBack: () => void
  onSignupWithPackage: (packageId: ProductPackageId) => void
  onHelpDecidingProduct?: () => void
  /** Preview only — production /pricing always uses `cards`. */
  layout?: PricingLayoutVariant
}

function PricingLayoutBody({ layout, ...props }: PricingLayoutProps & { layout: PricingLayoutVariant }) {
  switch (layout) {
    case "bento":
      return <PricingLayoutBento {...props} />
    case "rail":
      return <PricingLayoutRail {...props} />
    case "compare":
      return <PricingLayoutCompare {...props} />
    case "cards":
    default:
      return <PricingLayoutCards {...props} />
  }
}

export default function PricingPage({ onBack, onSignupWithPackage, onHelpDecidingProduct, layout = DEFAULT_PRICING_LAYOUT }: Props) {
  const isMobile = usePricingResponsive()
  const [expandedId, setExpandedId] = usePricingExpanded("office_manager_pro")

  const layoutProps: PricingLayoutProps = {
    tiers: PRICING_TIERS,
    expandedId,
    setExpandedId,
    onSignupWithPackage,
    isMobile,
  }

  return (
    <PricingPageShell>
      <PricingHeader onBack={onBack} onHelpDecidingProduct={onHelpDecidingProduct} isMobile={isMobile} />
      <PricingHero showLayoutPreviewLink={layout === DEFAULT_PRICING_LAYOUT} />
      <PricingLayoutBody layout={layout} {...layoutProps} />
      <PricingAddonsSection />
      <PricingFeesSection />
      <PricingFooter />
    </PricingPageShell>
  )
}
