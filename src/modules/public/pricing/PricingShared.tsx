import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import logo from "../../../assets/logo.png"
import { CopyrightVersionFooter } from "../../../components/CopyrightVersionFooter"
import { PublicLegalNav } from "../PublicLegalNav"
import { theme } from "../../../styles/theme"
import type { ProductPackageId } from "../../../lib/productPackages"
import {
  PRICING_ADD_ONS,
  formatPrice,
  type PricingFeatureGroup,
  type PricingTierContent,
} from "../../../lib/pricingPageContent"

export type PricingLayoutProps = {
  tiers: PricingTierContent[]
  expandedId: ProductPackageId | null
  setExpandedId: (id: ProductPackageId | null) => void
  onSignupWithPackage: (packageId: ProductPackageId) => void
  isMobile: boolean
}

export function usePricingResponsive() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isMobile
}

/** mobile: 1 col · tablet: 3×2 · desktop: 6 packages on one row */
export type PricingGridBreakpoint = "mobile" | "tablet" | "desktop"

export function usePricingGridBreakpoint(): PricingGridBreakpoint {
  const [breakpoint, setBreakpoint] = useState<PricingGridBreakpoint>("desktop")
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w <= 768) setBreakpoint("mobile")
      else if (w <= 1080) setBreakpoint("tablet")
      else setBreakpoint("desktop")
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return breakpoint
}

export function usePricingExpanded(defaultId: ProductPackageId = "office_manager_pro") {
  return useState<ProductPackageId | null>(defaultId)
}

export function PricingStyles() {
  return (
    <style>{`
      @keyframes pricingGlow {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
    `}</style>
  )
}

export function PricingPageShell({ children }: { children: ReactNode }) {
  return (
    <div style={pageShellStyle}>
      <PricingStyles />
      {children}
    </div>
  )
}

export function PricingHeader({
  onBack,
  onHelpDecidingProduct,
  isMobile,
}: {
  onBack: () => void
  onHelpDecidingProduct?: () => void
  isMobile: boolean
}) {
  return (
    <header style={headerStyle}>
      <button type="button" onClick={onBack} style={logoBtnStyle} aria-label="Back to home">
        <img src={logo} alt="Tradesman" style={{ height: isMobile ? 44 : 52, width: "auto" }} />
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={ghostBtnStyle}>
          ← Home
        </button>
        {onHelpDecidingProduct ? (
          <button type="button" onClick={onHelpDecidingProduct} style={outlineBtnStyle}>
            Help me choose
          </button>
        ) : null}
      </div>
    </header>
  )
}

export function PricingHero() {
  return (
    <section style={heroStyle}>
      <p style={eyebrowStyle}>Pricing</p>
      <h1 style={heroTitleStyle}>Plans that scale with your crew</h1>
      <p style={heroSubStyle}>
        We will work with you on specific requirements — contact us if you need features beyond these packages. Each plan
        includes usage limits in the package details; overages are billed transparently (see below).
      </p>
    </section>
  )
}

