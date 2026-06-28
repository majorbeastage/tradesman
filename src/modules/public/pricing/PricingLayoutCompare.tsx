import { useMemo } from "react"
import type { CSSProperties } from "react"
import { theme } from "../../../styles/theme"
import { formatPrice, type PricingTierContent } from "../../../lib/pricingPageContent"
import { sectionStyle, type PricingLayoutProps } from "./PricingShared"

/** Sticky-header comparison columns — scroll horizontally on narrow viewports. */
export default function PricingLayoutCompare({
  tiers,
  expandedId,
  setExpandedId,
  onSignupWithPackage,
}: PricingLayoutProps) {
  const rows = useMemo(() => buildCompareRows(tiers), [tiers])

  return (
    <section style={{ ...sectionStyle, paddingTop: 8 }}>
      <div style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${theme.border}`, background: "#fff", boxShadow: "0 12px 40px rgba(15,23,42,0.06)" }}>
        <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 2, background: "#f8fafc", minWidth: 160 }} />
              {tiers.map((tier) => {
                const isStarter = tier.id === "estimate_tools_only"
                const featured = tier.featured
                return (
                  <th
                    key={tier.id}
                    style={{
                      ...thStyle,
                      verticalAlign: "top",
                      padding: 16,
                      background: featured ? "#fff7ed" : isStarter ? "#fafafa" : "#f8fafc",
                      minWidth: 180,
                    }}
                  >
                    {featured ? (
                      <span style={{ display: "inline-block", marginBottom: 8, padding: "4px 10px", borderRadius: 999, background: theme.primary, color: "#fff", fontSize: 10, fontWeight: 900, letterSpacing: "0.06em" }}>
                        MOST POPULAR
                      </span>
                    ) : null}
                    {isStarter ? (
                      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Starter</p>
                    ) : null}
                    <p style={{ margin: "0 0 4px", fontWeight: isStarter ? 600 : 900, fontSize: isStarter ? 14 : 15, color: isStarter ? "#64748b" : theme.charcoal, lineHeight: 1.25 }}>
                      {tier.title}
                    </p>
                    <p style={{ margin: "0 0 10px", fontSize: 22, fontWeight: isStarter ? 700 : 900, color: isStarter ? "#64748b" : theme.charcoal }}>
                      {formatPrice(tier.priceMonthly)}
                      <span style={{ fontSize: 12, fontWeight: 600 }}>/mo</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => onSignupWithPackage(tier.id)}
                      style={
                        isStarter
                          ? { padding: "8px 12px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%" }
                          : { padding: "8px 12px", borderRadius: 10, border: "none", background: theme.primary, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", width: "100%" }
                      }
                    >
                      Sign up
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === tier.id ? null : tier.id)}
                      style={{ marginTop: 8, padding: 0, border: "none", background: "transparent", color: theme.primary, fontWeight: 700, fontSize: 12, cursor: "pointer", width: "100%" }}
                    >
                      {expandedId === tier.id ? "Hide details" : "Details"}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={{ ...tdLabelStyle, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{row.label}</td>
                {row.cells.map((cell, i) => (
                  <td key={tiers[i]?.id ?? i} style={{ ...tdStyle, background: expandedId === tiers[i]?.id ? "#fffbeb" : undefined }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expandedId ? (
        <div style={{ marginTop: 16, padding: 20, borderRadius: 14, background: "#fff", border: `1px solid ${theme.border}` }}>
          <CompareDetail tier={tiers.find((t) => t.id === expandedId)!} />
        </div>
      ) : null}
    </section>
  )
}

function CompareDetail({ tier }: { tier: PricingTierContent }) {
  const groups = tier.tierAdds?.length ? tier.tierAdds : tier.featureGroups
  return (
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, color: theme.charcoal }}>{tier.title} — full details</h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>{tier.usageDisclaimer}</p>
      {tier.chooseOneTools?.length ? (
        <p style={{ margin: "0 0 12px", fontSize: 14 }}><strong>Choose one:</strong> {tier.chooseOneTools.join(" · ")}</p>
      ) : null}
      {tier.buildsOnLowerTiers ? (
        <p style={{ margin: "0 0 12px", fontWeight: 700, color: theme.primary }}>Includes all items from lower tiers, plus:</p>
      ) : null}
      {groups.map((g) => (
        <div key={g.title} style={{ marginBottom: 12 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 13 }}>{g.title}</p>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55, fontSize: 14 }}>
            {g.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function buildCompareRows(tiers: PricingTierContent[]) {
  return [
    {
      label: "Seats",
      cells: tiers.map((t) => t.seats),
    },
    {
      label: "Summary",
      cells: tiers.map((t) => t.tagline),
    },
    {
      label: "Usage",
      cells: tiers.map((t) => t.usageDisclaimer),
    },
    {
      label: "Highlights",
      cells: tiers.map((t) => {
        const items = [...(t.tierAdds ?? []), ...t.featureGroups].flatMap((g) => g.items)
        return items.slice(0, 4).join(" · ") || (t.chooseOneTools?.[0] ?? "—")
      }),
    },
  ]
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: `1px solid ${theme.border}`,
  color: theme.charcoal,
}

const tdLabelStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: `1px solid ${theme.border}`,
  fontWeight: 800,
  color: theme.charcoal,
  fontSize: 13,
  verticalAlign: "top",
}

const tdStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: `1px solid ${theme.border}`,
  color: "#475569",
  lineHeight: 1.45,
  verticalAlign: "top",
  fontSize: 13,
}
