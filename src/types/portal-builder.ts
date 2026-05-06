/** Client (tenant) – each has its own portal config and custom fields */
export type Client = {
  id: string
  name: string
  slug: string | null
  created_at?: string
  updated_at?: string
  /** Bulk-audience portal templates; keys like __all_profiles__. See supabase/clients-portal-config-templates.sql */
  portal_config_templates?: Record<string, PortalConfig> | null
}

/** Which tabs show on User or Office Manager portal */
export type PortalTab = {
  id: string
  client_id: string
  portal_type: 'user' | 'office_manager'
  tab_id: string
  label: string | null
  visible: boolean
  sort_order: number
}

/** Custom field types for low-code builder */
export type CustomFieldType = 'checkbox' | 'dropdown' | 'text' | 'textarea'

export type DropdownOption = { value: string; label: string }

export type CustomField = {
  id: string
  client_id: string
  type: CustomFieldType
  key: string
  label: string
  placeholder: string | null
  options: DropdownOption[]
  default_value: string | null
  sort_order: number
  dependencies?: CustomFieldDependency[]
}

/** Show this field only when another field has the given value */
export type CustomFieldDependency = {
  id: string
  custom_field_id: string
  depends_on_custom_field_id: string
  show_when_value: string
  depends_on_field?: CustomField
}

export const USER_PORTAL_TAB_IDS = [
  'dashboard',
  'leads',
  'conversations',
  'customers',
  'quotes',
  'calendar',
  'payments',
  'account',
  'web-support',
  'tech-support',
  'settings',
] as const

export const OFFICE_PORTAL_TAB_IDS = [
  'dashboard',
  'leads',
  'conversations',
  'customers',
  'quotes',
  'calendar',
  'payments',
  'account',
  'web-support',
  'tech-support',
] as const

export const TAB_ID_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  conversations: 'Conversations',
  quotes: 'Estimates Tool',
  calendar: 'Scheduling',
  customers: 'Customers',
  payments: 'Payments',
  'insurance-options': "Insurance Options — Coming Soon",
  account: 'Account',
  'web-support': 'Web Support',
  'tech-support': 'Tech Support',
  settings: 'Settings',
}

/** Custom item added by admin (id + label) */
export type PortalCustomItem = { id: string; label: string }

/** Dependency: show this item only when another item has a specific value */
export type PortalSettingDependency = {
  dependsOnItemId: string
  /** For dropdown: option value. For checkbox: 'checked' | 'unchecked'. */
  showWhenValue: string
  /**
   * When the parent control is a dropdown, show if the current value is any of these (OR).
   * If set and non-empty, this takes precedence over `showWhenValue` for dropdown parents.
   */
  showWhenValues?: string[]
}

/** One item inside a settings panel or custom action button (checkbox, dropdown, or custom field) */
export type PortalSettingItem = {
  id: string
  type: 'checkbox' | 'dropdown' | 'custom_field'
  label: string
  /** For dropdown: option labels. For custom_field (dropdown subtype): options. */
  options?: string[]
  defaultChecked?: boolean
  /** For custom_field: 'text' | 'textarea' | 'dropdown' */
  customFieldSubtype?: 'text' | 'textarea' | 'dropdown'
  /** If false, hidden from user (admin can turn back on). Default true. */
  visibleToUser?: boolean
  /** If true, hidden from the portal builder item list unless "Show items hidden from admin" is on. End users still see the item if visibleToUser. */
  hideFromAdmin?: boolean
  /** Optional: show this item only when another item matches (e.g. checkbox visible when dropdown = X). */
  dependency?: PortalSettingDependency
  /**
   * Multiple dependency rules (two or more). When set, `dependency` should be omitted.
   * Use with `dependencyMode`: `all` = every rule must match (AND), `any` = at least one (OR).
   */
  dependencies?: PortalSettingDependency[]
  /** How to combine `dependencies` when there are two or more. Ignored for a single rule or legacy `dependency` only. */
  dependencyMode?: "all" | "any"
}

/** Custom action button (next to Settings); can have its own list of checkboxes, dropdowns, custom fields */
export type CustomActionButton = {
  id: string
  label: string
  items: PortalSettingItem[]
}

/**
 * Per-user portal config (tabs, settings, dropdowns). Missing or true = visible, false = hidden.
 * For users assigned to an office manager, `tabs.payments` defaults off in the UI until set to true.
 */
export type PortalConfig = {
  tabs?: Record<string, boolean>
  settings?: Record<string, boolean>
  dropdowns?: Record<string, boolean>
  /** Custom tabs/settings/dropdowns added by admin */
  customTabs?: PortalCustomItem[]
  customSettings?: PortalCustomItem[]
  customDropdowns?: PortalCustomItem[]
  /** Options per control (e.g. lead_source: ['Web', 'Phone'], leads_table_columns: ['name','phone','title']) */
  optionValues?: Record<string, string[]>
  /** Override labels for buttons and controls (e.g. create_lead: '+ Create Lead', settings: 'Settings') */
  controlLabels?: Record<string, string>
  /**
   * Override display labels for individual items inside a control’s item list.
   * Key: `${tabId}:${controlId}:${itemId}` (same tab/control as controlItems).
   */
  controlItemLabels?: Record<string, string>
  /** Custom buttons next to Settings (action row); each can have items: checkboxes, dropdowns, custom fields */
  customActionButtons?: CustomActionButton[]
  /** @deprecated Use customActionButtons. Kept for migration. */
  customHeaderButtons?: PortalCustomItem[]
  /** Items inside the Leads "Settings" modal (checkboxes, dropdowns, custom fields). Merged with defaults. */
  leadsSettingsItems?: PortalSettingItem[]
  /** Items per (tab, control) for any tab. Key: `${tabId}:${controlId}`. Same options as Leads Settings: checkboxes, dropdowns, custom fields, dependency, visible to user. */
  controlItems?: Record<string, PortalSettingItem[]>
  /** Custom action buttons per tab (each button has items). Leads uses customActionButtons for backward compat. */
  customActionButtonsByTab?: Record<string, CustomActionButton[]>
  /** Per-tab standard action visibility (false = hidden). */
  pageActions?: Record<string, Record<string, boolean>>
  /**
   * Office manager portal: hide toolbar buttons per page (false = hidden).
   * Stored on the managed user's profile; applies when an office manager works with that user.
   */
  om_page_actions?: {
    calendar?: Record<string, boolean>
    quotes?: Record<string, boolean>
    conversations?: Record<string, boolean>
  }
  /**
   * My T (Account) tab: hide whole blocks from the user. Missing key or true = visible; false = hidden.
   */
  accountSections?: Record<string, boolean>
  /** Sidebar tab order (tab ids). Default + custom tabs merged; missing ids append in default order. */
  sidebarTabOrder?: string[]
  /** Account (My T) section rows order in admin builder + user-facing block order when present. */
  accountSectionOrder?: string[]
  /**
   * When true, contractor portals (user + office manager) show legacy **Leads** and **Conversations** sidebar tabs.
   * Default omitted or false: those tabs stay hidden (admin can re-enable for rollback/testing).
   */
  show_legacy_contractor_leads_conversations?: boolean
  /**
   * Office manager portal: show the top **Working as** scoped-user bar.
   * Default omitted or false: hidden (legacy; enable from Admin portal if needed).
   */
  office_manager_show_working_as_bar?: boolean
  /**
   * Estimate Tools–only subscription ($49.99/mo): hides Customers & Scheduling, simplifies dashboard.
   */
  estimate_tools_only_package?: boolean
}

/** Self-serve `new_user` signups: only these sidebar tabs until an admin widens access in Portal builder. */
export const NEW_USER_VISIBLE_TAB_IDS: readonly string[] = ['dashboard', 'account', 'tech-support']

/** Default `profiles.portal_config` for new_user (and Signup / complete-signup). */
export function getDefaultPortalConfigForNewUser(): PortalConfig {
  const tabs: Record<string, boolean> = {}
  for (const id of USER_PORTAL_TAB_IDS) {
    tabs[id] = NEW_USER_VISIBLE_TAB_IDS.includes(id)
  }
  return { tabs }
}

