import { useState, useEffect } from "react"
import { theme } from "../../styles/theme"
import type { CustomField, CustomFieldType, DropdownOption } from "../../types/portal-builder"
import {
  fetchCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  addCustomFieldDependency,
  removeCustomFieldDependency,
} from "../../lib/portal-builder-api"

type Props = { clientId: string }

export default function AdminCustomFieldsSection({ clientId }: Props) {
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newType, setNewType] = useState<CustomFieldType>("text")
  const [newKey, setNewKey] = useState("")
  const [newLabel, setNewLabel] = useState("")
  const [newPlaceholder, setNewPlaceholder] = useState("")
  const [newOptions, setNewOptions] = useState<DropdownOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    fetchCustomFields(clientId)
      .then((data) => {
        if (!cancelled) setFields(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [clientId])

  const addField = async () => {
    setError("")
    const key = newKey.trim().replace(/\s+/g, "_").toLowerCase() || "field"
    const label = newLabel.trim() || key
    setSaving(true)
    try {
      const created = await createCustomField({
        client_id: clientId,
        type: newType,
        key,
        label,
        placeholder: newPlaceholder.trim() || null,
        options: newType === "dropdown" ? newOptions : undefined,
        sort_order: fields.length,
      })
      setFields((prev) => [...prev, created])
      setShowAdd(false)
      setNewKey("")
      setNewLabel("")
      setNewPlaceholder("")
      setNewOptions([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const removeField = async (id: string) => {
    if (!confirm("Remove this field?")) return
    setSaving(true)
    try {
      await deleteCustomField(id)
      setFields((prev) => prev.filter((f) => f.id !== id))
    } finally {
      setSaving(false)
    }
  }

  const addDep = async (fieldId: string, dependsOnId: string, showWhenValue: string) => {
    try {
      const created = await addCustomFieldDependency(fieldId, dependsOnId, showWhenValue)
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== fieldId) return f
          return {
            ...f,
            dependencies: [...(f.dependencies ?? []), created],
          }
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const removeDep = async (depId: string, fieldId: string) => {
    try {
      await removeCustomFieldDependency(depId)
      setFields((prev) =>
        prev.map((f) => (f.id !== fieldId ? f : { ...f, dependencies: (f.dependencies ?? []).filter((d) => d.id !== depId) }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "white",
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  }
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
    boxSizing: "border-box",
  }

  if (loading) return <p style={{ color: theme.text }}>Loading…</p>

  return (
    <div>
      <p style={{ color: theme.text, marginBottom: 16, opacity: 0.9 }}>
        Add checkboxes, dropdowns, and text fields. Use dependencies to show a field only when another has a specific value.
      </p>
      {error && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</p>}

      {fields.map((f) => (
        <div key={f.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <strong style={{ color: theme.text }}>{f.label}</strong>
              <span style={{ marginLeft: 8, fontSize: 12, color: theme.text, opacity: 0.7 }}>({f.key})</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: theme.text, opacity: 0.7 }}>{f.type}</span>
            </div>
            <button type="button" onClick={() => removeField(f.id)} disabled={saving} style={{ padding: "4px 8px", color: "#b91c1c", cursor: "pointer" }}>
              Remove
            </button>
          </div>
          {f.dependencies && f.dependencies.length > 0 && (
            <div style={{ fontSize: 12, color: theme.text, opacity: 0.8, marginTop: 6 }}>
              Show when:{" "}
              {f.dependencies.map((d) => {
                const other = fields.find((x) => x.id === d.depends_on_custom_field_id)
                return (
                  <span key={d.id} style={{ marginRight: 8 }}>
                    “{other?.label ?? d.depends_on_custom_field_id}” = “{d.show_when_value}”
                    <button type="button" onClick={() => removeDep(d.id, f.id)} style={{ marginLeft: 4 }}>×</button>
                  </span>
                )
              })}
            </div>
          )}
          <AddDependencyForm field={f} otherFields={fields.filter((x) => x.id !== f.id)} onAdd={addDep} />
        </div>
      ))}

      {!showAdd ? (
        <button type="button" onClick={() => setShowAdd(true)} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
          + Add field
        </button>
      ) : (
        <div style={cardStyle}>
          <h4 style={{ margin: "0 0 12px", color: theme.text }}>New field</h4>
          <label style={{ display: "block", marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: theme.text }}>Type</span>
            <select value={newType} onChange={(e) => setNewType(e.target.value as CustomFieldType)} style={{ ...inputStyle, marginTop: 4 }}>
              <option value="checkbox">Checkbox</option>
              <option value="dropdown">Dropdown</option>
              <option value="text">Text</option>
              <option value="textarea">Text area</option>
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: theme.text }}>Label</span>
            <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Display label" style={inputStyle} />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: theme.text }}>Key (internal)</span>
            <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. industry_type" style={inputStyle} />
          </label>
          {(newType === "text" || newType === "textarea") && (
            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: theme.text }}>Placeholder</span>
              <input type="text" value={newPlaceholder} onChange={(e) => setNewPlaceholder(e.target.value)} style={inputStyle} />
            </label>
          )}
          {newType === "dropdown" && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: theme.text }}>Options (value / label)</span>
              {newOptions.map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    type="text"
                    value={o.value}
                    onChange={(e) => setNewOptions((prev) => prev.map((opt, j) => (j === i ? { ...opt, value: e.target.value } : opt)))}
                    placeholder="value"
                    style={{ ...inputStyle, margin: 0, flex: 1 }}
                  />
                  <input
                    type="text"
                    value={o.label}
                    onChange={(e) => setNewOptions((prev) => prev.map((opt, j) => (j === i ? { ...opt, label: e.target.value } : opt)))}
                    placeholder="label"
                    style={{ ...inputStyle, margin: 0, flex: 1 }}
                  />
                  <button type="button" onClick={() => setNewOptions((prev) => prev.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => setNewOptions((prev) => [...prev, { value: "", label: "" }])} style={{ marginTop: 8, padding: "6px 12px", fontSize: 12 }}>
                + Option
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={addField} disabled={saving} style={{ padding: "8px 16px", background: theme.primary, color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
              {saving ? "Saving…" : "Add"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ padding: "8px 16px", background: "transparent", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 6, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddDependencyForm({
  field,
  otherFields,
  onAdd,
}: {
  field: CustomField
  otherFields: CustomField[]
  onAdd: (fieldId: string, dependsOnId: string, showWhenValue: string) => Promise<void>
}) {
  const [dependsOnId, setDependsOnId] = useState("")
  const [showWhenValue, setShowWhenValue] = useState("")

  const dependsOn = otherFields.find((f) => f.id === dependsOnId)
  const optionsForShowWhen =
    dependsOn?.type === "checkbox"
      ? ["true", "false"]
      : dependsOn?.type === "dropdown"
        ? dependsOn.options?.map((o) => o.value) ?? []
        : []

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
      <span style={{ fontSize: 12, color: theme.text, opacity: 0.8 }}>Show this field when: </span>
      <select value={dependsOnId} onChange={(e) => setDependsOnId(e.target.value)} style={{ marginLeft: 8, padding: "4px 8px" }}>
        <option value="">— Select field —</option>
        {otherFields.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
      {dependsOnId && (
        <>
          <span style={{ marginLeft: 8 }}> equals </span>
          <select value={showWhenValue} onChange={(e) => setShowWhenValue(e.target.value)} style={{ marginLeft: 4, padding: "4px 8px" }}>
            <option value="">— Value —</option>
            {optionsForShowWhen.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (showWhenValue) void onAdd(field.id, dependsOnId, showWhenValue)
              setDependsOnId("")
              setShowWhenValue("")
            }}
            disabled={!showWhenValue}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            Add dependency
          </button>
        </>
      )}
    </div>
  )
}
