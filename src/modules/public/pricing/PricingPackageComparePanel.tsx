import { Fragment, useMemo } from "react"
import type { CSSProperties } from "react"
import type { ProductPackageId } from "../../../lib/productPackages"
import {
  buildCompareSummaryRows,
  buildPricingCompareMatrix,
  compareSectionsForDisplay,
  tierIncludesFeature,
} from "../../../lib/pricingCompareMatrix"
import { formatPrice, type PricingTierContent } from "../../../lib/pricingPageContent"
import { theme } from "../../../styles/theme"

const TABLE_BORDER = "#64748b"
const CELL_BORDER = "#94a3b8"

type Props = {
  selectedTiers: PricingTierContent[]
  onClear: () => void
  onSignup: (id: ProductPackageId) => void
  isMobile: boolean
}

export default function PricingPackageComparePanel({ selectedTiers, onClear, onSignup, isMobile }: Props) {
  const matrix = useMemo(() => buildPricingCompareMatrix(), [])
  const displaySections = useMemo(() => compareSectionsForDisplay(matrix.sections), [matrix.sections])
  const summaryRows = useMemo(() => buildCompareSummaryRows(selectedTiers), [selectedTiers])

  if (selectedTiers.length < 2) return null

  return (
    <section style={isMobile ? mobilePanelStyle : panelStyle} aria-label="Package comparison">
      <div style={isMobile ? mobilePanelHeaderStyle : panelHeaderStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 900, color: theme.charcoal }}>
            Compare packages
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
            Side-by-side view of {selectedTiers.length} selected plans
          </p>
        </div>
        <button type="button" onClick={onClear} style={isMobile ? mobileClearBtnStyle : clearBtnStyle}>
          Clear comparison
        </button>
      </div>

      {isMobile ? (
        <MobileCompareBody
          selectedTiers={selectedTiers}
          summaryRows={summaryRows}
          displaySections={displaySections}
          matrix={matrix}
          onSignup={onSignup}
        />
      ) : (
        <DesktopCompareTable selectedTiers={selectedTiers} summaryRows={summaryRows} displaySections={displaySections} matrix={matrix} onSignup={onSignup} />
      )}
    </section>
  )
}

type BodyProps = {
  selectedTiers: PricingTierContent[]
  summaryRows: ReturnType<typeof buildCompareSummaryRows>
  displaySections: ReturnType<typeof compareSectionsForDisplay>
  matrix: ReturnType<typeof buildPricingCompareMatrix>
  onSignup: (id: ProductPackageId) => void
}

