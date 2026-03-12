import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { fetchCustomFields } from "../../lib/portal-builder-api"
import type { CustomField } from "../../types/portal-builder"
import { theme } from "../../styles/theme"

export default function SettingsPage() {
  const { clientId } = useAuth()
  const [fields, setFields] = useState<CustomField[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) return
    fetchCustomFields(clientId)
      .then((data) => {
        setFields(data)
        const initial: Record<string, string | boolean> = {}
        data.forEach((f) => {
          if (f.type === "checkbox") initial[f.key] = f.default_value === "true"
          else initial[f.key] = f.default_value ?? ""
        })
        setValues(initial)
      })
      .finally(() => setLoading(false))
  }, [clientId])

  const isVisible = (field: CustomField): boolean => {
    const deps = field.dependencies ?? []
    if (deps.length === 0) return true
    return deps.every((d) => {
      const depField = fields.find((x) => x.id === d.depends_on_custom_field_id)
      const v = depField ? values[depField.key] : undefined
      const target = d.show_when_value
      if (typeof v === "boolean") return (target === "true" && v) || (target === "false" && !v)
      return String(v) === target
    })
  }

  const visibleFields = fields.filter(isVisible).sort((a, b) => a.sort_order - b.sort_order)

  const update = (key: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 400,
    padding: "10px 12px",
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
    boxSizing: "border-box",
  }

  if (loading) return <p style={{ color: theme.text }}>Loading settings…</p>

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: 8 }}>Settings</h1>
      <p style={{ color: theme.text, opacity: 0.8, marginBottom: 24 }}>
        Custom fields configured by your admin. Changes are stored in this session.
      </p>
      {visibleFields.length === 0 ? (
        <p style={{ color: theme.text, opacity: 0.8 }}>No custom fields configured.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {visibleFields.map((f) => (
            <label key={f.id} style={{ display: "block" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: theme.text }}>{f.label}</span>
              {f.type === "checkbox" && (
                <input
                  type="checkbox"
                  checked={!!values[f.key]}
                  onChange={(e) => update(f.key, e.target.checked)}
                  style={{ marginLeft: 12, marginTop: 4 }}
                />
              )}
              {f.type === "text" && (
                <input
                  type="text"
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder ?? undefined}
                  style={inputStyle}
                />
              )}
              {f.type === "textarea" && (
                <textarea
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder ?? undefined}
                  rows={3}
                  style={inputStyle}
                />
              )}
              {f.type === "dropdown" && (
                <select
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Select —</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
