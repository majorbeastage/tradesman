import { useCallback, useEffect, useState } from "react"
import type { MarketingPreviewVariant } from "../../lib/marketingPillars"
import { MarketingPreviewBento } from "./marketing/MarketingPreviewBento"
import { MarketingPreviewGrid } from "./marketing/MarketingPreviewGrid"
import { MarketingPreviewStory } from "./marketing/MarketingPreviewStory"
import { MarketingPreviewBanner, MarketingPreviewShell } from "./marketing/MarketingPreviewShared"

function parseVariant(pathname: string, search: string): MarketingPreviewVariant {
  const params = new URLSearchParams(search)
  const q = params.get("v")
  if (q === "bento" || q === "story" || q === "grid") return q
  const seg = pathname.replace(/^\/home-preview\/?/, "").split("/")[0]
  if (seg === "bento" || seg === "story" || seg === "grid") return seg
  return "bento"
}

type Props = {
  pathname?: string
  search?: string
  onNavigate?: (path: string) => void
  onLogin?: () => void
  onSignup?: () => void
  onTrial?: () => void
  onPricing?: () => void
  onAdminLogin?: () => void
}

export function MarketingHomePreviewPage({
  pathname = typeof window !== "undefined" ? window.location.pathname : "/home-preview",
  search = typeof window !== "undefined" ? window.location.search : "",
  onNavigate,
  onLogin,
  onSignup,
  onTrial,
  onPricing,
  onAdminLogin,
}: Props) {
  const [variant, setVariantState] = useState<MarketingPreviewVariant>(() => parseVariant(pathname, search))

  useEffect(() => {
    setVariantState(parseVariant(pathname, search))
  }, [pathname, search])

  const setVariant = useCallback(
    (v: MarketingPreviewVariant) => {
      setVariantState(v)
      const next = `/home-preview?v=${v}`
      if (onNavigate) onNavigate(next)
      else if (typeof window !== "undefined") {
        window.history.replaceState(null, "", next)
      }
    },
    [onNavigate],
  )

  const goPricing = onPricing ?? (() => (onNavigate ? onNavigate("/pricing") : (window.location.href = "/pricing")))
  const goLogin = onLogin
  const goSignup = onSignup ?? (() => (onNavigate ? onNavigate("/signup") : (window.location.href = "/signup")))
  const goTrial = onTrial

  const body =
    variant === "story" ? (
      <MarketingPreviewStory
        onLogin={goLogin}
        onSignup={goSignup}
        onTrial={goTrial}
        onPricing={goPricing}
        onAdminLogin={onAdminLogin}
        onAboutUs={() => (onNavigate ? onNavigate("/about") : (window.location.href = "/about"))}
      />
    ) : variant === "grid" ? (
      <MarketingPreviewGrid onLogin={goLogin} onSignup={goSignup} onTrial={goTrial} onPricing={goPricing} />
    ) : (
      <MarketingPreviewBento onLogin={goLogin} onSignup={goSignup} onTrial={goTrial} onPricing={goPricing} />
    )

  return (
    <MarketingPreviewShell
      banner={<MarketingPreviewBanner variant={variant} onVariantChange={setVariant} />}
      fullWidth={variant === "story"}
      hideFooter={variant === "story"}
    >
      {body}
    </MarketingPreviewShell>
  )
}

export default MarketingHomePreviewPage
