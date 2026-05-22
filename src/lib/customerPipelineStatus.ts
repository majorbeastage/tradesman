import type { SupabaseClient } from "@supabase/supabase-js"

export const CUSTOMER_PIPELINE_STATUSES = [
  "New Lead",
  "First Contact Sent",
  "First Reply Received",
  "Job Description Received",
  "Quote Sent",
  "Quote Approved",
  "Scheduled",
  "Lost",
  "Completed",
] as const

export type CustomerEngagementKind = "estimate_work" | "scheduled" | "inbound_contact"

const STATUS_BY_KIND: Record<CustomerEngagementKind, string> = {
  estimate_work: "Job Description Received",
  scheduled: "Scheduled",
  inbound_contact: "First Reply Received",
}

const PIPELINE_RANK: Record<string, number> = {
  "New Lead": 0,
  "First Contact Sent": 1,
  "First Reply Received": 2,
  "Job Description Received": 3,
  "Quote Sent": 4,
  "Quote Approved": 5,
  Scheduled: 6,
  Lost: 4,
  Completed: 99,
}

function isCompletedStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "completed"
}

function nextPipelineStatus(current: string, target: string): string {
  const cur = current.trim()
  if (!cur || isCompletedStatus(cur)) return target
  const curRank = PIPELINE_RANK[cur] ?? 3
  const nextRank = PIPELINE_RANK[target] ?? 3
  return nextRank >= curRank ? target : cur
}

/** Move archived / completed customers back into Active workflow when they engage again. */
export async function refreshCustomerPipelineOnEngagement(
  supabase: SupabaseClient,
  customerId: string,
  kind: CustomerEngagementKind,
): Promise<void> {
  const cid = customerId.trim()
  if (!cid) return
  const targetStatus = STATUS_BY_KIND[kind]
  const nowIso = new Date().toISOString()

  const { data: row, error: loadErr } = await supabase
    .from("customers")
    .select("job_pipeline_status")
    .eq("id", cid)
    .maybeSingle()
  if (loadErr) {
    console.warn("[customerPipelineStatus] load", loadErr.message)
    return
  }

  const current = String((row as { job_pipeline_status?: string | null } | null)?.job_pipeline_status ?? "")
  const patch: Record<string, unknown> = {
    last_activity_at: nowIso,
    job_pipeline_status: nextPipelineStatus(current, targetStatus),
    archived_at: null,
  }

  let { error } = await supabase.from("customers").update(patch).eq("id", cid)
  if (error && String(error.message || "").toLowerCase().includes("archived_at")) {
    const { archived_at: _a, ...rest } = patch
    error = (await supabase.from("customers").update(rest).eq("id", cid)).error
  }
  if (error && String(error.message || "").toLowerCase().includes("job_pipeline")) {
    const { job_pipeline_status: _j, ...rest } = patch
    await supabase.from("customers").update(rest).eq("id", cid)
    return
  }
  if (error) console.warn("[customerPipelineStatus] update", error.message)
}
