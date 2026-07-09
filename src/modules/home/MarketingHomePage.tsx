import { useEffect, useState } from "react"
import { MarketingPreviewStory } from "./marketing/MarketingPreviewStory"
import { MarketingPreviewShell } from "./marketing/MarketingPreviewShared"
import { July250PromoHomeBadge } from "../../components/July250PromoHomeBadge"
import { shouldShowHomepagePromoBanner, parseBillingPromoCodesStore } from "../../lib/billingPromoCodes"
import { BILLING_PROMO_CODES_KEY } from "../../types/billing-promo-codes"
import { supabase } from "../../lib/supabase"

type Props = {
  onLogin: () => void
  onAdminLogin: () => void
  onSignup: () => void
  onTrial: () => void
  onAboutUs: () => void
  onPricing: () => void
}

/** Production homepage — story scroll (no preview banner). */
export default function MarketingHomePage({ onLogin, onAdminLogin, onSignup, onTrial, onAboutUs, onPricing }: Props) {
  const [showJulyPromo, setShowJulyPromo] = useState(() =>
    shouldShowHomepagePromoBanner(parseBillingPromoCodesStore(null)),
  )

  useEffect(() => {
    if (!supabase) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", BILLING_PROMO_CODES_KEY)
          .maybeSingle()
        const store = parseBillingPromoCodesStore(error ? null : data?.value)
        setShowJulyPromo(shouldShowHomepagePromoBanner(store))
      } catch {
        /* keep optimistic default from useState */
      }
    })()
  }, [])

  return (
    <>
      <MarketingPreviewShell fullWidth hideFooter banner={null}>
        <MarketingPreviewStory
          topInsetPx={0}
          onLogin={onLogin}
          onTrial={onTrial}
          onPricing={onPricing}
          onAdminLogin={onAdminLogin}
          onAboutUs={onAboutUs}
        />
      </MarketingPreviewShell>
      <July250PromoHomeBadge visible={showJulyPromo} onSignup={onSignup} />
    </>
  )
}
