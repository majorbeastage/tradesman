import type { CSSProperties } from "react"
import PortalSettingItemsForm from "./PortalSettingItemsForm"
import { theme } from "../styles/theme"
import type { PortalSettingItem } from "../types/portal-builder"

type Props = {
  open: boolean
  title: string
  subtitle?: string
  items: PortalSettingItem[]
  formValues: Record<string, string>
  setFormValue: (itemId: string, value: string) => void
  isItemVisible: (item: PortalSettingItem) => boolean
  saving?: boolean
  onClose: () => void
  onSave: () => void
}

export default function DocumentTemplateModal({
  open,
  title,
  subtitle,
  items,
  formValues,
  setFormValue,
  isItemVisible,
  saving,
  onClose,
  onSave,
}: Props) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          maxHeight: "min(88vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          padding: "18px 20px 20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: theme.text }}>{title}</h2>
        {subtitle ? <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{subtitle}</p> : null}
        <PortalSettingItemsForm
          items={items}
          formValues={formValues}
          setFormValue={setFormValue}
          isItemVisible={isItemVisible}
          title="Include on document"
        />
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" onClick={onSave} disabled={saving} style={primaryBtn}>
            {saving ? "Saving…" : "Save & apply"}
          </button>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  color: theme.text,
}
