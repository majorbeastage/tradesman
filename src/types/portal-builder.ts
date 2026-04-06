/** Client (tenant) – each has its own portal config and custom fields */
export type Client = {
  id: string
  name: string
  slug: string | null
  created_at?: string
  updated_at?: string
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
  'quotes',
  'calendar',
  'customers',
  'account',
  'web-support',
  'tech-support',
  'settings',
] as const

export const OFFICE_PORTAL_TAB_IDS = [
  'dashboard',
  'leads',
  'conversations',
  'quotes',
  'calendar',
  'customers',
  'account',
  'web-support',
  'tech-support',
] as const

export const TAB_ID_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  conversations: 'Conversations',
  quotes: 'Quotes',
  calendar: 'Calendar',
  customers: 'Customers',
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
}

/** Custom action button (next to Settings); can have its own list of checkboxes, dropdowns, custom fields */
export type CustomActionButton = {
  id: string
  label: string
  items: PortalSettingItem[]
}

/** Per-user portal config (tabs, settings, dropdowns). Missing or true = visible, false = hidden. */
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
  }
  /**
   * My T (Account) tab: hide whole blocks from the user. Missing key or true = visible; false = hidden.
   */
  accountSections?: Record<string, boolean>
  /** Sidebar tab order (tab ids). Default + custom tabs merged; missing ids append in default order. */
  sidebarTabOrder?: string[]
  /** Account (My T) section rows order in admin builder + user-facing block order when present. */
  accountSectionOrder?: string[]
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

/** True if an office-manager toolbar action should show (default visible). */
export function getOmPageActionVisible(
  portalConfig: PortalConfig | null,
  page: "calendar" | "quotes",
  actionId: string
): boolean {
  const section = portalConfig?.om_page_actions?.[page]
  if (!section || typeof section !== "object") return true
  return section[actionId] !== false
}

/** Ordered list for portal builder + Account page visibility */
export const ACCOUNT_PORTAL_SECTIONS: { id: string; label: string }[] = [
  { id: "profile", label: "Business profile (email, name, website, primary phone)" },
  { id: "business_address", label: "Business address" },
  { id: "service_area", label: "Service radius (miles from business address)" },
  { id: "business_hours", label: "Timezone & business hours" },
  { id: "call_forwarding", label: "Call forwarding & whisper (screening)" },
  { id: "voicemail", label: "Voicemail greeting (collapsed by default; AI or recorded)" },
  { id: "help_desk", label: "Help desk & toll-free greeting line (user-friendly copy)" },
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
  const order = mergeCanonicalOrder(portalConfig?.accountSectionOrder, canonical)
  const byId = new Map(ACCOUNT_PORTAL_SECTIONS.map((s) => [s.id, s]))
  return order.map((id) => byId.get(id)).filter((x): x is { id: string; label: string } => Boolean(x))
}

export function getAccountSectionVisible(portalConfig: PortalConfig | null, sectionId: string): boolean {
  const s = portalConfig?.accountSections
  if (!s || typeof s !== "object" || s[sectionId] === undefined) return true
  return s[sectionId] !== false
}

/** If admin saved an empty list for these keys, merge app defaults (recurrence UI) instead of showing nothing. */
const CONTROL_ITEMS_MERGE_DEFAULTS_WHEN_EMPTY = new Set([
  "calendar:add_item_to_calendar",
  "calendar:job_types",
  "quotes:add_quote_to_calendar",
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
  controlId: string
): PortalSettingItem[] {
  const key = `${tabId}:${controlId}`
  const defaults = getDefaultControlItems(tabId, controlId)
  let raw: PortalSettingItem[]
  if (key === "leads:settings") {
    raw = (portalConfig?.controlItems?.[key] ?? portalConfig?.leadsSettingsItems ?? DEFAULT_LEADS_SETTINGS_ITEMS) as PortalSettingItem[]
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
  return (Array.isArray(raw) ? raw : []).filter((item) => item.visibleToUser !== false)
}

/** Get Leads Settings items for the user portal (convenience). */
export function getLeadsSettingsItemsForUser(portalConfig: PortalConfig | null): PortalSettingItem[] {
  return getControlItemsForUser(portalConfig, "leads", "settings")
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
  { id: 'default_lead_status', type: 'dropdown', label: 'Default lead status', options: ['New', 'Contacted', 'Qualified', 'Lost'] },
  { id: 'lead_source_settings', type: 'dropdown', label: 'Lead source', options: ['Email', 'Text', 'Phone call', 'Other'] },
  { id: 'send_auto_response', type: 'checkbox', label: 'Send Auto Response if Lead is New', defaultChecked: false },
  { id: 'email_new_lead', type: 'checkbox', label: 'Email when new lead is created', defaultChecked: false },
  { id: 'notify_assigned', type: 'checkbox', label: 'Notify when lead is assigned to me', defaultChecked: false },
  { id: 'pause_lead_captures', type: 'checkbox', label: 'Pause Lead Captures', defaultChecked: false },
]

/** Controls that have options per page (for admin preview) */
export type PageControl = { id: string; label: string; type: 'dropdown' | 'button' | 'page_title' | 'header_button' | 'table_column' }

/** Default table column ids for Leads (order and visibility driven by optionValues.leads_table_columns) */
export const LEADS_TABLE_COLUMN_IDS = ['name', 'phone', 'title', 'last_message', 'created_at'] as const
export const LEADS_TABLE_COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  title: 'Job Description',
  last_message: 'Last Message',
  created_at: 'Last Update',
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
  ],
  quotes: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'add_customer_to_quotes', label: 'Add Customer to quotes', type: 'button' },
    { id: 'add_quote_to_calendar', label: 'Add quote to calendar (modal)', type: 'button' },
    { id: 'auto_response_options', label: 'Auto Response Options', type: 'button' },
    { id: 'quote_settings', label: 'Quote settings', type: 'button' },
    { id: 'status', label: 'Status', type: 'dropdown' },
  ],
  calendar: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'add_item_to_calendar', label: 'Add item to calendar', type: 'button' },
    { id: 'auto_response_options', label: 'Auto Response Options', type: 'button' },
    { id: 'job_types', label: 'Job Types', type: 'button' },
    { id: 'working_hours', label: 'Settings (working hours)', type: 'button' },
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
  conversations: ['add_conversation', 'conversation_settings'],
  quotes: ['add_customer_to_quotes', 'add_quote_to_calendar', 'auto_response_options', 'quote_settings', 'status'],
  calendar: ['add_item_to_calendar', 'auto_response_options', 'job_types', 'working_hours', 'customize_user', 'job_type'],
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

