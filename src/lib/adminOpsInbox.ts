import type { SupabaseClient } from "@supabase/supabase-js"

export type AdminOpsTicketRow = {
  id: string
  ticket_number: string
  type: string
  title: string | null
  name: string | null
  email: string | null
  status: string | null
  priority: string | null
  created_at: string
}

export type AdminOpsNewUserRow = {
  id: string
  display_name: string | null
  email: string | null
  role: string | null
  created_at: string | null
}

export type AdminOpsSnapshot = {
  openTickets: AdminOpsTicketRow[]
  openTicketsByType: Record<string, number>
  pendingNewUsers: AdminOpsNewUserRow[]
  recentSignups: AdminOpsNewUserRow[]
}

const TYPE_LABEL: Record<string, string> = {
  web: "Web support",
  tech: "Tech support",
  demo: "Demo request",
  phone: "Help desk phone",
}

export function adminTicketTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type
}

export async function loadAdminOpsSnapshot(supabase: SupabaseClient): Promise<AdminOpsSnapshot> {
  const [ticketRes, usersRes] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, ticket_number, type, title, name, email, status, priority, created_at")
      .eq("status", "open")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase.from("admin_users_list").select("id, email, display_name, role, created_at").order("created_at", { ascending: false }).limit(200),
  ])

  if (ticketRes.error) throw ticketRes.error
  if (usersRes.error) throw usersRes.error

  const openTickets = (ticketRes.data ?? []) as AdminOpsTicketRow[]
  const openTicketsByType: Record<string, number> = {}
  for (const t of openTickets) {
    openTicketsByType[t.type] = (openTicketsByType[t.type] ?? 0) + 1
  }

  const users = (usersRes.data ?? []) as AdminOpsNewUserRow[]
  const pendingNewUsers = users.filter((u) => u.role === "new_user").slice(0, 40)
  const recentSignups = users.filter((u) => u.role === "new_user" || u.role === "user").slice(0, 24)

  return { openTickets, openTicketsByType, pendingNewUsers, recentSignups }
}
