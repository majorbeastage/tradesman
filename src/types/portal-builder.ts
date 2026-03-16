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

/** Per-user portal config (tabs, settings, dropdowns). Missing or true = visible, false = hidden. */
export type PortalConfig = {
  tabs?: Record<string, boolean>
  settings?: Record<string, boolean>
  dropdowns?: Record<string, boolean>
  /** Custom tabs/settings/dropdowns added by admin */
  customTabs?: PortalCustomItem[]
  customSettings?: PortalCustomItem[]
  customDropdowns?: PortalCustomItem[]
  /** Options per control (e.g. lead_source: ['Web', 'Phone'], status: ['New', 'Contacted']) */
  optionValues?: Record<string, string[]>
}

/** Controls that have options per page (for admin preview) */
export type PageControl = { id: string; label: string; type: 'dropdown' | 'button' }

export const PAGE_CONTROLS: Record<string, PageControl[]> = {
  dashboard: [],
  leads: [
    { id: 'lead_source', label: 'Lead source', type: 'dropdown' },
    { id: 'status', label: 'Status', type: 'dropdown' },
    { id: 'priority', label: 'Priority', type: 'dropdown' },
    { id: 'filter', label: 'Filter', type: 'dropdown' },
    { id: 'add_lead', label: 'Add lead', type: 'button' },
  ],
  conversations: [
    { id: 'conversation_settings', label: 'Conversation settings', type: 'button' },
  ],
  quotes: [
    { id: 'quote_settings', label: 'Quote settings', type: 'button' },
    { id: 'status', label: 'Status', type: 'dropdown' },
  ],
  calendar: [
    { id: 'working_hours', label: 'Working hours', type: 'button' },
    { id: 'job_type', label: 'Job type', type: 'dropdown' },
  ],
  customers: [],
  'web-support': [],
  'tech-support': [],
  settings: [
    { id: 'custom_fields', label: 'Custom fields', type: 'button' },
  ],
}

/** Default options for dropdown controls (suggested / available to add) */
export const DEFAULT_OPTIONS: Record<string, string[]> = {
  lead_source: ['Web', 'Referral', 'Phone', 'Walk-in', 'Other'],
  status: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'],
  priority: ['Low', 'Medium', 'High'],
  filter: ['All', 'This week', 'This month'],
  job_type: ['Service', 'Install', 'Repair', 'Inspection', 'Other'],
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
