import type { PortalSettingDependency, PortalSettingItem } from "../../types/portal-builder"
import { getPortalItemDependencyList } from "../../types/portal-builder"
import { theme } from "../../styles/theme"

type Props = {
  item: PortalSettingItem
  /** Other items in the same control or custom button (exclude the item being edited). */
  siblingItems: PortalSettingItem[]
  onApply: (patch: Partial<PortalSettingItem>) => void
}

function defaultShowWhen(depItem: PortalSettingItem | undefined): string {
  if (!depItem) return ""
  if (depItem.type === "checkbox") return "checked"
  if (depItem.type === "custom_field") return "filled"
  return depItem.options?.[0] ?? ""
}

function commitDependencyState(deps: PortalSettingDependency[], mode: "all" | "any", onApply: Props["onApply"]) {
  if (deps.length === 0) {
    onApply({ dependency: undefined, dependencies: undefined, dependencyMode: undefined })
  } else if (deps.length === 1) {
    onApply({ dependency: deps[0], dependencies: undefined, dependencyMode: undefined })
  } else {
    onApply({ dependency: undefined, dependencies: deps, dependencyMode: mode })
  }
}

function DependencyValueSelect({
  dep,
  depItem,
  onChange,
}: {
  dep: PortalSettingDependency
  depItem: PortalSettingItem | undefined
  onChange: (next: PortalSettingDependency) => void
}) {
  if (!depItem) return null
  if (depItem.type === "checkbox") {
    return (
      <select
        value={dep.showWhenValue}
        onChange={(e) => onChange({ ...dep, showWhenValue: e.target.value, showWhenValues: undefined })}
        style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }}
      >
        <option value="checked">Checked</option>
        <option value="unchecked">Unchecked</option>
      </select>
    )
  }
  if (depItem.type === "dropdown" && depItem.options?.length) {
    return (
      <select
        value={dep.showWhenValue}
        onChange={(e) => onChange({ ...dep, showWhenValue: e.target.value, showWhenValues: undefined })}
        style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }}
      >
        {depItem.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  if (depItem.type === "custom_field") {
    return (
      <select
        value={dep.showWhenValue || "filled"}
        onChange={(e) => onChange({ ...dep, showWhenValue: e.target.value, showWhenValues: undefined })}
        style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }}
      >
        <option value="filled">Has value</option>
        <option value="empty">Empty</option>
      </select>
    )
  }
  return null
}

export default function PortalItemDependencyEditor({ item, siblingItems, onApply }: Props) {
  const deps = getPortalItemDependencyList(item)
  const mode: "all" | "any" = item.dependencyMode === "any" ? "any" : "all"

  function setDeps(next: PortalSettingDependency[], nextMode: "all" | "any" = mode) {
    commitDependencyState(next, nextMode, onApply)
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Dependencies (when to show this field)</p>
      <p style={{ fontSize: 10, color: theme.text, opacity: 0.85, margin: "0 0 8px", lineHeight: 1.45 }}>
        Add one or more rules referencing <strong>other items in this list</strong>.{" "}
        <strong>All (AND)</strong> — every rule must match. <strong>Any (OR)</strong> — at least one must match. (Nested groups are not supported.)
      </p>
      {siblingItems.length === 0 ? (
        <p style={{ fontSize: 11, color: "#92400e", margin: 0 }}>Add another item to this control first; then you can depend on it.</p>
      ) : null}
      {deps.length >= 2 && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8, cursor: "pointer", flexWrap: "wrap" }}>
          <span style={{ color: theme.text }}>Combine rules with:</span>
          <select
            value={mode}
            onChange={(e) => commitDependencyState(deps, e.target.value as "all" | "any", onApply)}
            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }}
          >
            <option value="all">All (AND)</option>
            <option value="any">Any (OR)</option>
          </select>
        </label>
      )}
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {deps.map((dep, index) => {
          const depItem = siblingItems.find((x) => x.id === dep.dependsOnItemId)
          return (
            <li
              key={`${dep.dependsOnItemId}-${index}`}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                padding: 8,
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                background: "#fafafa",
              }}
            >
              <select
                value={dep.dependsOnItemId}
                onChange={(e) => {
                  const id = e.target.value
                  const di = siblingItems.find((x) => x.id === id)
                  const next = deps.slice()
                  next[index] = { dependsOnItemId: id, showWhenValue: defaultShowWhen(di), showWhenValues: undefined }
                  setDeps(next)
                }}
                style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, minWidth: 140 }}
              >
                {!siblingItems.some((o) => o.id === dep.dependsOnItemId) && dep.dependsOnItemId ? (
                  <option value={dep.dependsOnItemId}>(missing item) {dep.dependsOnItemId}</option>
                ) : null}
                {siblingItems.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <DependencyValueSelect
                dep={dep}
                depItem={depItem}
                onChange={(d) => {
                  const next = deps.slice()
                  next[index] = d
                  setDeps(next)
                }}
              />
              <button
                type="button"
                onClick={() => setDeps(deps.filter((_, i) => i !== index))}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  cursor: "pointer",
                  color: theme.text,
                }}
              >
                Remove rule
              </button>
            </li>
          )
        })}
      </ul>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            const first = siblingItems[0]
            if (!first) return
            setDeps([...deps, { dependsOnItemId: first.id, showWhenValue: defaultShowWhen(first) }])
          }}
          disabled={siblingItems.length === 0}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: theme.background,
            cursor: siblingItems.length ? "pointer" : "not-allowed",
            fontSize: 12,
            color: theme.text,
          }}
        >
          Add rule
        </button>
        {deps.length > 0 && (
          <button
            type="button"
            onClick={() => setDeps([])}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #fca5a5",
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
              color: "#b91c1c",
            }}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
