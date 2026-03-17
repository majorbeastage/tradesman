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
    { id: 'conversation_settings', label: 'Conversation settings', type: 'button' },
  ],
  quotes: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'quote_settings', label: 'Quote settings', type: 'button' },
    { id: 'status', label: 'Status', type: 'dropdown' },
  ],
  calendar: [
    { id: 'page_title', label: 'Page title', type: 'page_title' },
    { id: 'custom_header_button', label: 'Custom button (next to Settings)', type: 'header_button' },
    { id: 'working_hours', label: 'Working hours', type: 'button' },
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
  leads: ['settings', 'filter', 'sort_by', 'lead_source', 'status', 'priority'],
  conversations: ['conversation_settings'],
  quotes: ['quote_settings', 'status'],
  calendar: ['working_hours', 'job_type'],
  settings: ['custom_fields'],
  dashboard: [],
  customers: [],
  'web-support': [],
  'tech-support': [],
}

/** Default items for a control when none saved. Key: `${tabId}:${controlId}`. */
export function getDefaultControlItems(tabId: string, controlId: string): PortalSettingItem[] {
  const key = `${tabId}:${controlId}`
  if (key === 'leads:settings') return [...DEFAULT_LEADS_SETTINGS_ITEMS]
  const opts = DEFAULT_OPTIONS[controlId]
  if (opts?.length) {
    return [{ id: controlId + '_options', type: 'dropdown', label: PAGE_CONTROLS[tabId]?.find((c) => c.id === controlId)?.label ?? controlId, options: [...opts] }]
  }
  return []
}
