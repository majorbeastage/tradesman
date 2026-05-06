import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { PRODUCT_PACKAGES, type ProductPackageId } from "../../lib/productPackages"

type Props = {
  onBack: () => void
  /** Opens signup with the selected package id stored for the form. */
  onSignupWithPackage: (packageId: ProductPackageId) => void
}

const DEFAULT_EXPANDED_ID: ProductPackageId = "office_manager_pro"

/** Full-featured tiers shown as large cards; Estimate Tools only uses a compact callout below. */
const MAIN_PRODUCT_PACKAGES = PRODUCT_PACKAGES.filter((p) => p.id !== "estimate_tools_only")
const ESTIMATE_TOOLS_PACKAGE = PRODUCT_PACKAGES.find((p) => p.id === "estimate_tools_only")

const ulStyle: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 22,
  lineHeight: 1.55,
  fontSize: 14,
  color: theme.text,
}

const h2Style: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  color: theme.charcoal,
  fontWeight: 800,
}

const btnPrimary: CSSProperties = {
  marginTop: 14,
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
}

const PACKAGE_SUMMARY: Record<ProductPackageId, string> = {
  estimate_tools_only:
    "Estimate Tools workspace only — build and send estimates; Payments & support included. No Customers or Scheduling tabs.",
  base: "Soft leads (5/mo), 1 user, conversations, estimates & calendar with receipts.",
  office_manager_entry: "1 office manager + 1 user, internal messaging, map view & calendar control.",
  office_manager_pro: "10 leads/mo, 1 OM + 4 users, full modules plus customer database — balanced for growing teams.",
  office_manager_elite: "Max leads (25/mo), 2 OMs + 8 users, top-tier comms — built for larger operations.",
}

const PACKAGE_INCLUDES: Record<ProductPackageId, ReactNode> = {
  estimate_tools_only: (
    <ul style={ulStyle}>
      <li>Estimates Tool (quotes, templates, customer-ready attachments)</li>
      <li>Payments tab (subscription &amp; customer payment setup)</li>
      <li>Web Support &amp; Tech Support</li>
      <li>Account (My T)</li>
      <li style={{ marginTop: 8, fontSize: 13, color: "#64748b", listStyle: "none", paddingLeft: 0 }}>
        Does not include Customers or Scheduling modules.
      </li>
    </ul>
  ),
  base: (
    <ul style={ulStyle}>
      <li>
        Soft Lead Capturing Service
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 5 Paid Qualified Leads per month**</li>
        </ul>
      </li>
      <li>1 User Sign-In</li>
      <li>
        Customer Conversations Module
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month***</li>
        </ul>
      </li>
      <li>
        Estimates Module
        <ul style={{ marginTop: 6 }}>
          <li>Custom Quote Attachment for sending to customers</li>
        </ul>
      </li>
      <li>
        Calendar Module
        <ul style={{ marginTop: 6 }}>
          <li>Receipt option for customer delivery and database storage</li>
        </ul>
      </li>
    </ul>
  ),
  office_manager_entry: (
    <ul style={ulStyle}>
      <li>
        Soft Lead Capturing Service
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 5 Paid Qualified Leads per month**</li>
        </ul>
      </li>
      <li>
        1 Office Manager Sign-In and 1 User Sign-In
        <ul style={{ marginTop: 6 }}>
          <li>Management customization for user view</li>
        </ul>
      </li>
      <li>
        Customer Conversations Module
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month***</li>
          <li>Internal Conversations Module</li>
        </ul>
      </li>
      <li>
        Estimates Module
        <ul style={{ marginTop: 6 }}>
          <li>Custom Quote Attachment for sending to customers</li>
        </ul>
      </li>
      <li>
        Calendar Module
        <ul style={{ marginTop: 6 }}>
          <li>Control of all user calendars and map view module*</li>
          <li>Receipt option for customer delivery and database storage</li>
        </ul>
      </li>
    </ul>
  ),
  office_manager_pro: (
    <ul style={ulStyle}>
      <li>
        Mid Tier Lead Capturing
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 10 Paid Qualified Leads per month**</li>
        </ul>
      </li>
      <li>
        1 Office Manager Sign-In and 4 User Sign-Ins
        <ul style={{ marginTop: 6 }}>
          <li>Management customization for user views</li>
        </ul>
      </li>
      <li>
        Customer Conversations Module
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month for Office Manager***</li>
          <li>Limited to 200 Voice Minutes and 200 SMS Messages per month per user***</li>
          <li>Internal Conversations Module</li>
        </ul>
      </li>
      <li>
        Estimates Module
        <ul style={{ marginTop: 6 }}>
          <li>Custom Quote Attachment for sending to customers</li>
        </ul>
      </li>
      <li>
        Calendar Module
        <ul style={{ marginTop: 6 }}>
          <li>Control of all user calendars and map view module</li>
          <li>Receipt option for customer delivery and database storage</li>
        </ul>
      </li>
      <li>Customer Database</li>
    </ul>
  ),
  office_manager_elite: (
    <ul style={ulStyle}>
      <li>
        Max Tier Lead Capturing
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 25 Paid Qualified Leads per month**</li>
        </ul>
      </li>
      <li>
        2 Office Manager Sign-Ins and 8 User Sign-Ins
        <ul style={{ marginTop: 6 }}>
          <li>Management customization for user views</li>
        </ul>
      </li>
      <li>
        Customer Conversations Module
        <ul style={{ marginTop: 6 }}>
          <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month for Office Manager***</li>
          <li>Limited to 200 Voice Minutes and 200 SMS Messages per month per user***</li>
          <li>Internal Conversations Module</li>
        </ul>
      </li>
      <li>
        Estimates Module
        <ul style={{ marginTop: 6 }}>
          <li>Custom Quote Attachment for sending to customers</li>
        </ul>
      </li>
      <li>
        Calendar Module
        <ul style={{ marginTop: 6 }}>
          <li>Control of all user calendars and map view module*</li>
          <li>Receipt option for customer delivery and database storage</li>
        </ul>
      </li>
      <li>Customer Database</li>
    </ul>
  ),
}

