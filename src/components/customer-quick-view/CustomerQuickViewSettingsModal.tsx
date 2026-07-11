import { useEffect, useState } from "react"
import { theme } from "../../styles/theme"
import {
  defaultCustomerQuickViewPrefs,
  type CustomerQuickViewPrefs,
} from "../../lib/customerQuickViewPrefs"
import { CustomerQuickViewTabVisibilityEditor } from "./CustomerQuickViewTabVisibilityEditor"

type Props = {
  open: boolean
  onClose: () => void
  initialPrefs: CustomerQuickViewPrefs
  onSave: (prefs: CustomerQuickViewPrefs) => Promise<void>
  saveBusy: boolean
}

export function CustomerQuickViewSettingsModal({ open, onClose, initialPrefs, onSave, saveBusy }: Props) {
  const [draft, setDraft] = useState<CustomerQuickViewPrefs>(initialPrefs)

  useEffect(() => {
    if (open) setDraft(initialPrefs)
  }, [open, initialPrefs])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-quick-view-settings-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "min(90vh, 760px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
          padding: 20,
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 id="customer-quick-view-settings-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>
              Customer quick view settings
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Control which tabs appear when you open a customer from the list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ×
          </button>
        </div>

        <CustomerQuickViewTabVisibilityEditor
          visibility={draft.tabVisibility}
          onChange={(tabVisibility) => setDraft((p) => ({ ...p, tabVisibility }))}
          viewMode={draft.viewMode}
          onViewModeChange={(viewMode) => setDraft((p) => ({ ...p, viewMode }))}
          showViewModeOptions
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setDraft(defaultCustomerQuickViewPrefs())}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => void onSave(draft)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: saveBusy ? "wait" : "pointer",
            }}
          >
            {saveBusy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  )
}
