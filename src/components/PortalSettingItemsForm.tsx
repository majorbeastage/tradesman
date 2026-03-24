import { theme } from "../styles/theme"
import type { PortalSettingItem } from "../types/portal-builder"

type Props = {
  items: PortalSettingItem[]
  formValues: Record<string, string>
  setFormValue: (itemId: string, value: string) => void
  isItemVisible: (item: PortalSettingItem) => boolean
  /** Optional section title above fields */
  title?: string
}

/** Renders portal-config checkboxes, dropdowns, and custom fields (same rules as PortalSettingsModal). */
export default function PortalSettingItemsForm({ items, formValues, setFormValue, isItemVisible, title }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", color: theme.text }}>
      {title && <p style={{ fontSize: "13px", fontWeight: 600, margin: 0, color: theme.text }}>{title}</p>}
      {items.length === 0 ? (
        <p style={{ fontSize: "13px", color: theme.text, opacity: 0.75, margin: 0 }}>No options configured for this control.</p>
      ) : (
        items.map((item) => {
          if (!isItemVisible(item)) return null
          if (item.type === "checkbox") {
            const checked = formValues[item.id] === "checked"
            return (
              <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                <input type="checkbox" checked={checked} onChange={(e) => setFormValue(item.id, e.target.checked ? "checked" : "unchecked")} />
                <span>{item.label}</span>
              </label>
            )
          }
          if (item.type === "dropdown" && item.options?.length) {
            const value = formValues[item.id] ?? item.options[0]
            return (
              <div key={item.id}>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                <select value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput, width: "100%" }}>
                  {item.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          if (item.type === "custom_field") {
            const value = formValues[item.id] ?? ""
            const isTextarea = item.customFieldSubtype === "textarea"
            return (
              <div key={item.id}>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                {isTextarea ? (
                  <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical", width: "100%" }} />
                ) : (
                  <input type="text" value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput, width: "100%" }} />
                )}
              </div>
            )
          }
          return null
        })
      )}
    </div>
  )
}