function packageExpanded(
  pkg: ProductPackageId,
  opts: { lockedId: ProductPackageId | null; hoverId: ProductPackageId | null; supportsHover: boolean },
): boolean {
  if (opts.lockedId !== null) return pkg === opts.lockedId
  if (opts.supportsHover && opts.hoverId !== null) return pkg === opts.hoverId
  return pkg === DEFAULT_EXPANDED_ID
}

export default function PricingPage({ onBack, onSignupWithPackage }: Props) {
  const [supportsHover, setSupportsHover] = useState(false)
  const [hoverId, setHoverId] = useState<ProductPackageId | null>(null)
  /** When set, expansion follows the click only — hover does not switch cards. */
  const [lockedId, setLockedId] = useState<ProductPackageId | null>(null)

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)")
    const update = () => setSupportsHover(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: theme.background }}>
      <style>{`
        @keyframes pricingFeaturedBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pricingBestValueShine {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.92; transform: scale(1.02); }
        }
      `}</style>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 18px 48px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginBottom: 20,
            padding: "10px 16px",
            background: "transparent",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.text,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ← Back
        </button>

        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 900, color: theme.charcoal }}>Pricing</h1>
        <p style={{ margin: "0 0 8px", fontSize: 15, lineHeight: 1.6, color: theme.text, maxWidth: 720 }}>
          <strong>Pricing packages</strong> – We will work with you for specific requirements. Please contact us if you require features or
          functionality not included in the packages below.
        </p>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 13,
            fontWeight: 700,
            color: theme.primary,
            letterSpacing: 0.02,
          }}
        >
          Hover or tap a package to expand details. Click a card to keep it open while you compare.
        </p>

        {ESTIMATE_TOOLS_PACKAGE ? (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "#fafafa",
              fontSize: 13,
              color: theme.text,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: theme.charcoal }}>{ESTIMATE_TOOLS_PACKAGE.title}</strong>
            <span style={{ marginLeft: 8, fontWeight: 700 }}>{ESTIMATE_TOOLS_PACKAGE.priceLine.replace(/\s*\*+\s*$/, "").trim()}</span>
            <p style={{ margin: "8px 0 10px", opacity: 0.92 }}>{PACKAGE_SUMMARY.estimate_tools_only}</p>
            <button
              type="button"
              onClick={() => onSignupWithPackage("estimate_tools_only")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Sign up — Estimate Tools only
            </button>
          </div>
        ) : null}

        {MAIN_PRODUCT_PACKAGES.map((pkg) => {
          const expanded = packageExpanded(pkg.id, { lockedId, hoverId, supportsHover })
          const isFeatured = pkg.id === "office_manager_pro"

          const innerCard: CSSProperties = {
            padding: 20,
            borderRadius: 14,
            border: `1px solid ${expanded ? theme.primary : theme.border}`,
            background: "#fff",
            boxShadow: expanded ? "0 10px 28px rgba(31,41,51,0.12)" : "0 6px 24px rgba(0,0,0,0.06)",
            transform: expanded ? "scale(1.01)" : "scale(1)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
            position: "relative",
          }

          const wrap = (
            <div
              key={pkg.id}
              role="group"
              aria-label={`${pkg.title} pricing`}
              aria-expanded={expanded}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setLockedId((prev) => (prev === pkg.id ? null : pkg.id))
                }
              }}
              onMouseEnter={() => {
                if (lockedId !== null) return
                setHoverId(pkg.id)
              }}
              onMouseLeave={() => {
                if (lockedId !== null) return
                setHoverId(null)
              }}
              onClick={(e) => {
                const t = e.target as HTMLElement
                if (t.closest("button")) return
                setLockedId((prev) => (prev === pkg.id ? null : pkg.id))
              }}
              style={{
                marginBottom: 28,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {isFeatured ? (
                <div
                  style={{
                    padding: 3,
                    borderRadius: 17,
                    background: "linear-gradient(120deg, #fb923c, #f97316, #fbbf24, #ea580c, #fb923c)",
                    backgroundSize: "280% 280%",
                    animation: "pricingFeaturedBorder 5s ease infinite",
                    position: "relative",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 3,
                      textAlign: "center",
                      maxWidth: "min(100%, 320px)",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        padding: "6px 18px",
                        borderRadius: 999,
                        background: "linear-gradient(135deg, #ea580c, #f97316)",
                        color: "#fff",
                        fontWeight: 900,
                        fontSize: 12,
                        letterSpacing: 0.08,
                        textTransform: "uppercase",
                        boxShadow: "0 4px 18px rgba(234,88,12,0.45)",
                        border: "2px solid rgba(255,255,255,0.95)",
                        whiteSpace: "nowrap",
                        animation: "pricingBestValueShine 2.4s ease-in-out infinite",
                      }}
                    >
                      Best Value
                    </div>
                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,0.45)",
                        lineHeight: 1.3,
                      }}
                    >
                      Most crews land here — full power without Elite spend.
                    </div>
                  </div>
                  <div style={{ ...innerCard, marginTop: 36 }}>
                    {cardBody()}
                  </div>
                </div>
              ) : (
                <div style={innerCard}>{cardBody()}</div>
              )}
            </div>
          )

          function cardBody() {
            return (
              <>
                <h2 style={{ ...h2Style, marginTop: isFeatured ? 6 : 0 }}>{pkg.title}</h2>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text }}>{pkg.priceLine}</p>
                {!expanded && (
                  <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: theme.text, opacity: 0.92 }}>
                    {PACKAGE_SUMMARY[pkg.id]}
                  </p>
                )}
                <div
                  style={{
                    marginTop: expanded ? 10 : 0,
                    maxHeight: expanded ? 2400 : 0,
                    opacity: expanded ? 1 : 0,
                    overflow: "hidden",
                    transition: "max-height 0.38s ease, opacity 0.28s ease, margin-top 0.2s ease",
                  }}
                >
                  <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: theme.charcoal }}>Includes:</p>
                  {PACKAGE_INCLUDES[pkg.id]}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSignupWithPackage(pkg.id)
                  }}
                  style={btnPrimary}
                >
                  Sign up — {pkg.title}
                </button>
              </>
            )
          }

          return wrap
        })}

        <div
          style={{
            marginBottom: 28,
            padding: 20,
            borderRadius: 14,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={h2Style}>Additional Users &amp; Office Managers</h2>
          <ul style={ulStyle}>
            <li>1 Additional Office Manager Login – $59.99/month</li>
            <li>1 Additional User Login – $49.99/month</li>
          </ul>
        </div>

        <div style={{ padding: 20, borderRadius: 14, border: `1px solid ${theme.border}`, background: "#fafafa" }}>
          <h2 style={{ ...h2Style, fontSize: 17 }}>* Additional Fees, Usage, and Overage Information</h2>

          <p style={{ margin: "12px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Payment Processing Fees:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            All payments are subject to third-party processing fees. These fees are determined by the payment processor and may vary based on
            payment method, card type, and issuing bank. Tradesman Systems does not control these fees and they may be passed through where
            applicable.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Taxes:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Applicable sales tax may be added based on the customer&apos;s billing location and local or state regulations. Tax rates vary by
            jurisdiction and are not controlled by Tradesman Systems.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Communication Usage &amp; Overage Fees:</p>
          <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Each package includes a monthly allocation of voice minutes and SMS messages. Any usage exceeding the included limits will be billed as
            follows:
          </p>
          <ul style={ulStyle}>
            <li>SMS Messages: $0.03 per message</li>
            <li>Voice Usage: $0.05 per minute</li>
          </ul>

          <p style={{ margin: "14px 0 8px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Estimated Cost Breakdown (for transparency):</p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                border: `1px solid #94a3b8`,
                background: "#ffffff",
                color: "#0f172a",
              }}
            >
              <thead>
                <tr style={{ background: "#e2e8f0" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 10px",
                      borderBottom: "1px solid #94a3b8",
                      color: "#0f172a",
                      fontWeight: 700,
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 10px",
                      borderBottom: "1px solid #94a3b8",
                      color: "#0f172a",
                      fontWeight: 700,
                    }}
                  >
                    Estimated Cost
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 10px",
                      borderBottom: "1px solid #94a3b8",
                      color: "#0f172a",
                      fontWeight: 700,
                    }}
                  >
                    Customer Charge
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: "#f8fafc" }}>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #cbd5e1", color: "#0f172a", fontWeight: 600 }}>SMS</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #cbd5e1", color: "#0f172a" }}>~$0.007</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #cbd5e1", color: "#0f172a" }}>$0.02–$0.03</td>
                </tr>
                <tr style={{ background: "#ffffff" }}>
                  <td style={{ padding: "12px 10px", color: "#0f172a", fontWeight: 600 }}>Voice</td>
                  <td style={{ padding: "12px 10px", color: "#0f172a" }}>~$0.015</td>
                  <td style={{ padding: "12px 10px", color: "#0f172a" }}>$0.04–$0.06</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: theme.text, opacity: 0.9 }}>
            Overage usage is billed monthly and is subject to change based on third-party provider rates.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Lead Allocation &amp; Overage Fees:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Each package includes a set number of qualified leads per month. Additional leads beyond the included allocation may be provided and
            billed based on service type, geographic location, and demand. Typical overage pricing ranges from $25 to $60 per qualified lead.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Carrier &amp; Bank Fees:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Additional charges may apply from mobile carriers or financial institutions, including SMS delivery fees or bank-related charges. These
            fees are determined by third parties and are outside the control of Tradesman Systems.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Lead Qualification Disclaimer:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Tradesman Systems utilizes AI-assisted filtering to qualify leads based on user-defined preferences. While efforts are made to provide
            high-quality, relevant leads, conversion is not guaranteed and results may vary based on response time, service offerings, market
            conditions, and customer intent.
          </p>
        </div>

        <CopyrightVersionFooter variant="default" style={{ marginTop: 28 }} />
      </div>
    </div>
  )
}