const ESTIMATE_TOOLS_ONLY_TAB_IDS: readonly string[] = [
  "dashboard",
  "quotes",
  "payments",
  "account",
  "web-support",
  "tech-support",
]

/** Self-serve signup when user selects **Estimate Tools only** package ($49.99/mo). */
export function getPortalConfigForEstimateToolsOnlyUser(): PortalConfig {
  const tabs: Record<string, boolean> = {}
  for (const id of USER_PORTAL_TAB_IDS) {
    tabs[id] = ESTIMATE_TOOLS_ONLY_TAB_IDS.includes(id)
  }
  return { tabs, estimate_tools_only_package: true }
}

export type UpgradeNewUserOptions = {
  /** Keep Customers & Scheduling hidden after role moves from new_user → user. */
  preserveEstimateToolsOnlyTier?: boolean
}

/**
 * When an admin changes `new_user` → `user`, merge portal config so standard tabs are no longer forced off.
 * Preserves custom tabs, pageActions, controlItems, etc.; sets every `USER_PORTAL_TAB_IDS` entry to visible.
 * Estimate Tools–only accounts stay on the restricted tab set unless `preserveEstimateToolsOnlyTier` is cleared manually.
 */
export function upgradePortalConfigFromNewUserToUser(
  prev: PortalConfig | null | undefined,
  opts?: UpgradeNewUserOptions,
): PortalConfig {
  const preserve =
    opts?.preserveEstimateToolsOnlyTier === true ||
    (prev && typeof prev === "object" && prev.estimate_tools_only_package === true)
  if (preserve) {
    const locked = getPortalConfigForEstimateToolsOnlyUser()
    const base: PortalConfig =
      prev && typeof prev === "object" && !Array.isArray(prev) ? { ...prev } : {}
    return {
      ...base,
      tabs: { ...(locked.tabs ?? {}) },
      estimate_tools_only_package: true,
    }
  }
  const base: PortalConfig =
    prev && typeof prev === "object" && !Array.isArray(prev) ? { ...prev } : {}
  const mergedTabs: Record<string, boolean> = { ...(base.tabs ?? {}) }
  for (const id of USER_PORTAL_TAB_IDS) {
    mergedTabs[id] = true
  }
  return { ...base, tabs: mergedTabs, estimate_tools_only_package: false }
}

/** True if a standard page action should show (default visible). */
export function getPageActionVisible(
  portalConfig: PortalConfig | null,
  tabId: string,
  actionId: string
): boolean {
  const section = portalConfig?.pageActions?.[tabId]
  if (!section || typeof section !== "object") return true
  return section[actionId] !== false
}

export type OmToolbarPageId = "calendar" | "quotes" | "conversations"

/** True if an office-manager toolbar action should show (default visible). */
export function getOmPageActionVisible(
  portalConfig: PortalConfig | null,
  page: OmToolbarPageId,
  actionId: string
): boolean {
  const section = portalConfig?.om_page_actions?.[page]
  if (!section || typeof section !== "object") return true
  return section[actionId] !== false
}

export type PortalNavTab = { tab_id: string; label: string | null }

/**
 * Contractors linked to an office manager default to **no** Payments tab unless
 * `portal_config.tabs.payments === true` (set via office manager → User portal tabs → Save).
 */
export function filterUserPortalTabsForManagedPaymentsPolicy(
  tabs: PortalNavTab[],
  portalConfig: PortalConfig | null,
  managedByOfficeManager: boolean,
): PortalNavTab[] {
  if (!managedByOfficeManager) return tabs
  if (portalConfig?.tabs?.payments === true) return tabs
  return tabs.filter((t) => t.tab_id !== "payments")
}

/**
 * When a contractor is linked to an office manager, they are on a **bundled** plan unless the OM explicitly turns on
 * the Payments tab (`portal_config.tabs.payments === true`). Only then should they see separate Helcim billing,
 * dashboard payment alerts, etc.
 */
export function endUserHasSeparateBillingPortal(portalConfig: PortalConfig | null, managedByOfficeManager: boolean): boolean {
  if (!managedByOfficeManager) return true
  return portalConfig?.tabs?.payments === true
}

/** Ordered list for portal builder + Account page visibility */
export const ACCOUNT_PORTAL_SECTIONS: { id: string; label: string }[] = [
  { id: "profile", label: "Business profile (email, name, website, primary phone)" },
  { id: "business_address", label: "Business address" },
  { id: "service_area", label: "Service radius (miles from business address)" },
  { id: "mobile_app", label: "Mobile app — push, GPS, MyT" },
  { id: "business_hours", label: "Timezone & business hours" },
  { id: "call_forwarding", label: "Call forwarding & whisper (screening)" },
  { id: "voicemail", label: "Voicemail greeting (collapsed by default; AI or recorded)" },
  { id: "help_desk", label: "Help desk & toll-free greeting line (user-friendly copy)" },
  { id: "ai_automations", label: "AI automations (master toggle for AI options on other tabs)" },
  { id: "password_reset", label: "Password reset button" },
]

