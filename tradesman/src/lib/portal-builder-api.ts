import { supabase } from './supabase'
import type { Client, PortalTab, CustomField, CustomFieldDependency, DropdownOption } from '../types/portal-builder'

export type { Client, PortalTab, CustomField, CustomFieldDependency, DropdownOption }

const CLIENTS = 'clients'
const PORTAL_TABS = 'portal_tabs'
const CUSTOM_FIELDS = 'custom_fields'
const CUSTOM_FIELD_DEPS = 'custom_field_dependencies'

export async function fetchClients(): Promise<Client[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(CLIENTS).select('*').order('name')
  if (error) return [] // Don't throw so admin UI can still show a fallback
  return (data ?? []) as Client[]
}

export async function createClient(name: string, slug: string | null = null): Promise<Client> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.from(CLIENTS).insert({ name, slug: slug || name.toLowerCase().replace(/\s+/g, '-') }).select().single()
  if (error) throw error
  return data as Client
}

export async function updateClient(id: string, updates: { name?: string; slug?: string | null }): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from(CLIENTS).update(updates).eq('id', id)
  if (error) throw error
}

export async function fetchPortalTabs(clientId: string, portalType: 'user' | 'office_manager'): Promise<PortalTab[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(PORTAL_TABS)
    .select('*')
    .eq('client_id', clientId)
    .eq('portal_type', portalType)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as PortalTab[]
}

export async function upsertPortalTab(row: {
  client_id: string
  portal_type: 'user' | 'office_manager'
  tab_id: string
  label?: string | null
  visible?: boolean
  sort_order?: number
}): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from(PORTAL_TABS).upsert(row, {
    onConflict: 'client_id,portal_type,tab_id',
  })
  if (error) throw error
}

export async function fetchCustomFields(clientId: string): Promise<CustomField[]> {
  if (!supabase) return []
  const { data: fields, error: fieldsError } = await supabase
    .from(CUSTOM_FIELDS)
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order')
  if (fieldsError) throw fieldsError
  const list = (fields ?? []) as (CustomField & { options?: unknown })[]
  const { data: deps } = await supabase.from(CUSTOM_FIELD_DEPS).select('*').in('custom_field_id', list.map((f) => f.id))
  const depsList = (deps ?? []) as CustomFieldDependency[]
  return list.map((f) => {
    const options = Array.isArray(f.options) ? f.options : typeof f.options === 'object' && f.options !== null ? [] : []
    return {
      ...f,
      options: options as DropdownOption[],
      dependencies: depsList.filter((d) => d.custom_field_id === f.id),
    }
  })
}

export async function createCustomField(params: {
  client_id: string
  type: 'checkbox' | 'dropdown' | 'text' | 'textarea'
  key: string
  label: string
  placeholder?: string | null
  options?: DropdownOption[]
  default_value?: string | null
  sort_order?: number
}): Promise<CustomField> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from(CUSTOM_FIELDS)
    .insert({
      ...params,
      options: params.options ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return { ...data, options: (data.options ?? []) as DropdownOption[], dependencies: [] }
}

export async function updateCustomField(
  id: string,
  updates: Partial<{ type: CustomField['type']; key: string; label: string; placeholder: string | null; options: DropdownOption[]; default_value: string | null; sort_order: number }>
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from(CUSTOM_FIELDS).update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteCustomField(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from(CUSTOM_FIELDS).delete().eq('id', id)
  if (error) throw error
}

export async function addCustomFieldDependency(
  customFieldId: string,
  dependsOnCustomFieldId: string,
  showWhenValue: string
): Promise<CustomFieldDependency> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from(CUSTOM_FIELD_DEPS)
    .insert({
      custom_field_id: customFieldId,
      depends_on_custom_field_id: dependsOnCustomFieldId,
      show_when_value: showWhenValue,
    })
    .select()
    .single()
  if (error) throw error
  return data as CustomFieldDependency
}

export async function removeCustomFieldDependency(dependencyId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from(CUSTOM_FIELD_DEPS).delete().eq('id', dependencyId)
  if (error) throw error
}