/** Default items for Quotes Auto Response Options (matches user portal built-in options) */
export const DEFAULT_QUOTE_AUTO_RESPONSE_ITEMS: PortalSettingItem[] = [
  { id: 'ar_on_quote_created', type: 'checkbox', label: 'When a quote is created — send an auto response to the customer', defaultChecked: false },
  { id: 'ar_on_quote_sent', type: 'checkbox', label: 'When a quote is sent — send an auto response', defaultChecked: false },
  { id: 'ar_on_quote_viewed', type: 'checkbox', label: 'When a quote is viewed (by customer) — send an auto response', defaultChecked: false },
  { id: 'ar_delay_minutes', type: 'custom_field', label: 'Delay before sending (minutes)', customFieldSubtype: 'text' },
]

/** Default items for Calendar Auto Response Options */
export const DEFAULT_CALENDAR_AUTO_RESPONSE_ITEMS: PortalSettingItem[] = [
  { id: 'ar_remind_before_mins', type: 'custom_field', label: 'Remind before event (minutes)', customFieldSubtype: 'text' },
]

/** Default items for Calendar Settings (working hours / general settings) */
export const DEFAULT_CALENDAR_WORKING_HOURS_ITEMS: PortalSettingItem[] = [
  { id: 'no_duplicate_times', type: 'checkbox', label: 'Do not allow duplicate times', defaultChecked: false },
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

/** Default items for Conversation settings */
export const DEFAULT_CONVERSATION_SETTINGS_ITEMS: PortalSettingItem[] = [
  { id: 'show_internal_conversations', type: 'checkbox', label: 'Show Internal Conversations', defaultChecked: true },
]

/** Default items for a control when none saved. Key: `${tabId}:${controlId}`. */
export function getDefaultControlItems(tabId: string, controlId: string): PortalSettingItem[] {
  const key = `${tabId}:${controlId}`
  if (key === 'leads:create_lead') return []
  if (key === 'leads:settings') return [...DEFAULT_LEADS_SETTINGS_ITEMS]
  if (key === 'quotes:quote_settings') return [...DEFAULT_QUOTE_SETTINGS_ITEMS]
  if (key === 'quotes:auto_response_options') return [...DEFAULT_QUOTE_AUTO_RESPONSE_ITEMS]
  if (key === 'calendar:auto_response_options') return [...DEFAULT_CALENDAR_AUTO_RESPONSE_ITEMS]
  if (key === 'calendar:working_hours') return [...DEFAULT_CALENDAR_WORKING_HOURS_ITEMS]
  if (key === 'calendar:add_item_to_calendar') return [...DEFAULT_RECURRENCE_PORTAL_ITEMS]
  if (key === 'calendar:job_types') return [...DEFAULT_RECURRENCE_PORTAL_ITEMS]
  if (key === 'calendar:customize_user') return []
  if (key === 'quotes:add_quote_to_calendar') return [...DEFAULT_RECURRENCE_PORTAL_ITEMS]
  if (key === 'conversations:conversation_settings') return [...DEFAULT_CONVERSATION_SETTINGS_ITEMS]
  const opts = DEFAULT_OPTIONS[controlId]
  if (opts?.length) {
    return [{ id: controlId + '_options', type: 'dropdown', label: PAGE_CONTROLS[tabId]?.find((c) => c.id === controlId)?.label ?? controlId, options: [...opts] }]
  }
  return []
}