/** Merge saved order with canonical id list (unique, stable tail for new ids). */
export function mergeCanonicalOrder(savedOrder: string[] | undefined, canonicalIds: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  if (Array.isArray(savedOrder)) {
    for (const id of savedOrder) {
      if (canonicalIds.includes(id) && !seen.has(id)) {
        out.push(id)
        seen.add(id)
      }
    }
  }
  for (const id of canonicalIds) {
    if (!seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  return out
}

/** Ordered tab entries for user portal sidebar (default + custom labels). */
export function getPortalTabListForConfig(portalConfig: PortalConfig): Array<{ tab_id: string; label: string | null }> {
  const customTabs = portalConfig.customTabs ?? []
  const canonical = [...USER_PORTAL_TAB_IDS, ...customTabs.map((t) => t.id)]
  const order = mergeCanonicalOrder(portalConfig.sidebarTabOrder, canonical)
  const labelById = new Map<string, string | null>()
  for (const id of USER_PORTAL_TAB_IDS) labelById.set(id, TAB_ID_LABELS[id] ?? null)
  for (const t of customTabs) labelById.set(t.id, t.label)
  return order.filter((id) => labelById.has(id)).map((tab_id) => ({ tab_id, label: labelById.get(tab_id) ?? null }))
}

/** Office manager portal: same `sidebarTabOrder` as user config, canonical tabs exclude Settings. */
export function getOfficePortalTabListForConfig(portalConfig: PortalConfig): Array<{ tab_id: string; label: string | null }> {
  const customTabs = portalConfig.customTabs ?? []
  const canonical = [...OFFICE_PORTAL_TAB_IDS, ...customTabs.map((t) => t.id)]
  const order = mergeCanonicalOrder(portalConfig.sidebarTabOrder, canonical)
  const labelById = new Map<string, string | null>()
  for (const id of OFFICE_PORTAL_TAB_IDS) labelById.set(id, TAB_ID_LABELS[id] ?? null)
  for (const t of customTabs) labelById.set(t.id, t.label)
  return order.filter((id) => labelById.has(id)).map((tab_id) => ({ tab_id, label: labelById.get(tab_id) ?? null }))
}

/** Account portal section definitions in admin/user order. */
export function getOrderedAccountPortalSections(portalConfig: PortalConfig | null): { id: string; label: string }[] {
  const canonical = ACCOUNT_PORTAL_SECTIONS.map((s) => s.id)
  const savedRaw = portalConfig?.accountSectionOrder
  const saved = Array.isArray(savedRaw) ? savedRaw.map((id) => (id === "capture_documents" ? "ai_automations" : id)) : undefined
  const order = mergeCanonicalOrder(saved, canonical)
  const byId = new Map(ACCOUNT_PORTAL_SECTIONS.map((s) => [s.id, s]))
  return order.map((id) => byId.get(id)).filter((x): x is { id: string; label: string } => Boolean(x))
}

export function getAccountSectionVisible(portalConfig: PortalConfig | null, sectionId: string): boolean {
  const s = portalConfig?.accountSections
  if (!s || typeof s !== "object") return true
  if (sectionId === "ai_automations" && s.ai_automations === undefined && s.capture_documents !== undefined) {
    return s.capture_documents !== false
  }
  if (s[sectionId] === undefined) return true
  return s[sectionId] !== false
}

/** Portal item ids hidden when profiles.ai_assistant_visible is false (embed / non-AI items stay visible). */
export const PORTAL_ITEM_IDS_HIDDEN_WHEN_AI_DISABLED = new Set([
  "auto_response_use_ai",
  "auto_response_use_ai_require_approval",
  "auto_update_lead_status_ai",
  "ai_thread_summary_enabled",
  "estimate_template_use_ai",
  "receipt_template_use_ai",
  "conv_auto_reply_ai",
  "conv_auto_reply_ai_brief",
  "conv_auto_reply_ai_require_approval",
  "conv_auto_phone_tts_script",
  "conv_auto_phone_tts_require_approval",
  "ar_use_ai_customer_message",
  "ar_use_ai_customer_message_require_approval",
  "ar_customer_reminder_use_ai",
  "ar_customer_reminder_use_ai_require_approval",
  "quote_auto_reply_ai",
  "quote_auto_reply_ai_brief",
  "quote_auto_reply_ai_require_approval",
  "quote_auto_phone_tts_script",
  "quote_auto_phone_tts_require_approval",
  "quote_auto_scheduling_respect_calendar",
])

export function stripAiPortalItems(items: PortalSettingItem[], aiAutomationsEnabled: boolean): PortalSettingItem[] {
  if (aiAutomationsEnabled) return items
  return items.filter((i) => !PORTAL_ITEM_IDS_HIDDEN_WHEN_AI_DISABLED.has(i.id))
}

/** `${tabId}:${controlId}:${itemId}` — override label for this portal item in admin. */
export function controlItemLabelKey(tabId: string, controlId: string, itemId: string): string {
  return `${tabId}:${controlId}:${itemId}`
}

/** User-facing label: the item’s `label` from portal config (editable in admin). Legacy `controlItemLabels` is ignored. */
export function getControlItemDisplayLabel(
  _portalConfig: PortalConfig | null,
  _tabId: string,
  _controlId: string,
  item: PortalSettingItem,
): string {
  return item.label
}

/** Row is usable for evaluation (checkbox/text value or dropdown multi-option). */
function isValidPortalDependencyRow(d: unknown): d is PortalSettingDependency {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false
  const o = d as Record<string, unknown>
  if (typeof o.dependsOnItemId !== "string" || !o.dependsOnItemId.trim()) return false
  if (typeof o.showWhenValue === "string" && o.showWhenValue.trim() !== "") return true
  if (
    Array.isArray(o.showWhenValues) &&
    o.showWhenValues.length > 0 &&
    o.showWhenValues.every((x) => typeof x === "string" && String(x).trim() !== "")
  )
    return true
  return false
}

/** Normalize stored checkbox-like values for dependency comparison (legacy profiles / imports). */
export function normalizePortalCheckboxDependencyValue(raw: string): "checked" | "unchecked" | string {
  const t = (raw ?? "").trim().toLowerCase()
  if (t === "checked" || t === "true" || t === "1" || t === "yes") return "checked"
  if (t === "unchecked" || t === "false" || t === "0" || t === "no") return "unchecked"
  return (raw ?? "").trim()
}

function rawDependencyRuleCount(item: PortalSettingItem): number {
  const rawList = Array.isArray(item.dependencies) ? item.dependencies : []
  return rawList.length
}

/**
 * Admin saved a `dependencies` array but every row failed validation — do not treat as “no rules” (which would show the field always).
 */
export function portalItemHasBrokenDependencyRules(item: PortalSettingItem): boolean {
  const n = rawDependencyRuleCount(item)
  if (n === 0) return false
  const filtered = (Array.isArray(item.dependencies) ? item.dependencies : []).filter(isValidPortalDependencyRow)
  return filtered.length === 0 && !item.dependency
}

/**
 * Resolved list of dependency rules (legacy `dependency` or `dependencies`).
 * Empty `dependencies: []` falls back to `dependency` so AND/OR is not lost to a bad save.
 */
export function getPortalItemDependencyList(item: PortalSettingItem): PortalSettingDependency[] {
  const rawList = Array.isArray(item.dependencies) ? item.dependencies : []
  const filtered = rawList.filter(isValidPortalDependencyRow) as PortalSettingDependency[]
  if (filtered.length > 0) return filtered
  if (item.dependency && isValidPortalDependencyRow(item.dependency)) return [item.dependency]
  return []
}

/** AND vs OR: only meaningful when there are 2+ rules; otherwise always "all". */
export function getPortalItemDependencyJoinMode(item: PortalSettingItem): "all" | "any" {
  const deps = getPortalItemDependencyList(item)
  if (deps.length < 2) return "all"
  return item.dependencyMode === "any" ? "any" : "all"
}

/**
 * Canonical dependency shape for portal JSON (avoids stale `dependency` + `dependencies` fighting).
 * Call when saving items from the admin builder.
 */
export function sanitizePortalSettingItemDependencies(item: PortalSettingItem): PortalSettingItem {
  const multi = Array.isArray(item.dependencies) ? item.dependencies.filter(isValidPortalDependencyRow) : []
  if (multi.length >= 2) {
    return {
      ...item,
      dependency: undefined,
      dependencies: multi,
      dependencyMode: item.dependencyMode === "any" ? "any" : "all",
    }
  }
  if (multi.length === 1) {
    const { dependencies: _deps, dependencyMode: _mode, ...rest } = item
    return { ...rest, dependency: multi[0] }
  }
  if (item.dependency && isValidPortalDependencyRow(item.dependency)) {
    const { dependencies: _deps, dependencyMode: _mode, ...rest } = item
    return { ...rest, dependency: item.dependency }
  }
  const { dependency: _d, dependencies: _deps2, dependencyMode: _m2, ...clean } = item
  return clean
}

function isSinglePortalDependencySatisfied(
  dep: PortalSettingDependency,
  allItems: PortalSettingItem[],
  formValues: Record<string, string>,
): boolean {
  const depId = dep.dependsOnItemId
  const depItem = allItems.find((i) => i.id === depId)
  let depValue = formValues[depId] ?? ""
  if (depItem?.type === "checkbox") {
    const raw = String(depValue).trim()
    if (!raw) {
      depValue = depItem.defaultChecked ? "checked" : "unchecked"
    }
  } else if (depItem?.type === "dropdown" && !String(depValue).trim() && depItem.options?.length) {
    depValue = depItem.options[0]
  }
  if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
  const { showWhenValue, showWhenValues } = dep
  if (depItem?.type === "dropdown" && Array.isArray(showWhenValues) && showWhenValues.length > 0) {
    return showWhenValues.includes(depValue)
  }
  if (depItem?.type === "checkbox") {
    const left = normalizePortalCheckboxDependencyValue(depValue)
    if (Array.isArray(showWhenValues) && showWhenValues.length > 0) {
      return showWhenValues.some((v) => left === normalizePortalCheckboxDependencyValue(v))
    }
    const right = normalizePortalCheckboxDependencyValue(typeof showWhenValue === "string" ? showWhenValue : "")
    return left === right
  }
  return depValue === (typeof showWhenValue === "string" ? showWhenValue : "")
}

/** True when all dependency rules pass (AND) or any pass (OR), per `dependencyMode`. */
export function isPortalSettingDependencyVisible(
  item: PortalSettingItem,
  allItems: PortalSettingItem[],
  formValues: Record<string, string>,
): boolean {
  if (portalItemHasBrokenDependencyRules(item)) return false
  const deps = getPortalItemDependencyList(item)
  if (deps.length === 0) return true
  const mode = getPortalItemDependencyJoinMode(item)
  const results = deps.map((d) => isSinglePortalDependencySatisfied(d, allItems, formValues))
  return mode === "any" ? results.some(Boolean) : results.every(Boolean)
}

/** One-line summary for admin builder rows (sibling items = same control, exclude self). */
export function formatPortalItemDependenciesSummary(item: PortalSettingItem, siblingItems: PortalSettingItem[]): string {
  const deps = getPortalItemDependencyList(item)
  if (deps.length === 0) return "No dependency"
  const labelOf = (id: string) => siblingItems.find((o) => o.id === id)?.label ?? id
  const parts = deps.map((d) => {
    const valueStr = d.showWhenValues?.length ? `any of: ${d.showWhenValues.join(", ")}` : d.showWhenValue
    return `${labelOf(d.dependsOnItemId)} = ${valueStr}`
  })
  if (deps.length === 1) return `When ${parts[0]}`
  const join = getPortalItemDependencyJoinMode(item)
  const joiner = join === "any" ? " OR " : " AND "
  return (join === "any" ? "Any: " : "All: ") + parts.join(joiner)
}

const CONV_AUTO_PHONE_TTS_OPTION = "AI text to speech"

function adjustConversationAutomaticRepliesForAi(items: PortalSettingItem[], aiOn: boolean): PortalSettingItem[] {
  if (aiOn) return items
  return items.map((it) => {
    if (it.id === "conv_auto_phone_delivery" && it.options?.length) {
      return {
        ...it,
        options: it.options.filter((o) => o !== CONV_AUTO_PHONE_TTS_OPTION),
      }
    }
    return it
  })
}

function adjustQuoteAutomaticRepliesForAi(items: PortalSettingItem[], aiOn: boolean): PortalSettingItem[] {
  if (aiOn) return items
  return items.map((it) => {
    if (it.id === "quote_auto_phone_delivery" && it.options?.length) {
      return {
        ...it,
        options: it.options.filter((o) => o !== CONV_AUTO_PHONE_TTS_OPTION),
      }
    }
    return it
  })
}

/** Canonical conversation statuses (edit UI + automations). Legacy free text maps to these where possible. */
export const CONVERSATION_STATUS_OPTIONS = ["Open", "Contacted", "Pending info", "Qualified", "Lost"] as const

export function normalizeConversationStatus(raw: string | null | undefined): string {
  const t = (raw ?? "").trim()
  if (!t) return "Open"
  const lower = t.toLowerCase()
  const legacy: Record<string, string> = {
    open: "Open",
    contacted: "Contacted",
    "pending info": "Pending info",
    "information required": "Pending info",
    "info required": "Pending info",
    qualified: "Qualified",
    lost: "Lost",
  }
  if (legacy[lower]) return legacy[lower]
  if ((CONVERSATION_STATUS_OPTIONS as readonly string[]).includes(t)) return t
  return "Open"
}

/** If admin saved an empty list for these keys, merge app defaults (recurrence UI) instead of showing nothing. */
const CONTROL_ITEMS_MERGE_DEFAULTS_WHEN_EMPTY = new Set([
  "leads:settings",
  "quotes:auto_response_options",
  "calendar:auto_response_options",
  "calendar:add_item_to_calendar",
  "calendar:job_types",
  "quotes:add_quote_to_calendar",
  "conversations:conversation_settings",
  "conversations:automatic_replies",
  "quotes:estimate_template",
  "quotes:estimate_line_items",
  "quotes:job_types",
  "calendar:receipt_template",
  "calendar:completion_settings",
])

function mergeMissingRecurrencePortalItems(
  stored: PortalSettingItem[],
  defaults: PortalSettingItem[]
): PortalSettingItem[] {
  const seen = new Set(stored.map((i) => i.id))
  const out = [...stored]
  for (const d of defaults) {
    if (!seen.has(d.id)) out.push(d)
  }
  return out
}

/** Strip portal items that belong on the event card, not the Add to calendar form. */
export function isRemoveRecurrencePortalItem(item: PortalSettingItem): boolean {
  const t = `${item.id} ${item.label}`.toLowerCase()
  if (/\bremove\b/.test(t) && /recurr/.test(t)) return true
  return false
}

/** Get settings/control items for the user portal: from portal_config, filtered by visibleToUser. Use for any tab:control (e.g. leads:settings, conversations:conversation_settings). */
export function getControlItemsForUser(
  portalConfig: PortalConfig | null,
  tabId: string,
  controlId: string,
  opts?: { aiAutomationsEnabled?: boolean },
): PortalSettingItem[] {
  const key = `${tabId}:${controlId}`
  const defaults = getDefaultControlItems(tabId, controlId)
  let raw: PortalSettingItem[]
  if (key === "leads:settings") {
    const stored = portalConfig?.controlItems?.[key] ?? portalConfig?.leadsSettingsItems
    if (stored === undefined) {
      raw = [...defaults]
    } else {
      const arr = Array.isArray(stored) ? stored : []
      if (arr.length === 0 && CONTROL_ITEMS_MERGE_DEFAULTS_WHEN_EMPTY.has(key)) {
        raw = [...defaults]
      } else if (arr.length > 0 && CONTROL_ITEMS_MERGE_DEFAULTS_WHEN_EMPTY.has(key)) {
        raw = mergeMissingRecurrencePortalItems(arr, defaults)
      } else {
        raw = arr
      }
    }
  } else {
    const stored = portalConfig?.controlItems?.[key]
    if (stored !== undefined) {
      const arr = Array.isArray(stored) ? stored : []
      if (arr.length === 0 && CONTROL_ITEMS_MERGE_DEFAULTS_WHEN_EMPTY.has(key)) {
        raw = [...defaults]
      } else if (arr.length > 0 && CONTROL_ITEMS_MERGE_DEFAULTS_WHEN_EMPTY.has(key)) {
        raw = mergeMissingRecurrencePortalItems(arr, defaults)
      } else {
        raw = arr
      }
    } else {
      raw = [...defaults]
    }
  }
  const visible = (Array.isArray(raw) ? raw : []).filter((item) => item.visibleToUser !== false)
  const aiOn = opts?.aiAutomationsEnabled !== false
  let out = stripAiPortalItems(visible, aiOn)
  if (key === "conversations:automatic_replies") {
    out = adjustConversationAutomaticRepliesForAi(out, aiOn)
  }
  if (key === "quotes:auto_response_options") {
    out = adjustQuoteAutomaticRepliesForAi(out, aiOn)
  }
  return out.map((item) => ({
    ...item,
    label: getControlItemDisplayLabel(portalConfig, tabId, controlId, item),
  }))
}

/** Get Leads Settings items for the user portal (convenience). */
export function getLeadsSettingsItemsForUser(
  portalConfig: PortalConfig | null,
  opts?: { aiAutomationsEnabled?: boolean },
): PortalSettingItem[] {
  return getControlItemsForUser(portalConfig, "leads", "settings", opts)
}

/** Get custom action buttons for a tab (user portal). For leads uses customActionButtons; else customActionButtonsByTab. Returns buttons with items filtered by visibleToUser. */
export function getCustomActionButtonsForUser(
  portalConfig: PortalConfig | null,
  tabId: string
): CustomActionButton[] {
  let raw: CustomActionButton[] = []
  if (tabId === "leads") {
    raw = portalConfig?.customActionButtons ?? []
    const legacy = (portalConfig as { customHeaderButtons?: PortalCustomItem[] })?.customHeaderButtons
    if (raw.length === 0 && legacy?.length) raw = legacy.map((b) => ({ id: b.id, label: b.label, items: [] }))
  } else {
    raw = portalConfig?.customActionButtonsByTab?.[tabId] ?? []
  }
  return raw.map((btn) => ({
    ...btn,
    items: (btn.items ?? []).filter((item) => item.visibleToUser !== false),
  }))
}

/** Default items shown in Leads Settings modal (admin can add/remove/edit) */
export const DEFAULT_LEADS_SETTINGS_ITEMS: PortalSettingItem[] = [
  {
    id: "embed_lead_enabled",
    type: "checkbox",
    label: 'Public "contact us" form hosted on this Tradesman app (link it from my own website)',
    defaultChecked: false,
    visibleToUser: false,
  },
  {
    id: "embed_lead_slug",
    type: "custom_field",
    label: "Ending of the form’s address here: …/embed/lead/<you choose>. Letters, numbers, hyphens only; at least 3 characters (example: acme-roofing)",
    customFieldSubtype: "text",
    dependency: { dependsOnItemId: "embed_lead_enabled", showWhenValue: "checked" },
  },
  { id: 'default_lead_status', type: 'dropdown', label: 'Default lead status', options: ['New', 'Contacted', 'Qualified', 'Lost'] },
  { id: 'lead_source_settings', type: 'dropdown', label: 'Lead source', options: ['Email', 'Text', 'Phone call', 'Other'] },
  { id: 'send_auto_response', type: 'checkbox', label: 'Send auto response when a campaign/embed lead is new', defaultChecked: false },
  {
    id: 'auto_response_message',
    type: 'custom_field',
    label: 'Auto response message (template)',
    customFieldSubtype: 'textarea',
    dependency: { dependsOnItemId: 'send_auto_response', showWhenValue: 'checked' },
  },
  {
    id: 'auto_response_use_ai',
    type: 'checkbox',
    label: 'Utilize AI assistant to tailor the auto response from the lead details',
    defaultChecked: false,
    dependency: { dependsOnItemId: 'send_auto_response', showWhenValue: 'checked' },
  },
  {
    id: "auto_response_use_ai_require_approval",
    type: "checkbox",
    label: "Require user approval before sending AI auto-response to the customer",
    defaultChecked: false,
    dependency: { dependsOnItemId: "auto_response_use_ai", showWhenValue: "checked" },
  },
  { id: 'notify_new_lead', type: 'checkbox', label: 'Notify when new lead is captured', defaultChecked: false, visibleToUser: false },
  {
    id: 'notify_new_lead_channel',
    type: 'dropdown',
    label: 'Notification channel',
    options: ['Email', 'Text Message', 'App notification if registered'],
    dependency: { dependsOnItemId: 'notify_new_lead', showWhenValue: 'checked' },
    visibleToUser: false,
  },
  /** @deprecated use notify_new_lead; kept so existing portal JSON still maps behavior in server */
  { id: 'email_new_lead', type: 'checkbox', label: '(Legacy) Email when new lead is created', defaultChecked: false },
  {
    id: 'pause_lead_capture_campaigns',
    type: 'checkbox',
    label: 'Pause lead capture campaigns (web embed only; phone, SMS, and voicemail to your numbers still create leads)',
    defaultChecked: false,
  },
  /** @deprecated prefer pause_lead_capture_campaigns */
  { id: 'pause_lead_captures', type: 'checkbox', label: '(Legacy) Pause lead captures', defaultChecked: false },
  {
    id: 'auto_update_lead_status_ai',
    type: 'checkbox',
    label: 'Automatically update lead status from outreach and replies (AI — configure in AI settings)',
    defaultChecked: false,
  },
  {
    id: "lead_auto_conversation_when_qualified",
    type: "checkbox",
    label: 'When a lead is qualified (status "Qualified" or fit "Hot"), move the customer to Conversations if they are not there yet',
    defaultChecked: false,
  },
]

/** Controls that have options per page (for admin preview) */
export type PageControl = { id: string; label: string; type: 'dropdown' | 'button' | 'page_title' | 'header_button' | 'table_column' }

/** Default table column ids for Leads (order and visibility driven by optionValues.leads_table_columns) */
export const LEADS_TABLE_COLUMN_IDS = ['name', 'phone', 'title', 'status', 'description', 'created_at'] as const
export const LEADS_TABLE_COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  title: 'Job title',
  status: 'Status',
  description: 'Job description',
  created_at: 'Last update',
  /** @deprecated removed from default table */
  last_message: 'Last message',
}

/** Default sort-by options for Leads */
export const LEADS_SORT_OPTIONS = ['name', 'title', 'created_at'] as const
export const LEADS_SORT_LABELS: Record<string, string> = {
  name: 'Name',
  title: 'Job Description',
  created_at: 'Date',
}

/** Default filter options for Leads */
export const LEADS_FILTER_OPTIONS = ['by_name', 'by_phone', 'all', 'this_week'] as const
export const LEADS_FILTER_LABELS: Record<string, string> = {
  by_name: 'By name',
  by_phone: 'By phone',
  all: 'All',
  this_week: 'This week',
}

export const PAGE_CONTROLS: Record<string, PageControl[]> = {
  dashboard: [],
  leads: [
    { id: 'page_title', label: 'Page title (Leads)', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'create_lead', label: 'Create Lead', type: 'button' },
    { id: 'settings', label: 'Settings', type: 'button' },
    { id: 'filter', label: 'Filter', type: 'dropdown' },
    { id: 'sort_by', label: 'Sort by', type: 'dropdown' },
    { id: 'lead_source', label: 'Lead source', type: 'dropdown' },
    { id: 'status', label: 'Status', type: 'dropdown' },
    { id: 'priority', label: 'Priority', type: 'dropdown' },
    { id: 'table_columns', label: 'Table columns', type: 'table_column' },
  ],
  conversations: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'add_conversation', label: 'Add conversation', type: 'button' },
    { id: 'conversation_settings', label: 'Conversation settings', type: 'button' },
    { id: 'automatic_replies', label: 'Automatic replies', type: 'button' },
  ],
  quotes: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'add_customer_to_quotes', label: 'Add Customer to quotes', type: 'button' },
    { id: 'add_quote_to_calendar', label: 'Add quote to calendar (modal)', type: 'button' },
    { id: 'auto_response_options', label: 'Automatic replies', type: 'button' },
    { id: 'quote_settings', label: 'Quote settings', type: 'button' },
    { id: 'estimate_template', label: 'Estimate template', type: 'button' },
    { id: 'estimate_line_items', label: 'Estimate line items', type: 'button' },
    { id: 'job_types', label: 'Job types (Calendar)', type: 'button' },
    { id: 'status', label: 'Status', type: 'dropdown' },
  ],
  calendar: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'add_item_to_calendar', label: 'Add item to calendar', type: 'button' },
    { id: 'auto_response_options', label: 'Auto Response Options', type: 'button' },
    { id: 'job_types', label: 'Job Types', type: 'button' },
    { id: 'working_hours', label: 'Settings (working hours)', type: 'button' },
    { id: 'completion_settings', label: 'Job completion', type: 'button' },
    { id: 'receipt_template', label: 'Receipt template', type: 'button' },
    { id: 'customize_user', label: 'Customize user (ribbon / auto-assign)', type: 'button' },
    { id: 'job_type', label: 'Job type', type: 'dropdown' },
  ],
  customers: [],
  'web-support': [],
  'tech-support': [],
  settings: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'custom_fields', label: 'Custom fields', type: 'button' },
  ],
  account: [],
}

