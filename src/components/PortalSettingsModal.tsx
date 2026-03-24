import { theme } from "../styles/theme"
import type { PortalSettingItem } from "../types/portal-builder"
import PortalSettingItemsForm from "./PortalSettingItemsForm"

type Props = {
  title: string
  items: PortalSettingItem[]
  formValues: Record<string, string>
  setFormValue: (itemId: string, value: string) => void
  isItemVisible: (item: PortalSettingItem) => boolean
  onClose: () => void
}

export default function PortalSettingsModal({
  title,
  items,
  formValues,
  setFormValue,
  isItemVisible,
  onClose,
}: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          zIndex: 9999,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
          {items.length === 0 ? (
            <p style={{ fontSize: "14px", color: theme.text, opacity: 0.8 }}>No settings configured. Your admin can add items in the portal config.</p>
          ) : (
            <PortalSettingItemsForm items={items} formValues={formValues} setFormValue={setFormValue} isItemVisible={isItemVisible} />
          )}
        </div>
        <button onClick={onClose} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}>Done</button>
      </div>
    </>
  )
}