export function PricingAddonsSection() {
  return (
    <section style={sectionStyle}>
      <div style={addonsCardStyle}>
        <h2 style={sectionHeadingStyle}>Additional users &amp; office managers</h2>
        <ul style={addonsListStyle}>
          {PRICING_ADD_ONS.map((addon) => (
            <li key={addon.label} style={addonRowStyle}>
              <span>{addon.label}</span>
              <strong>{formatPrice(addon.price)}/mo</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function PricingFeesSection() {
  return (
    <section style={{ ...sectionStyle, paddingTop: 0 }}>
      <FeesDisclaimer />
    </section>
  )
}

export function PricingFooter() {
  return (
    <footer style={footerStyle}>
      <PublicLegalNav />
      <CopyrightVersionFooter variant="default" style={{ borderTop: `1px solid ${theme.border}`, marginTop: 12, paddingTop: 12 }} />
    </footer>
  )
}

export function TierCard({
  tier,
  expanded,
  onToggle,
  onSignup,
  subdued = false,
  compact = false,
  compareSelected = false,
  onCompareToggle,
}: {
  tier: PricingTierContent
  expanded: boolean
  onToggle: () => void
  onSignup: () => void
  subdued?: boolean
  compact?: boolean
  compareSelected?: boolean
  onCompareToggle?: () => void
}) {
  const featured = tier.featured === true && !subdued
  const isStarter = tier.id === "estimate_tools_only" || subdued

  const body = (
    <article
      style={{
        ...tierCardInnerStyle,
        ...(isStarter ? tierCardSubduedStyle : {}),
        ...(compact ? { padding: "14px 12px" } : {}),
      }}
    >
      {featured ? (
        <div style={{ ...popularBadgeWrapStyle, ...(compact ? { top: -8, right: 8 } : {}) }}>
          <span style={{ ...popularBadgeStyle, ...(compact ? { fontSize: 9, padding: "4px 8px" } : {}) }}>Most popular</span>
        </div>
      ) : null}

      {isStarter ? (
        <p style={{ ...starterEyebrowStyle, marginTop: featured ? 8 : 0, ...(compact ? { fontSize: 10 } : {}) }}>Starter</p>
      ) : (
        <p style={{ ...eyebrowStyle, marginTop: featured ? 8 : 0, ...(compact ? { fontSize: 10, marginBottom: 4 } : {}) }}>{tier.seats}</p>
      )}

      <h2
        style={{
          margin: "0 0 8px",
          fontSize: isStarter ? (compact ? 14 : 17) : compact ? 15 : 20,
          fontWeight: isStarter ? 600 : 900,
          color: isStarter ? "#475569" : theme.charcoal,
          lineHeight: 1.25,
        }}
      >
        {tier.title}
      </h2>
      {!isStarter && (!compact || expanded) ? (
        <p style={{ margin: "0 0 10px", fontSize: compact ? 12 : 14, lineHeight: 1.45, color: "#64748b" }}>{tier.tagline}</p>
      ) : isStarter ? (
        <p style={{ margin: "0 0 10px", fontSize: compact ? 12 : 13, lineHeight: 1.45, color: "#94a3b8" }}>{tier.tagline}</p>
      ) : null}

      <p
        style={{
          margin: 0,
          fontSize: isStarter ? (compact ? 22 : 26) : compact ? 24 : 34,
          fontWeight: isStarter ? 700 : 900,
          color: isStarter ? "#64748b" : theme.charcoal,
          letterSpacing: -0.5,
        }}
      >
        {formatPrice(tier.priceMonthly)}
        <span style={{ fontSize: compact ? 11 : 14, fontWeight: 600, color: "#94a3b8" }}>/mo</span>
      </p>
      <p style={{ margin: "4px 0 10px", fontSize: compact ? 10 : 12, color: "#94a3b8" }}>+ taxes &amp; fees*</p>

      {(!compact || expanded) ? <UsageFootnote text={tier.usageDisclaimer} compact={compact} /> : null}

      {tier.chooseOneTools?.length && (!compact || expanded) ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 12, color: "#64748b" }}>Choose one tool</p>
          <div style={toolChipWrapStyle}>
            {tier.chooseOneTools.map((tool) => (
              <span key={tool} style={{ ...toolChipStyle, fontSize: 12, fontWeight: 500 }}>
                {tool}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!expanded && !compact && tier.buildsOnLowerTiers && tier.tierAdds?.length ? (
        <ul style={previewListStyle}>
          {tier.tierAdds
            .flatMap((g) => g.items)
            .slice(0, 3)
            .map((item) => (
              <li key={item}>{item}</li>
            ))}
        </ul>
      ) : null}

      <ExpandableDetails
        expanded={expanded}
        onToggle={onToggle}
        label={expanded ? "Hide details" : compact ? "Details" : "View all features"}
        compact={compact}
      >
        {tier.buildsOnLowerTiers ? (
          <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: theme.primary }}>
            Includes all items from lower tiers, plus:
          </p>
        ) : null}
        <FeatureGroups groups={tier.tierAdds?.length ? tier.tierAdds : tier.featureGroups} />
      </ExpandableDetails>

      {onCompareToggle ? (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            fontSize: compact ? 11 : 12,
            fontWeight: 600,
            color: compareSelected ? theme.primary : "#64748b",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={compareSelected}
            onChange={onCompareToggle}
            style={{ width: 16, height: 16, accentColor: theme.primary }}
          />
          Compare
        </label>
      ) : null}

      <button
        type="button"
        onClick={onSignup}
        style={{
          ...(isStarter ? neutralBtnStyle : primaryBtnStyle),
          width: "100%",
          marginTop: "auto",
          ...(compact ? { padding: "10px 12px", fontSize: 12 } : {}),
        }}
      >
        Sign up
      </button>
    </article>
  )

  if (featured) {
    return <div style={featuredWrapStyle}>{body}</div>
  }

  return body
}

function FeatureGroups({ groups }: { groups: PricingFeatureGroup[] }) {
  if (!groups.length) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map((group) => (
        <div key={group.title}>
          <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 13, color: theme.charcoal }}>{group.title}</p>
          <ul style={featureListStyle}>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function UsageFootnote({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div style={{ ...usageFootnoteStyle, ...(compact ? { padding: "8px 10px", fontSize: 11 } : {}) }}>
      <strong style={{ color: theme.charcoal }}>Usage: </strong>
      {text}
    </div>
  )
}

function ExpandableDetails({
  expanded,
  onToggle,
  label,
  compact,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  label?: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <div style={{ marginTop: compact ? 8 : 12, flex: 1 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ ...expandBtnStyle, ...(compact ? { fontSize: 11, padding: "4px 0" } : {}) }}
        aria-expanded={expanded}
      >
        {label ?? (expanded ? "Hide details" : "View details")}
        <span style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </button>
      <div
        style={{
          maxHeight: expanded ? 2000 : 0,
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.35s ease, opacity 0.25s ease",
        }}
      >
        <div style={{ paddingTop: 12 }}>{children}</div>
      </div>
    </div>
  )
}

function FeesDisclaimer() {
  return (
    <div style={disclaimerStyle}>
      <h2 style={{ ...sectionHeadingStyle, fontSize: 18 }}>* Additional Fees, Usage, and Overage Information</h2>
      <DisclaimerBlock title="Payment Processing Fees">
        All payments are subject to third-party processing fees. These fees are determined by the payment processor and may vary based on
        payment method, card type, and issuing bank. Tradesman Systems does not control these fees and they may be passed through where
        applicable.
      </DisclaimerBlock>
      <DisclaimerBlock title="Taxes">
        Applicable sales tax may be added based on the customer&apos;s billing location and local or state regulations. Tax rates vary by
        jurisdiction and are not controlled by Tradesman Systems.
      </DisclaimerBlock>
      <DisclaimerBlock title="Communication Usage & Overage Fees">
        Each package includes a monthly allocation of voice minutes and SMS messages. Any usage exceeding the included limits will be billed
        as follows:
        <ul style={featureListStyle}>
          <li>SMS Messages: $0.03 per message</li>
          <li>Voice Usage: $0.05 per minute</li>
        </ul>
      </DisclaimerBlock>
      <p style={{ margin: "16px 0 8px", fontWeight: 800, fontSize: 14, color: theme.charcoal }}>Estimated Cost Breakdown (for transparency)</p>
      <div style={{ overflowX: "auto" }}>
        <table style={feeTableStyle}>
          <thead>
            <tr style={{ background: "#e2e8f0" }}>
              <th style={feeThStyle}>Type</th>
              <th style={feeThStyle}>Estimated Cost</th>
              <th style={feeThStyle}>Customer Charge</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={feeTdStyle}>SMS</td>
              <td style={feeTdStyle}>~$0.007</td>
              <td style={feeTdStyle}>$0.02–$0.03</td>
            </tr>
            <tr>
              <td style={feeTdStyle}>Voice</td>
              <td style={feeTdStyle}>~$0.015</td>
              <td style={feeTdStyle}>$0.04–$0.06</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
        Overage usage is billed monthly and is subject to change based on third-party provider rates.
      </p>
      <DisclaimerBlock title="Carrier & Bank Fees">
        Additional charges may apply from mobile carriers or financial institutions, including SMS delivery fees or bank-related charges.
        These fees are determined by third parties and are outside the control of Tradesman Systems.
      </DisclaimerBlock>
    </div>
  )
}

function DisclaimerBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 14, color: theme.charcoal }}>{title}</p>
      <div style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#475569" }}>{children}</div>
    </div>
  )
}

export const pageShellStyle: CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  boxSizing: "border-box",
  background: "linear-gradient(180deg, #fafafa 0%, #f3f4f6 40%, #fafafa 100%)",
  color: theme.text,
}