/** Default options for dropdown controls (suggested / available to add) */
export const DEFAULT_OPTIONS: Record<string, string[]> = {
  lead_source: ['Web', 'Referral', 'Phone', 'Walk-in', 'Other'],
  status: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'],
  priority: ['Low', 'Medium', 'High'],
  filter: ['By name', 'By phone', 'All', 'This week'],
  sort_by: ['Name', 'Job Description', 'Date'],
  job_type: ['Service', 'Install', 'Repair', 'Inspection', 'Other'],
  leads_table_columns: [...LEADS_TABLE_COLUMN_IDS],
}

/** Default settings sections that can be shown/hidden per user */
export const PORTAL_SETTING_KEYS = [
  'custom_fields',
  'working_hours',
  'quote_settings',
  'lead_settings',
  'conversation_settings',
] as const

export const PORTAL_SETTING_LABELS: Record<string, string> = {
  custom_fields: 'Custom fields (Settings page)',
  working_hours: 'Working hours (Calendar)',
  quote_settings: 'Quote settings',
  lead_settings: 'Lead settings',
  conversation_settings: 'Conversation settings',
}

/** Default dropdown/section keys that can be shown/hidden per user */
export const PORTAL_DROPDOWN_KEYS = [
  'lead_source',
  'job_type',
  'status',
  'priority',
] as const

