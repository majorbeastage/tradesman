import { theme } from "../../styles/theme"
import {
  CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_IDS,
  CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_LABELS,
  type CustomerQuickViewTabVisibility,
  type CustomerQuickViewViewMode,
} from "../../lib/customerQuickViewPrefs"

type Props = {
  visibility: CustomerQuickViewTabVisibility
  onChange: (next: CustomerQuickViewTabVisibility) => void
  viewMode?: CustomerQuickViewViewMode
  onViewModeChange?: (mode: CustomerQuickViewViewMode) => void
  showViewModeOptions?: boolean
}

export function CustomerQuickViewTabVisibilityEditor({
  visibility,
  onChange,
  viewMode,
  onViewModeChange,
  showViewModeOptions,
}: Props) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        Communications and Full profile are always visible. Choose which other tabs appear in the customer quick view.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 8,
        }}
      >
        {CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_IDS.map((id) => (
          <label
            key={id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              color: theme.text,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={visibility[id] !== false}
              onChange={(e) => onChange({ ...visibility, [id]: e.target.checked })}
            />
            {CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_LABELS[id]}
          </label>
        ))}
      </div>
      {showViewModeOptions && viewMode != null && onViewModeChange ? (
        <div style={{ display: "grid", gap: 8, paddingTop: 4, borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>View mode</div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="radio"
              name="customer-quick-view-mode"
              checked={viewMode === "all_customers"}
              onChange={() => onViewModeChange("all_customers")}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Apply these settings to all customers</strong>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>One tab layout for every customer record.</div>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="radio"
              name="customer-quick-view-mode"
              checked={viewMode === "custom_per_customer"}
              onChange={() => onViewModeChange("custom_per_customer")}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Allow custom views for each customer</strong>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                Defaults come from these settings; each customer can override via Customer settings.
              </div>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  )
}
