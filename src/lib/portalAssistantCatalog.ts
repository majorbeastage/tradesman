import type { PortalConfig, PortalSettingItem } from "../types/portal-builder"
import {
  CONTROL_IDS_WITH_ITEMS,
  PAGE_CONTROLS,
  TAB_ID_LABELS,
  getDefaultControlItems,
} from "../types/portal-builder"

/** Human-readable catalog for the assistant (and offline help). */
export function buildPortalAssistantCatalogText(): string {
  const lines: string[] = []
  lines.push("## Portal builder — where options live")
  lines.push("")
  lines.push(
    "User-facing checkboxes, dropdowns, and custom fields are stored in `portal_config.controlItems` under keys `tabId:controlId` (e.g. `calendar:add_item_to_calendar`)."
  )
  lines.push(
    "The live app only shows items for controls that call `getControlItemsForUser` in code. If items are missing in the app, they may be on the wrong key or the screen is not wired yet."
  )
  lines.push("")
  lines.push("### Controls that support item lists (checkbox / dropdown / custom_field / dependency)")
  for (const [tabId, ids] of Object.entries(CONTROL_IDS_WITH_ITEMS)) {
    if (!ids.length) continue
    const tabLabel = TAB_ID_LABELS[tabId] ?? tabId
    lines.push(`- **${tabId}** (${tabLabel}): ${ids.map((id) => `\`${id}\``).join(", ")}`)
  }
  lines.push("")
  lines.push("### All page controls (click targets in admin preview)")
  for (const [tabId, controls] of Object.entries(PAGE_CONTROLS)) {
    if (!controls.length) continue
    const tabLabel = TAB_ID_LABELS[tabId] ?? tabId
    lines.push(`- **${tabId}** (${tabLabel}): ${controls.map((c) => `${c.id} (${c.label})`).join("; ")}`)
  }
  lines.push("")
  lines.push("### Item JSON shape (`PortalSettingItem`)")
  lines.push("- `id`: stable snake_case id (unique within that control)")
  lines.push("- `type`: `checkbox` | `dropdown` | `custom_field`")
  lines.push("- `label`: user-visible label")
  lines.push("- `options`: string[] for dropdown or custom_field with subtype dropdown")
  lines.push("- `defaultChecked`: optional boolean for checkbox")
  lines.push("- `customFieldSubtype`: `text` | `textarea` | `dropdown` when type is custom_field")
  lines.push("- `visibleToUser`: default true; false hides from end users")
  lines.push("- `hideFromAdmin`: optional; true hides the item from the admin portal builder list unless “Show items hidden from admin” is checked (end users still follow visibleToUser)")
  lines.push("- `dependency`: optional `{ dependsOnItemId, showWhenValue }` — showWhenValue is `checked`/`unchecked` for checkbox parent, or exact dropdown option string for dropdown parent")
  lines.push("")
  lines.push("### Suggested reply format when proposing config")
  lines.push(
    "End with a fenced JSON block using either `{ \"tabId\", \"controlId\", \"items\": PortalSettingItem[] }` or `{ \"controlItemsPatch\": { \"tabId:controlId\": PortalSettingItem[] } }` so the admin UI can offer Apply."
  )
  return lines.join("\n")
}

export function buildPortalAssistantUserContext(params: {
  previewPage: string
  selectedTabId: string | null
  selectedControlId: string | null
  config: PortalConfig
}): string {
  const { previewPage, selectedTabId, selectedControlId, config } = params
  const lines: string[] = []
  lines.push(`Preview tab: **${previewPage}** (${TAB_ID_LABELS[previewPage] ?? previewPage})`)
  if (selectedTabId && selectedControlId && !selectedControlId.startsWith("custom_action_button:")) {
    const key = `${selectedTabId}:${selectedControlId}`
    const items =
      key === "leads:settings"
        ? (config.controlItems?.[key] ?? config.leadsSettingsItems ?? getDefaultControlItems(selectedTabId, selectedControlId))
        : (config.controlItems?.[key] ?? getDefaultControlItems(selectedTabId, selectedControlId))
    lines.push(`Selected control key: **${key}**`)
    lines.push(`Current items (${Array.isArray(items) ? items.length : 0}):`)
    lines.push("```json")
    lines.push(JSON.stringify(items ?? [], null, 2))
    lines.push("```")
  } else if (selectedControlId?.startsWith("custom_action_button:")) {
    const bid = selectedControlId.replace("custom_action_button:", "")
    const tabButtons =
      previewPage === "leads"
        ? (config.customActionButtons ?? [])
        : (config.customActionButtonsByTab?.[previewPage] ?? [])
    const btn = tabButtons.find((b) => b.id === bid)
    lines.push(`Selected: custom header button **${bid}** (${btn?.label ?? "?"})`)
    lines.push("```json")
    lines.push(JSON.stringify(btn?.items ?? [], null, 2))
    lines.push("```")
  } else {
    lines.push("No single control selected; give tab-level guidance.")
    const keys = Object.keys(config.controlItems ?? {})
    if (keys.length) {
      lines.push("Existing controlItems keys in this profile: " + keys.map((k) => `\`${k}\``).join(", "))
    }
  }
  return lines.join("\n")
}

function isPortalSettingItem(x: unknown): x is PortalSettingItem {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  if (typeof o.id !== "string" || !o.id.trim()) return false
  if (o.type !== "checkbox" && o.type !== "dropdown" && o.type !== "custom_field") return false
  if (typeof o.label !== "string") return false
  if (o.options !== undefined && !Array.isArray(o.options)) return false
  if (Array.isArray(o.options) && !o.options.every((v) => typeof v === "string")) return false
  if (o.dependencyMode !== undefined && o.dependencyMode !== "all" && o.dependencyMode !== "any") return false
  if (o.dependency !== undefined) {
    const d = o.dependency as Record<string, unknown>
    if (typeof d.dependsOnItemId !== "string" || typeof d.showWhenValue !== "string") return false
  }
  if (o.dependencies !== undefined) {
    if (!Array.isArray(o.dependencies)) return false
    for (const row of o.dependencies) {
      const d = row as Record<string, unknown>
      if (typeof d.dependsOnItemId !== "string" || typeof d.showWhenValue !== "string") return false
    }
  }
  return true
}

export type ParsedItemsSuggestion =
  | { kind: "items"; tabId: string; controlId: string; items: PortalSettingItem[] }
  | { kind: "patch"; controlItemsPatch: Record<string, PortalSettingItem[]> }

/** Extract ```json ... ``` from assistant message; validate items. */
export function parsePortalItemsSuggestionFromAssistantText(text: string): ParsedItemsSuggestion | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (!fence) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(fence[1].trim())
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  if (typeof o.tabId === "string" && typeof o.controlId === "string" && Array.isArray(o.items)) {
    const items = o.items.filter(isPortalSettingItem) as PortalSettingItem[]
    if (items.length !== o.items.length) return null
    return { kind: "items", tabId: o.tabId.trim(), controlId: o.controlId.trim(), items }
  }
  if (o.controlItemsPatch && typeof o.controlItemsPatch === "object" && !Array.isArray(o.controlItemsPatch)) {
    const patch: Record<string, PortalSettingItem[]> = {}
    for (const [k, v] of Object.entries(o.controlItemsPatch as Record<string, unknown>)) {
      if (!k.includes(":") || !Array.isArray(v)) return null
      const items = v.filter(isPortalSettingItem) as PortalSettingItem[]
      if (items.length !== v.length) return null
      patch[k] = items
    }
    if (Object.keys(patch).length === 0) return null
    return { kind: "patch", controlItemsPatch: patch }
  }
  return null
}
