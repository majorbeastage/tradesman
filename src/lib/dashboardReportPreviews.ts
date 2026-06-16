import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeCommunicationUrgency } from "./customerUrgency"

export type DashboardReportPreviewRow = { label: string; value: string; accent?: string }

export type DashboardReportPreviewSnapshot = {
  id: string
  title: string
  summary: string
  rows: DashboardReportPreviewRow[]
  empty: string
}

type LoaderResult = Omit<DashboardReportPreviewSnapshot, "id" | "title">

export type DashboardReportPreviewLoader = {
  id: string
  title: string
  load: (supabase: SupabaseClient, userId: string) => Promise<LoaderResult>
}

function channelBucket(eventType: string | null): "Email" | "Text" | "Phone" | "Other" {
  const t = String(eventType ?? "").toLowerCase()
  if (t === "email") return "Email"
  if (t === "sms") return "Text"
  if (t === "call" || t === "voicemail") return "Phone"
  return "Other"
}

function periodStartIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

async function loadContactsByChannelPreview(supabase: SupabaseClient, userId: string): Promise<LoaderResult> {
  const since = periodStartIso(30)
  const { data, error } = await supabase
    .from("communication_events")
    .select("event_type")
    .eq("user_id", userId)
    .gte("created_at", since)
    .limit(4000)
  if (error) throw error
  const tally: Record<string, number> = { Email: 0, Text: 0, Phone: 0, Other: 0 }
  for (const ev of data ?? []) {
    const ch = channelBucket((ev as { event_type?: string | null }).event_type ?? null)
    tally[ch] += 1
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  const rows = (["Email", "Text", "Phone", "Other"] as const)
    .filter((k) => tally[k] > 0)
    .map((k) => ({
      label: k,
      value: String(tally[k]),
      accent: k === "Email" ? "#2563eb" : k === "Text" ? "#059669" : k === "Phone" ? "#d97706" : "#64748b",
    }))
  return {
    summary: total ? `${total} contacts in the last 30 days` : "No contacts in the last 30 days",
    rows: rows.slice(0, 4),
    empty: "No communication events yet.",
  }
}

async function loadUrgencyMixPreview(supabase: SupabaseClient, userId: string): Promise<LoaderResult> {
  const { data, error } = await supabase.from("customers").select("communication_urgency").eq("user_id", userId).limit(5000)
  if (error) throw error
  const tally: Record<string, number> = {}
  for (const c of data ?? []) {
    const u = normalizeCommunicationUrgency((c as { communication_urgency?: string | null }).communication_urgency)
    tally[u] = (tally[u] ?? 0) + 1
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1])
  const total = data?.length ?? 0
  return {
    summary: total ? `${total} customers tracked` : "No customers yet",
    rows: sorted.slice(0, 4).map(([label, n]) => ({
      label,
      value: String(n),
      accent: label === "Critical" ? "#dc2626" : label === "Needs Attention" ? "#d97706" : undefined,
    })),
    empty: "No customers loaded.",
  }
}

async function loadQuotesByStatusPreview(supabase: SupabaseClient, userId: string): Promise<LoaderResult> {
  const { data, error } = await supabase.from("quotes").select("status").eq("user_id", userId).is("removed_at", null).limit(8000)
  if (error) throw error
  const tally: Record<string, number> = {}
  for (const q of data ?? []) {
    const s = String((q as { status?: string | null }).status ?? "unknown").trim() || "unknown"
    tally[s] = (tally[s] ?? 0) + 1
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1])
  const total = data?.length ?? 0
  return {
    summary: total ? `${total} estimates in workspace` : "No estimates yet",
    rows: sorted.slice(0, 4).map(([label, n]) => ({ label, value: String(n) })),
    empty: "No estimates found.",
  }
}

async function loadOpenLeadsPreview(supabase: SupabaseClient, userId: string): Promise<LoaderResult> {
  const { data, count, error } = await supabase
    .from("leads")
    .select("title, created_at", { count: "exact" })
    .eq("user_id", userId)
    .is("removed_at", null)
    .is("converted_at", null)
    .order("created_at", { ascending: false })
    .limit(4)
  if (error) throw error
  const openCount = count ?? data?.length ?? 0
  const rows = (data ?? []).map((row) => {
    const r = row as { title?: string | null; created_at?: string | null }
    const when = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-"
    return { label: r.title?.trim() || "Untitled lead", value: when }
  })
  return {
    summary: openCount ? `${openCount} open lead${openCount === 1 ? "" : "s"}` : "No open leads",
    rows,
    empty: "No open leads in the pipeline.",
  }
}

/** Add new dashboard report previews here - each loader becomes a compact card on the dashboard. */
export const DASHBOARD_REPORT_PREVIEW_LOADERS: DashboardReportPreviewLoader[] = [
  { id: "contacts_by_channel", title: "Contacts by channel", load: loadContactsByChannelPreview },
  { id: "customers_by_urgency", title: "Customers by urgency", load: loadUrgencyMixPreview },
  { id: "estimates_by_status", title: "Estimates by status", load: loadQuotesByStatusPreview },
  { id: "open_leads", title: "Open leads", load: loadOpenLeadsPreview },
]

export async function loadDashboardReportPreviews(
  supabase: SupabaseClient,
  userId: string,
): Promise<DashboardReportPreviewSnapshot[]> {
  const results = await Promise.all(
    DASHBOARD_REPORT_PREVIEW_LOADERS.map(async (loader) => {
      try {
        const body = await loader.load(supabase, userId)
        return { id: loader.id, title: loader.title, ...body } satisfies DashboardReportPreviewSnapshot
      } catch {
        return {
          id: loader.id,
          title: loader.title,
          summary: "Could not load preview",
          rows: [],
          empty: "Unavailable",
        } satisfies DashboardReportPreviewSnapshot
      }
    }),
  )
  return results
}