export const headerStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "20px clamp(16px, 3vw, 48px) 0",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
}

export const sectionStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "16px clamp(16px, 3vw, 48px)",
}

const logoBtnStyle: CSSProperties = { border: "none", background: "transparent", padding: 0, cursor: "pointer" }
const ghostBtnStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.charcoal,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}
const outlineBtnStyle: CSSProperties = { ...ghostBtnStyle, borderColor: theme.primary, color: theme.primary }

const heroStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "28px clamp(16px, 3vw, 48px) 20px",
}

const eyebrowStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 12,
  fontWeight: 800,
  color: theme.primary,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
}

const starterEyebrowStyle: CSSProperties = {
  ...eyebrowStyle,
  color: "#94a3b8",
  fontWeight: 700,
}

const heroTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(2rem, 4.5vw, 2.75rem)",
  fontWeight: 900,
  letterSpacing: -1,
  lineHeight: 1.08,
  color: theme.charcoal,
  maxWidth: 900,
}

const heroSubStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(1rem, 2vw, 1.1rem)",
  lineHeight: 1.65,
  color: "#475569",
  maxWidth: 900,
}

const tierCardInnerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  padding: 22,
  borderRadius: 16,
  background: "#fff",
  border: `1px solid ${theme.border}`,
  boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
  position: "relative",
}

