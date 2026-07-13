/** Platform-wide org — admins and same-client accounts appear together in org chart / share lists. */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "../contexts/AuthContext"
import { resolveInternalMemberLabel } from "./profileContactMeta"

/** Matches AuthContext DEFAULT_CLIENT_ID — Tradesman platform org. */
export const TRADESMAN_PLATFORM_ORG_CLIENT_ID = "00000000-0000-0000-0000-000000000001"

export const ORG_SHARED_INBOX_METADATA_KEY = "org_shared_inbox_v1"

export type OrganizationPeer = {
  id: string
  displayName: string
  email: string | null
  role: UserRole | null
}

export type OrgSharedContactPayload = {
  customerId: string
  customerName: string
  contactLine?: string
  phones?: string[]
  emails?: string[]
  serviceAddress?: string
  jobPipelineStatus?: string
  bestContactMethod?: string
  leadFit?: string
  calendarEvent?: {
    id: string
    title: string
    startAt?: string
    endAt?: string
    status?: string
    notes?: string
    jobType?: string
    assigneeLabel?: string
    scopeOfWork?: string
    materialsUsed?: string
  }
  sharedAt: string
  sharedByUserId: string
  sharedByDisplayName: string
}

export type OrgSharedInboxEntry = {
  id: string
  receivedAt: string
  fromUserId: string
  fromDisplayName: string
  payload: OrgSharedContactPayload
  read: boolean
}

type ProfileRow = {
  id: string
  display_name?: string | null
  email?: string | null
  role?: string | null
  client_id?: string | null
  metadata?: unknown
}

async function loadManagedUserIds(client: SupabaseClient, officeManagerId: string): Promise<string[]> {
  const { data, error } = await client
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", officeManagerId)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.user_id).filter((id): id is string => typeof id === "string" && id !== officeManagerId))]
}

async function loadManagingOfficeManagerIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client.from("office_manager_clients").select("office_manager_id").eq("user_id", userId)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.office_manager_id).filter((id): id is string => typeof id === "string" && id !== userId))]
}

async function loadTeamShellProfileIds(client: SupabaseClient, accountOwnerId: string): Promise<string[]> {
  const { data, error } = await client
    .from("team_member_invites")
    .select("shell_profile_id")
    .eq("account_owner_id", accountOwnerId)
    .not("shell_profile_id", "is", null)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.shell_profile_id).filter((x): x is string => typeof x === "string"))]
}

/** Profile ids that share an organization with the signed-in user. */
export async function loadOrganizationPeerIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data: self, error: selfErr } = await client
    .from("profiles")
    .select("id, role, client_id")
    .eq("id", userId)
    .maybeSingle()
  if (selfErr) throw selfErr
  if (!self) return []

  const peerIds = new Set<string>()
  const role = typeof self.role === "string" ? self.role : null
  const clientId = typeof self.client_id === "string" && self.client_id.trim() ? self.client_id.trim() : TRADESMAN_PLATFORM_ORG_CLIENT_ID

  const { data: sameClient, error: clientErr } = await client.from("profiles").select("id").eq("client_id", clientId).neq("id", userId)
  if (clientErr) throw clientErr
  for (const row of sameClient ?? []) peerIds.add(row.id as string)

  if (role === "admin" || role === "corporate_management" || role === "office_manager") {
    const { data: admins, error: adminErr } = await client.from("profiles").select("id").eq("role", "admin").neq("id", userId)
    if (adminErr) throw adminErr
    for (const row of admins ?? []) peerIds.add(row.id as string)
  }

  for (const id of await loadTeamShellProfileIds(client, userId)) peerIds.add(id)

  if (role === "office_manager" || role === "corporate_management" || role === "admin") {
    for (const id of await loadManagedUserIds(client, userId)) peerIds.add(id)
  }

  for (const id of await loadManagingOfficeManagerIds(client, userId)) peerIds.add(id)

  return [...peerIds]
}

export async function loadOrganizationPeers(client: SupabaseClient, userId: string): Promise<OrganizationPeer[]> {
  const peerIds = await loadOrganizationPeerIds(client, userId)
  if (!peerIds.length) return []

  const { data, error } = await client.from("profiles").select("id, display_name, email, role, metadata").in("id", peerIds)
  if (error) throw error

  return (data as ProfileRow[])
    .map((row) => ({
      id: row.id,
      displayName: resolveInternalMemberLabel(row),
      email: row.email ?? null,
      role: (typeof row.role === "string" ? row.role : null) as UserRole | null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function usersShareSameOrganization(
  client: SupabaseClient,
  userA: string,
  userB: string,
): Promise<boolean> {
  if (userA === userB) return true
  const peers = await loadOrganizationPeerIds(client, userA)
  return peers.includes(userB)
}

export function formatOrgSharedContactBody(payload: OrgSharedContactPayload): string {
  const lines: string[] = [
    `Customer: ${payload.customerName}`,
    payload.contactLine ? `Contact: ${payload.contactLine}` : "",
    payload.serviceAddress ? `Address: ${payload.serviceAddress}` : "",
    payload.jobPipelineStatus ? `Job status: ${payload.jobPipelineStatus}` : "",
    payload.bestContactMethod ? `Best contact: ${payload.bestContactMethod}` : "",
    payload.leadFit ? `Lead score: ${payload.leadFit}` : "",
  ].filter(Boolean)

  const ev = payload.calendarEvent
  if (ev) {
    lines.push("", "— Calendar event —", `Title: ${ev.title}`)
    if (ev.startAt) lines.push(`Starts: ${ev.startAt}`)
    if (ev.endAt) lines.push(`Ends: ${ev.endAt}`)
    if (ev.status) lines.push(`Status: ${ev.status}`)
    if (ev.jobType) lines.push(`Job type: ${ev.jobType}`)
    if (ev.assigneeLabel) lines.push(`Assigned: ${ev.assigneeLabel}`)
    if (ev.scopeOfWork?.trim()) lines.push(`Scope: ${ev.scopeOfWork.trim()}`)
    if (ev.materialsUsed?.trim()) lines.push(`Materials: ${ev.materialsUsed.trim()}`)
    if (ev.notes?.trim()) lines.push(`Notes: ${ev.notes.trim()}`)
  }

  lines.push("", `Shared by ${payload.sharedByDisplayName} at ${payload.sharedAt}`)
  return lines.join("\n")
}

export function appendOrgSharedInboxEntry(
  prevMeta: Record<string, unknown>,
  entry: OrgSharedInboxEntry,
): Record<string, unknown> {
  const raw = prevMeta[ORG_SHARED_INBOX_METADATA_KEY]
  const list = Array.isArray(raw) ? [...(raw as OrgSharedInboxEntry[])] : []
  list.unshift(entry)
  return { ...prevMeta, [ORG_SHARED_INBOX_METADATA_KEY]: list.slice(0, 100) }
}