export const PORTAL_DROPDOWN_LABELS: Record<string, string> = {
  lead_source: 'Lead source',
  job_type: 'Job type',
  status: 'Status',
  priority: 'Priority',
}

/** Control ids that use the full items editor (checkboxes, dropdowns, custom fields, dependency, visible to user). */
export const CONTROL_IDS_WITH_ITEMS: Record<string, string[]> = {
  leads: ['create_lead', 'settings', 'filter', 'sort_by', 'lead_source', 'status', 'priority'],
  conversations: ['add_conversation', 'conversation_settings', 'automatic_replies'],
  quotes: [
    'add_customer_to_quotes',
    'add_quote_to_calendar',
    'auto_response_options',
    'quote_settings',
    'estimate_template',
    'estimate_line_items',
    'job_types',
    'status',
  ],
  calendar: [
    'add_item_to_calendar',
    'auto_response_options',
    'job_types',
    'working_hours',
    'completion_settings',
    'receipt_template',
    'customize_user',
    'job_type',
  ],
  settings: ['custom_fields'],
  dashboard: [],
  customers: [],
  'web-support': [],
  'tech-support': [],
}

/** Default items for Quote settings (user portal) */
export const DEFAULT_QUOTE_SETTINGS_ITEMS: PortalSettingItem[] = [
  { id: 'quote_default_status', type: 'dropdown', label: 'Default quote status for new quotes', options: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Declined'] },
]

/** Quotes → Estimate line items: admin configures which quick templates appear; user saves presets in profile metadata. */
export const DEFAULT_QUOTE_ESTIMATE_LINE_ITEMS: PortalSettingItem[] = [
  { id: "eli_show_labor", type: "checkbox", label: "Offer Labor / hours line template", defaultChecked: true },
  { id: "eli_show_materials", type: "checkbox", label: "Offer Materials line template", defaultChecked: true },
  { id: "eli_show_travel", type: "checkbox", label: "Offer Travel / trip line template", defaultChecked: true },
  { id: "eli_show_misc", type: "checkbox", label: "Offer Miscellaneous line template", defaultChecked: true },
  {
    id: "eli_show_manpower",
    type: "checkbox",
    label: "Show crew / manpower on labor lines (quantity × crew for billing)",
    defaultChecked: true,
  },
  {
    id: "eli_default_labor_rate",
    type: "custom_field",
    customFieldSubtype: "text",
    label: "Suggested default labor rate ($/hr) for quick-add (number only)",
  },
  {
    id: "eli_sheet_note",
    type: "custom_field",
    customFieldSubtype: "textarea",
    label: "Note shown at top of Estimate Line Items (optional)",
  },
]

/** Quotes → Job types: reference same job_types rows as Calendar (read-only sheet + optional note). */
export const DEFAULT_QUOTE_JOB_TYPES_ITEMS: PortalSettingItem[] = [
  {
    id: "quote_job_types_note",
    type: "custom_field",
    customFieldSubtype: "textarea",
    label: "Optional note above the job type list (shared with Calendar job types)",
  },
]

/** Estimate export template (Quotes tab). Notes → profiles.document_template_quote; other options → profiles.metadata */
export const DEFAULT_ESTIMATE_TEMPLATE_ITEMS: PortalSettingItem[] = [
  {
    id: "estimate_template_notes",
    type: "custom_field",
    label: "Intro / header text (plain text, below the title — both PDF and Word)",
    customFieldSubtype: "textarea",
  },
  {
    id: "estimate_template_footer",
    type: "custom_field",
    label: "Footer text (totals context, terms, payment — plain text, after line items)",
    customFieldSubtype: "textarea",
  },
  {
    id: "estimate_template_include_prepared_date",
    type: "checkbox",
    label: "Include “Prepared” date on the document",
    defaultChecked: true,
  },
  {
    id: "estimate_template_show_line_numbers",
    type: "checkbox",
    label: "Number line items (1, 2, 3…)",
    defaultChecked: true,
  },
  {
    id: "estimate_template_show_logo",
    type: "checkbox",
    label: "Show company logo at the top of PDF and Word exports (when a logo URL is set)",
    defaultChecked: true,
  },
  {
    id: "estimate_template_logo_url",
    type: "custom_field",
    label: "Logo image URL (HTTPS). Upload below or paste a public PNG/JPEG link.",
    customFieldSubtype: "text",
  },
  {
    id: "estimate_template_include_legal",
    type: "checkbox",
    label: "Include legal terms (lite acknowledgment — not a substitute for attorney review)",
    defaultChecked: false,
  },
  {
    id: "estimate_template_legal_text",
    type: "custom_field",
    customFieldSubtype: "textarea",
    label: "Legal / acknowledgment text (plain text, before signatures)",
    dependency: { dependsOnItemId: "estimate_template_include_legal", showWhenValue: "checked" },
  },
  {
    id: "estimate_template_cancellation_fee",
    type: "custom_field",
    customFieldSubtype: "textarea",
    label: "Cancellation fee terms (optional; only when legal block is enabled)",
    dependency: { dependsOnItemId: "estimate_template_include_legal", showWhenValue: "checked" },
  },
  {
    id: "estimate_template_legal_signatures",
    type: "checkbox",
    label: "Include signature and date lines on the document",
    defaultChecked: true,
  },
  {
    id: "estimate_template_use_ai",
    type: "checkbox",
    label: "Use AI assistant to help refine estimate wording",
    defaultChecked: false,
  },
  {
    id: "estimate_template_specialty_inspection",
    type: "checkbox",
    label: "Enable specialty reports and documents",
    defaultChecked: false,
  },
  {
    id: "estimate_template_report_home",
    type: "checkbox",
    label: "Home Inspection Report (structure & property)",
    defaultChecked: false,
    dependency: { dependsOnItemId: "estimate_template_specialty_inspection", showWhenValue: "checked" },
  },
  {
    id: "estimate_template_report_pest",
    type: "checkbox",
    label: "Pest Inspection Report",
    defaultChecked: false,
    dependency: { dependsOnItemId: "estimate_template_specialty_inspection", showWhenValue: "checked" },
  },
  {
    id: "estimate_template_report_survey",
    type: "checkbox",
    label: "Survey Report",
    defaultChecked: false,
    dependency: { dependsOnItemId: "estimate_template_specialty_inspection", showWhenValue: "checked" },
  },
  {
    id: "estimate_template_report_body_shop",
    type: "checkbox",
    label: "Body Shop Repair documentation",
    defaultChecked: false,
    dependency: { dependsOnItemId: "estimate_template_specialty_inspection", showWhenValue: "checked" },
  },
]

/** Receipt PDF template (Calendar); notes map to profiles.document_template_receipt */
export const DEFAULT_RECEIPT_TEMPLATE_ITEMS: PortalSettingItem[] = [
  {
    id: "receipt_template_carry_from_estimate",
    type: "checkbox",
    label: "When saving, copy logo from Quotes → Estimate into receipt fields (optional; receipts already use the estimate logo if receipt URL is empty)",
    defaultChecked: false,
  },
  {
    id: "receipt_template_intro",
    type: "custom_field",
    label: "Intro / header on receipt PDF (plain text, below title)",
    customFieldSubtype: "textarea",
  },
  {
    id: "receipt_template_show_logo",
    type: "checkbox",
    label: "Show company logo on receipt PDF",
    defaultChecked: false,
  },
  {
    id: "receipt_template_logo_url",
    type: "custom_field",
    label: "Logo URL (HTTPS), optional — leave blank to use the same upload as Quotes → Estimate template",
    customFieldSubtype: "text",
    dependency: { dependsOnItemId: "receipt_template_show_logo", showWhenValue: "checked" },
  },
  {
    id: "receipt_template_notes",
    type: "custom_field",
    label: "Footer note on receipt PDF (plain text)",
    customFieldSubtype: "textarea",
  },
  {
    id: "receipt_template_use_ai",
    type: "checkbox",
    label: "Use AI assistant to help refine receipt wording when generating PDFs",
    defaultChecked: false,
  },
  {
    id: "receipt_template_itemize",
    type: "checkbox",
    label:
      "Itemize receipt PDF — list all cost lines (labor, materials, fees, etc. from the quote), mileage reimbursement (if miles + rate below), plus a supplies checklist from the event / job type",
    defaultChecked: false,
  },
  {
    id: "receipt_template_mileage_rate",
    type: "custom_field",
    label: "Mileage reimbursement ($ per mile, optional — multiplied by miles on the calendar event when itemizing)",
    customFieldSubtype: "text",
    dependency: { dependsOnItemId: "receipt_template_itemize", showWhenValue: "checked" },
  },
]

/** Quotes → Automatic replies (same shape as Conversations; ends with quote-specific scheduling / qualification). */
export const DEFAULT_QUOTE_AUTO_RESPONSE_ITEMS: PortalSettingItem[] = [
  {
    id: "quote_auto_reply_enabled",
    type: "checkbox",
    label: "Allow automatic replies",
    defaultChecked: false,
  },
  {
    id: "quote_auto_reply_method",
    type: "dropdown",
    label: "Contact method",
    options: ["Email", "Text message", "Phone call"],
    dependency: { dependsOnItemId: "quote_auto_reply_enabled", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_reply_message",
    type: "custom_field",
    label: "Message (email or SMS)",
    customFieldSubtype: "textarea",
    dependency: {
      dependsOnItemId: "quote_auto_reply_method",
      showWhenValue: "Email",
      showWhenValues: ["Email", "Text message"],
    },
  },
  {
    id: "quote_auto_reply_ai",
    type: "checkbox",
    label: "Allow AI automation for Auto Reply (uses quote + customer data + your summary)",
    defaultChecked: false,
    dependency: {
      dependsOnItemId: "quote_auto_reply_method",
      showWhenValue: "Email",
      showWhenValues: ["Email", "Text message"],
    },
  },
  {
    id: "quote_auto_reply_ai_require_approval",
    type: "checkbox",
    label: "Require user approval before sending AI-drafted email or SMS",
    defaultChecked: true,
    dependency: { dependsOnItemId: "quote_auto_reply_ai", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_reply_ai_brief",
    type: "custom_field",
    label: "Summary for AI (what you want communicated)",
    customFieldSubtype: "textarea",
    dependency: { dependsOnItemId: "quote_auto_reply_ai", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_phone_allow_automation",
    type: "checkbox",
    label: "Allow automated voice message",
    defaultChecked: false,
    dependency: { dependsOnItemId: "quote_auto_reply_method", showWhenValue: "Phone call" },
  },
  {
    id: "quote_auto_phone_delivery",
    type: "dropdown",
    label: "Voice delivery",
    options: ["Record in app", "Recording URL", CONV_AUTO_PHONE_TTS_OPTION],
    dependency: { dependsOnItemId: "quote_auto_phone_allow_automation", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_phone_recording_url",
    type: "custom_field",
    label: "Recording URL (or filled after in-app record)",
    customFieldSubtype: "text",
    dependency: {
      dependsOnItemId: "quote_auto_phone_delivery",
      showWhenValue: "Recording URL",
      showWhenValues: ["Recording URL", "Record in app"],
    },
  },
  {
    id: "quote_auto_phone_tts_script",
    type: "custom_field",
    label: "Script for AI text-to-speech call",
    customFieldSubtype: "textarea",
    dependency: { dependsOnItemId: "quote_auto_phone_delivery", showWhenValue: CONV_AUTO_PHONE_TTS_OPTION },
  },
  {
    id: "quote_auto_phone_tts_require_approval",
    type: "checkbox",
    label: "Require user approval before placing AI text-to-speech call",
    defaultChecked: false,
    dependencyMode: "all",
    dependencies: [
      { dependsOnItemId: "quote_auto_phone_allow_automation", showWhenValue: "checked" },
      { dependsOnItemId: "quote_auto_phone_delivery", showWhenValue: CONV_AUTO_PHONE_TTS_OPTION },
    ],
  },
  {
    id: "quote_auto_notify_when_qualified",
    type: "checkbox",
    label: "When quote status is Qualified — send notification to the customer (per contact method)",
    defaultChecked: false,
    dependency: { dependsOnItemId: "quote_auto_reply_enabled", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_qualified_criteria",
    type: "dropdown",
    label: "What decides Quote is Qualified",
    options: ["Signed quote attachment returned", "Manual approval", "AI decision"],
    dependency: { dependsOnItemId: "quote_auto_notify_when_qualified", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_scheduling_respect_calendar",
    type: "checkbox",
    label:
      "When using AI for scheduling, respect calendar rules (duplicate times, job-type assignees, office-manager routing)",
    defaultChecked: true,
    dependency: { dependsOnItemId: "quote_auto_reply_ai", showWhenValue: "checked" },
  },
  {
    id: "quote_auto_scheduling_hold_message",
    type: "custom_field",
    label: 'Hold message if time cannot be auto-booked (e.g. "We will reach back out to schedule…")',
    customFieldSubtype: "textarea",
    dependency: { dependsOnItemId: "quote_auto_reply_enabled", showWhenValue: "checked" },
  },
]

/** Default items for Calendar Auto Response Options */
export const DEFAULT_CALENDAR_AUTO_RESPONSE_ITEMS: PortalSettingItem[] = [
  { id: 'ar_remind_before_mins', type: 'custom_field', label: 'Remind before event (minutes)', customFieldSubtype: 'text' },
  {
    id: "ar_customer_reminder_use_ai",
    type: "checkbox",
    label: "Use AI to draft customer reminder messages (when calendar reminder sending is enabled in product)",
    defaultChecked: false,
  },
  {
    id: "ar_customer_reminder_use_ai_require_approval",
    type: "checkbox",
    label: "Require user approval before sending AI-drafted reminder to the customer",
    defaultChecked: false,
    dependency: { dependsOnItemId: "ar_customer_reminder_use_ai", showWhenValue: "checked" },
  },
]

/** Default items for Calendar Settings (working hours / general settings) */
export const DEFAULT_CALENDAR_WORKING_HOURS_ITEMS: PortalSettingItem[] = [
  { id: 'no_duplicate_times', type: 'checkbox', label: 'Do not allow duplicate times', defaultChecked: false },
]

/** Calendar → Job completion (receipts, permissions, notifications). Values stored in profiles.metadata.calendarCompletionValues */
export const DEFAULT_CALENDAR_COMPLETION_ITEMS: PortalSettingItem[] = [
  {
    id: "calendar_completion_worker_may_message_customer",
    type: "checkbox",
    label: "Assigned user may send completion receipt to the customer (email/SMS through the platform)",
    defaultChecked: false,
  },
  {
    id: "calendar_completion_notify_office_manager",
    type: "checkbox",
    label: "Notify office manager when a job is marked complete",
    defaultChecked: true,
  },
  {
    id: "calendar_completion_om_copy_customer_receipt",
    type: "checkbox",
    label: "When a receipt is sent to the customer, send a copy to the office manager email (if configured)",
    defaultChecked: false,
    dependency: { dependsOnItemId: "calendar_completion_worker_may_message_customer", showWhenValue: "checked" },
  },
]

/** Default recurrence frequency options (8 items) */
export const DEFAULT_RECURRENCE_FREQUENCY_OPTIONS: string[] = [
  "Daily",
  "Weekly",
  "Every 2 Weeks",
  "Monthly",
  "Every 2 Months",
  "Every 3 Months",
  "Quarterly",
  "Yearly",
]

/** Default recurrence duration/mode options */
export const DEFAULT_RECURRENCE_END_MODE_OPTIONS: string[] = [
  "Indefinite (no end)",
  "By number of occurrences",
  "Until a specific date",
  "For a time span",
]

/** Default items for Calendar + Quote "recurring event" controls */
export const DEFAULT_RECURRENCE_PORTAL_ITEMS: PortalSettingItem[] = [
  {
    id: "make_event_recurring",
    type: "checkbox",
    label: "Make event recurring",
    defaultChecked: false,
  },
  {
    id: "recurring_event_frequency",
    type: "dropdown",
    label: "Recurring event frequency",
    options: [...DEFAULT_RECURRENCE_FREQUENCY_OPTIONS],
    dependency: { dependsOnItemId: "make_event_recurring", showWhenValue: "checked" },
  },
  {
    id: "recurrence_end_mode",
    type: "dropdown",
    label: "Recurrence duration",
    options: [...DEFAULT_RECURRENCE_END_MODE_OPTIONS],
  },
  {
    id: "recurrence_occurrence_count",
    type: "custom_field",
    label: "Number of instances",
    customFieldSubtype: "text",
    dependency: { dependsOnItemId: "recurrence_end_mode", showWhenValue: "By number of occurrences" },
  },
  {
    id: "recurrence_until_date",
    type: "custom_field",
    label: "Until date (YYYY-MM-DD)",
    customFieldSubtype: "text",
    dependency: { dependsOnItemId: "recurrence_end_mode", showWhenValue: "Until a specific date" },
  },
  {
    id: "recurrence_period_amount",
    type: "custom_field",
    label: "Length of time (amount)",
    customFieldSubtype: "text",
    dependency: { dependsOnItemId: "recurrence_end_mode", showWhenValue: "For a time span" },
  },
  {
    id: "recurrence_period_unit",
    type: "dropdown",
    label: "Length of time (unit)",
    options: ["Weeks", "Months", "Years"],
    dependency: { dependsOnItemId: "recurrence_end_mode", showWhenValue: "For a time span" },
  },
]

/** Default items for Conversation settings (voicemail transcription controls are added per-client in Admin → portal builder). */
export const DEFAULT_CONVERSATION_SETTINGS_ITEMS: PortalSettingItem[] = [
  { id: 'show_internal_conversations', type: 'checkbox', label: 'Show internal conversations', defaultChecked: true },
  {
    id: "ai_thread_summary_enabled",
    type: "checkbox",
    label: "Allow AI thread summary (Summarize thread button)",
    defaultChecked: false,
  },
]

/** Automatic replies (Conversations toolbar): email/SMS AI paths, phone recording/TTS, quote-on-qualified, AI status (server wiring separate). */
export const DEFAULT_CONVERSATION_AUTOMATIC_REPLIES_ITEMS: PortalSettingItem[] = [
  {
    id: "conv_auto_reply_enabled",
    type: "checkbox",
    label: "Allow automatic replies",
    defaultChecked: false,
  },
  {
    id: "conv_auto_reply_method",
    type: "dropdown",
    label: "Contact method",
    options: ["Email", "Text message", "Phone call"],
    dependency: { dependsOnItemId: "conv_auto_reply_enabled", showWhenValue: "checked" },
  },
  {
    id: "conv_auto_reply_message",
    type: "custom_field",
    label: "Message (email or SMS)",
    customFieldSubtype: "textarea",
    dependency: {
      dependsOnItemId: "conv_auto_reply_method",
      showWhenValue: "Email",
      showWhenValues: ["Email", "Text message"],
    },
  },
  {
    id: "conv_auto_reply_ai",
    type: "checkbox",
    label: "Allow AI automation (uses thread + customer data + your summary)",
    defaultChecked: false,
    dependency: {
      dependsOnItemId: "conv_auto_reply_method",
      showWhenValue: "Email",
      showWhenValues: ["Email", "Text message"],
    },
  },
  {
    id: "conv_auto_reply_ai_require_approval",
    type: "checkbox",
    label: "Require user approval before sending AI-drafted email or SMS",
    defaultChecked: false,
    dependency: { dependsOnItemId: "conv_auto_reply_ai", showWhenValue: "checked" },
  },
  {
    id: "conv_auto_reply_ai_brief",
    type: "custom_field",
    label: "Summary for AI (what you want communicated)",
    customFieldSubtype: "textarea",
    dependency: { dependsOnItemId: "conv_auto_reply_ai", showWhenValue: "checked" },
  },
  {
    id: "conv_auto_phone_allow_automation",
    type: "checkbox",
    label: "Allow automated voice message",
    defaultChecked: false,
    dependency: { dependsOnItemId: "conv_auto_reply_method", showWhenValue: "Phone call" },
  },
  {
    id: "conv_auto_phone_delivery",
    type: "dropdown",
    label: "Voice delivery",
    options: ["Record in app", "Recording URL", CONV_AUTO_PHONE_TTS_OPTION],
    dependency: { dependsOnItemId: "conv_auto_phone_allow_automation", showWhenValue: "checked" },
  },
  {
    id: "conv_auto_phone_recording_url",
    type: "custom_field",
    label: "Recording URL (or filled after in-app record)",
    customFieldSubtype: "text",
    dependency: {
      dependsOnItemId: "conv_auto_phone_delivery",
      showWhenValue: "Recording URL",
      showWhenValues: ["Recording URL", "Record in app"],
    },
  },
  {
    id: "conv_auto_phone_tts_script",
    type: "custom_field",
    label: "Script for AI text-to-speech call",
    customFieldSubtype: "textarea",
    dependency: { dependsOnItemId: "conv_auto_phone_delivery", showWhenValue: CONV_AUTO_PHONE_TTS_OPTION },
  },
  {
    id: "conv_auto_phone_tts_require_approval",
    type: "checkbox",
    label: "Require user approval before placing AI text-to-speech call",
    defaultChecked: false,
    dependencyMode: "all",
    dependencies: [
      { dependsOnItemId: "conv_auto_phone_allow_automation", showWhenValue: "checked" },
      { dependsOnItemId: "conv_auto_phone_delivery", showWhenValue: CONV_AUTO_PHONE_TTS_OPTION },
    ],
  },
]

/** Default items for a control when none saved. Key: `${tabId}:${controlId}`. */
export function getDefaultControlItems(tabId: string, controlId: string): PortalSettingItem[] {
  const key = `${tabId}:${controlId}`
  if (key === 'leads:create_lead') return []
  if (key === 'leads:settings') return [...DEFAULT_LEADS_SETTINGS_ITEMS]
  if (key === 'quotes:quote_settings') return [...DEFAULT_QUOTE_SETTINGS_ITEMS]
  if (key === "quotes:estimate_template") return [...DEFAULT_ESTIMATE_TEMPLATE_ITEMS]
  if (key === "quotes:estimate_line_items") return [...DEFAULT_QUOTE_ESTIMATE_LINE_ITEMS]
  if (key === "quotes:job_types") return [...DEFAULT_QUOTE_JOB_TYPES_ITEMS]
  if (key === 'quotes:auto_response_options') return [...DEFAULT_QUOTE_AUTO_RESPONSE_ITEMS]
  if (key === 'calendar:auto_response_options') return [...DEFAULT_CALENDAR_AUTO_RESPONSE_ITEMS]
  if (key === 'calendar:working_hours') return [...DEFAULT_CALENDAR_WORKING_HOURS_ITEMS]
  if (key === "calendar:receipt_template") return [...DEFAULT_RECEIPT_TEMPLATE_ITEMS]
  if (key === "calendar:completion_settings") return [...DEFAULT_CALENDAR_COMPLETION_ITEMS]
  if (key === 'calendar:add_item_to_calendar') return [...DEFAULT_RECURRENCE_PORTAL_ITEMS]
  if (key === 'calendar:job_types') return [...DEFAULT_RECURRENCE_PORTAL_ITEMS]
  if (key === 'calendar:customize_user') return []
  if (key === 'quotes:add_quote_to_calendar') return [...DEFAULT_RECURRENCE_PORTAL_ITEMS]
  if (key === 'conversations:conversation_settings') return [...DEFAULT_CONVERSATION_SETTINGS_ITEMS]
  if (key === "conversations:automatic_replies") return [...DEFAULT_CONVERSATION_AUTOMATIC_REPLIES_ITEMS]
  const opts = DEFAULT_OPTIONS[controlId]
  if (opts?.length) {
    return [{ id: controlId + '_options', type: 'dropdown', label: PAGE_CONTROLS[tabId]?.find((c) => c.id === controlId)?.label ?? controlId, options: [...opts] }]
  }
  return []
}