const tierCardSubduedStyle: CSSProperties = {
  background: "#fafafa",
  borderColor: "#e2e8f0",
  boxShadow: "0 4px 16px rgba(15,23,42,0.03)",
}

const featuredWrapStyle: CSSProperties = {
  padding: 3,
  borderRadius: 19,
  background: "linear-gradient(120deg, #fb923c, #f97316, #fbbf24, #ea580c, #fb923c)",
  backgroundSize: "280% 280%",
  animation: "pricingGlow 6s ease infinite",
  height: "100%",
}

const popularBadgeWrapStyle: CSSProperties = { position: "absolute", top: -10, right: 16 }
const popularBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "5px 12px",
  borderRadius: 999,
  background: theme.primary,
  color: "#fff",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  boxShadow: "0 4px 14px rgba(249,115,22,0.35)",
}

const toolChipWrapStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 }
const toolChipStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "#f1f5f9",
  border: `1px solid #e2e8f0`,
  fontSize: 13,
  fontWeight: 600,
  color: "#64748b",
  lineHeight: 1.35,
}

const usageFootnoteStyle: CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#475569",
}

const previewListStyle: CSSProperties = {
  margin: "0 0 4px",
  paddingLeft: 18,
  fontSize: 13,
  lineHeight: 1.5,
  color: "#64748b",
}

const featureListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 14,
  lineHeight: 1.55,
  color: "#334155",
}

const expandBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "8px 0",
  border: "none",
  background: "transparent",
  color: theme.primary,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}

const primaryBtnStyle: CSSProperties = {
  marginTop: 16,
  padding: "12px 18px",
  borderRadius: 12,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(249,115,22,0.25)",
}

const neutralBtnStyle: CSSProperties = {
  marginTop: 16,
  padding: "12px 18px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#64748b",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}

const addonsCardStyle: CSSProperties = {
  padding: 24,
  borderRadius: 16,
  background: "#fff",
  border: `1px solid ${theme.border}`,
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
}

const sectionHeadingStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 20,
  fontWeight: 900,
  color: theme.charcoal,
}

const addonsListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

const addonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 10,
  background: "#f8fafc",
  border: `1px solid ${theme.border}`,
  fontSize: 14,
  color: theme.text,
}

const disclaimerStyle: CSSProperties = {
  padding: 24,
  borderRadius: 16,
  background: "#fff",
  border: `1px solid ${theme.border}`,
  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
}

const feeTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  background: "#fff",
}

const feeThStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #94a3b8",
  color: "#0f172a",
  fontWeight: 700,
}

const feeTdStyle: CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid #cbd5e1",
  color: "#0f172a",
}

const footerStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "32px clamp(16px, 3vw, 48px) 56px",
}
