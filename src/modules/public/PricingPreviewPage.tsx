import { useCallback, useEffect, useState } from "react"
import type { ProductPackageId } from "../../lib/productPackages"
import {
  DEFAULT_PRICING_LAYOUT,
  PRICING_LAYOUT_VARIANTS,
  type PricingLayoutVariant,
  pricingLayoutFromQueryParam,
} from "../../lib/pricingLayoutVariants"
import { theme } from "../../styles/theme"
import PricingPage from "./PricingPage"

type Props = {
  onBack: () => void
  onSignupWithPackage: (packageId: ProductPackageId) => void
  onHelpDecidingProduct?: () => void
}

/** Local layout lab — switch variants without affecting live /pricing. */
export default function PricingPreviewPage({ onBack, onSignupWithPackage, onHelpDecidingProduct }: Props) {
  const [layout, setLayout] = useState<PricingLayoutVariant>(() =>
    typeof window !== "undefined"
      ? pricingLayoutFromQueryParam(new URLSearchParams(window.location.search).get("layout"))
      : DEFAULT_PRICING_LAYOUT,
  )

  const selectLayout = useCallback((next: PricingLayoutVariant) => {
    setLayout(next)
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (next === DEFAULT_PRICING_LAYOUT) url.searchParams.delete("layout")
    else url.searchParams.set("layout", next)
    window.history.replaceState(null, "", url.pathname + url.search)
  }, [])

  useEffect(() => {
    const onPop = () => {
      setLayout(pricingLayoutFromQueryParam(new URLSearchParams(window.location.search).get("layout")))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#0f172a",
          color: "#e2e8f0",
          padding: "10px clamp(12px, 3vw, 24px)",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #334155",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.45, maxWidth: 420 }}>
          Pricing layout previews · Cards is live on{" "}
          <a href="/pricing" style={{ color: "#fdba74", fontWeight: 700 }}>
            /pricing
          </a>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRICING_LAYOUT_VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.blurb}
              onClick={() => selectLayout(v.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
                background: layout === v.id ? theme.primary : "#334155",
                color: "#fff",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <PricingPage
        onBack={onBack}
        onSignupWithPackage={onSignupWithPackage}
        onHelpDecidingProduct={onHelpDecidingProduct}
        layout={layout}
      />
    </>
  )
}