function DesktopCompareTable({ selectedTiers, summaryRows, displaySections, matrix, onSignup }: BodyProps) {
  return (
    <div style={tableScrollWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thFeatureCornerStyle}>Feature</th>
            {selectedTiers.map((tier) => (
              <th
                key={tier.id}
                style={{
                  ...thTierStyle,
                  ...(tier.featured ? { background: "#fff7ed" } : { background: "#f8fafc" }),
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontWeight: tier.id === "estimate_tools_only" ? 600 : 800,
                    color: tier.id === "estimate_tools_only" ? "#64748b" : theme.charcoal,
                  }}
                >
                  {tier.title}
                </span>
                <span style={{ display: "block", marginTop: 4, fontSize: 18, fontWeight: 900, color: theme.charcoal }}>
                  {formatPrice(tier.priceMonthly)}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>/mo</span>
                </span>
                <button
                  type="button"
                  onClick={() => onSignup(tier.id)}
                  style={tier.id === "estimate_tools_only" ? signupNeutralStyle : signupPrimaryStyle}
                >
                  Sign up
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaryRows.map((row) => (
            <tr key={row.id}>
              <td style={tdFeatureStickyStyle}>{row.label}</td>
              {selectedTiers.map((tier) => (
                <td key={tier.id} style={{ ...tdValueStyle, verticalAlign: "top", fontSize: row.id === "usage" ? 12 : 14 }}>
                  {row.values[tier.id]}
                </td>
              ))}
            </tr>
          ))}

          {displaySections.map((section) => (
            <Fragment key={section.title}>
              <tr>
                <td colSpan={selectedTiers.length + 1} style={sectionHeaderStyle}>
                  {section.title}
                </td>
              </tr>
              {section.rows.map((item) => (
                <tr key={`${section.title}-${item}`}>
                  <td style={tdFeatureStickyStyle}>{item}</td>
                  {selectedTiers.map((tier) => {
                    const included = tierIncludesFeature(matrix, tier.id, section.title, item)
                    return (
                      <td key={tier.id} style={{ ...tdValueStyle, textAlign: "center" }}>
                        {included ? (
                          <span style={checkStyle} aria-label="Included">
                            ✓
                          </span>
                        ) : (
                          <span style={mutedCellStyle} aria-label="Not included">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MobileCompareBody({ selectedTiers, summaryRows, displaySections, matrix, onSignup }: BodyProps) {
  const tierColumns = selectedTiers.length >= 3 ? 2 : selectedTiers.length

  return (
    <div style={mobileBodyStyle}>
      <div style={mobileTierStripStyle}>
        {selectedTiers.map((tier) => (
          <div
            key={tier.id}
            style={{
              ...mobileTierCardStyle,
              ...(tier.featured ? { background: "#fff7ed", borderColor: "#fdba74" } : {}),
            }}
          >
            <span
              style={{
                fontWeight: tier.id === "estimate_tools_only" ? 600 : 800,
                fontSize: 13,
                lineHeight: 1.35,
                color: tier.id === "estimate_tools_only" ? "#64748b" : theme.charcoal,
              }}
            >
              {tier.title}
            </span>
            <span style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: theme.charcoal }}>
              {formatPrice(tier.priceMonthly)}
              <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>/mo</span>
            </span>
            <button
              type="button"
              onClick={() => onSignup(tier.id)}
              style={tier.id === "estimate_tools_only" ? mobileSignupNeutralStyle : mobileSignupPrimaryStyle}
            >
              Sign up
            </button>
          </div>
        ))}
      </div>

      <div style={mobileBlockStyle}>
        <h3 style={mobileBlockTitleStyle}>At a glance</h3>
        {summaryRows.map((row) => (
          <div key={row.id} style={mobileSummaryRowStyle}>
            <div style={mobileSummaryLabelStyle}>{row.label}</div>
            {row.id === "usage" ? (
              <div style={mobileUsageStackStyle}>
                {selectedTiers.map((tier) => (
                  <div key={tier.id} style={mobileUsageItemStyle}>
                    <span style={mobileMiniTierStyle}>{tier.title}</span>
                    <p style={mobileUsageTextStyle}>{row.values[tier.id]}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...mobileValueGridStyle, gridTemplateColumns: `repeat(${tierColumns}, minmax(0, 1fr))` }}>
                {selectedTiers.map((tier) => (
                  <div key={tier.id} style={mobileValueCellStyle}>
                    <span style={mobileMiniTierStyle}>{tier.title}</span>
                    <span style={mobileValueTextStyle}>{row.values[tier.id]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {displaySections.map((section) => (
        <div key={section.title} style={mobileBlockStyle}>
          <h3 style={mobileSectionTitleStyle}>{section.title}</h3>
          <div style={mobileFeatureListStyle}>
            {section.rows.map((item) => (
              <div key={`${section.title}-${item}`} style={mobileFeatureCardStyle}>
                <div style={mobileFeatureLabelStyle}>{item}</div>
                <div style={{ ...mobileValueGridStyle, gridTemplateColumns: `repeat(${tierColumns}, minmax(0, 1fr))` }}>
                  {selectedTiers.map((tier) => {
                    const included = tierIncludesFeature(matrix, tier.id, section.title, item)
                    return (
                      <div key={tier.id} style={mobileFeatureValueCellStyle}>
                        <span style={mobileMiniTierStyle}>{tier.title}</span>
                        {included ? (
                          <span style={mobileCheckStyle} aria-label="Included">
                            ✓
                          </span>
                        ) : (
                          <span style={mobileDashStyle} aria-label="Not included">
                            —
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const panelStyle: CSSProperties = {
  marginTop: 28,
  padding: "22px clamp(16px, 3vw, 28px)",
  borderRadius: 16,
  background: "#fff",
  border: `2px solid ${TABLE_BORDER}`,
  boxShadow: "0 16px 48px rgba(15,23,42,0.08)",
}

const mobilePanelStyle: CSSProperties = {
  marginTop: 24,
  marginLeft: -16,
  marginRight: -16,
  padding: "18px 14px 22px",
  borderRadius: 0,
  background: "#fff",
  borderTop: `2px solid ${TABLE_BORDER}`,
  borderBottom: `2px solid ${TABLE_BORDER}`,
  borderLeft: "none",
  borderRight: "none",
  boxShadow: "none",
}

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "flex-start",
}

const mobilePanelHeaderStyle: CSSProperties = {
  ...panelHeaderStyle,
  flexDirection: "column",
  alignItems: "stretch",
  gap: 14,
}

const clearBtnStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: `1px solid ${CELL_BORDER}`,
  background: "#fff",
  color: "#64748b",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}

const mobileClearBtnStyle: CSSProperties = {
  ...clearBtnStyle,
  width: "100%",
  padding: "12px 14px",
}

const tableScrollWrapStyle: CSSProperties = {
  marginTop: 16,
  borderRadius: 12,
  border: `2px solid ${TABLE_BORDER}`,
  overflow: "auto",
  maxHeight: "min(72vh, 780px)",
  WebkitOverflowScrolling: "touch",
}

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: 560,
  borderCollapse: "collapse",
  background: "#fff",
}

const thFeatureCornerStyle: CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  borderBottom: `2px solid ${TABLE_BORDER}`,
  borderRight: `2px solid ${TABLE_BORDER}`,
  minWidth: 200,
  fontSize: 13,
  fontWeight: 800,
  color: theme.charcoal,
  background: "#f1f5f9",
  position: "sticky",
  top: 0,
  left: 0,
  zIndex: 4,
  boxShadow: "2px 2px 4px rgba(15,23,42,0.06)",
}

const thTierStyle: CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  borderBottom: `2px solid ${TABLE_BORDER}`,
  borderRight: `1px solid ${CELL_BORDER}`,
  minWidth: 160,
  verticalAlign: "top",
  fontSize: 14,
  position: "sticky",
  top: 0,
  zIndex: 3,
  boxShadow: "0 2px 4px rgba(15,23,42,0.06)",
}

const tdFeatureStickyStyle: CSSProperties = {
  padding: "11px 16px",
  borderBottom: `1px solid ${CELL_BORDER}`,
  borderRight: `2px solid ${TABLE_BORDER}`,
  fontSize: 13,
  color: "#334155",
  lineHeight: 1.45,
  maxWidth: 280,
  fontWeight: 600,
  background: "#fff",
  position: "sticky",
  left: 0,
  zIndex: 2,
  boxShadow: "2px 0 4px rgba(15,23,42,0.04)",
}

const tdValueStyle: CSSProperties = {
  padding: "11px 16px",
  borderBottom: `1px solid ${CELL_BORDER}`,
  borderRight: `1px solid ${CELL_BORDER}`,
  color: "#475569",
  lineHeight: 1.45,
}

const sectionHeaderStyle: CSSProperties = {
  padding: "12px 14px",
  background: "#e2e8f0",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: theme.charcoal,
  borderTop: `2px solid ${TABLE_BORDER}`,
  borderBottom: `1px solid ${CELL_BORDER}`,
}

const checkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "#fff7ed",
  color: theme.primary,
  fontWeight: 900,
  fontSize: 14,
  border: `1px solid ${theme.primary}`,
}

const mutedCellStyle: CSSProperties = { color: "#94a3b8", fontSize: 16, fontWeight: 700 }

const signupPrimaryStyle: CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 10,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  width: "100%",
}

const signupNeutralStyle: CSSProperties = {
  ...signupPrimaryStyle,
  background: "#fff",
  color: "#64748b",
  border: `1px solid ${CELL_BORDER}`,
  boxShadow: "none",
}

const mobileBodyStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  flexDirection: "column",
  gap: 20,
}

const mobileTierStripStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  overflowX: "auto",
  paddingBottom: 4,
  WebkitOverflowScrolling: "touch",
  scrollSnapType: "x proximity",
}

const mobileTierCardStyle: CSSProperties = {
  flex: "0 0 min(78vw, 260px)",
  scrollSnapAlign: "start",
  padding: "14px 14px 16px",
  borderRadius: 14,
  border: `1px solid ${CELL_BORDER}`,
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
}

const mobileSignupPrimaryStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  width: "100%",
}

const mobileSignupNeutralStyle: CSSProperties = {
  ...mobileSignupPrimaryStyle,
  background: "#fff",
  color: "#64748b",
  border: `1px solid ${CELL_BORDER}`,
}

const mobileBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
}

const mobileBlockTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: theme.charcoal,
}

const mobileSectionTitleStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#e2e8f0",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: theme.charcoal,
}

const mobileSummaryRowStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${CELL_BORDER}`,
  background: "#fff",
}

const mobileSummaryLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 10,
}

const mobileValueGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
}

const mobileValueCellStyle: CSSProperties = {
  padding: "10px 10px",
  borderRadius: 10,
  background: "#f8fafc",
  border: `1px solid #e2e8f0`,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
}

const mobileValueTextStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: theme.charcoal,
  lineHeight: 1.4,
}

const mobileMiniTierStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  lineHeight: 1.35,
}

const mobileUsageStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

const mobileUsageItemStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "#f8fafc",
  border: `1px solid #e2e8f0`,
}

const mobileUsageTextStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#475569",
}

const mobileFeatureListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
}

const mobileFeatureCardStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${CELL_BORDER}`,
  background: "#fff",
}

const mobileFeatureLabelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#334155",
  lineHeight: 1.45,
  marginBottom: 10,
}

const mobileFeatureValueCellStyle: CSSProperties = {
  ...mobileValueCellStyle,
  alignItems: "center",
  textAlign: "center",
  gap: 6,
}

const mobileCheckStyle: CSSProperties = {
  ...checkStyle,
  width: 28,
  height: 28,
}

const mobileDashStyle: CSSProperties = {
  ...mutedCellStyle,
  fontSize: 18,
}
