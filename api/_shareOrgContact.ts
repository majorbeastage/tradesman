/**
 * POST /api/platform-tools?__route=share-org-contact
 * Share a customer + calendar event snapshot with another org member.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  appendOrgSharedInboxEntry,
  formatOrgSharedContactBody,
  type OrgSharedContactPayload,
  type OrgSharedInboxEntry,
  usersShareSameOrganization,
} from "../src/lib/organizationPeers.js"
import { createServiceSupabase } from "./_communications.js"

function bodyAsRecord(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>
  return {}
}

export async function handleShareOrgContact(req: VercelRequest, res: VercelResponse, senderId: string): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  let service
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const body = bodyAsRecord(req)
  const recipientUserId = String(body.recipientUserId ?? "").trim()
  const customerId = String(body.customerId ?? "").trim()
  const eventId = typeof body.eventId === "string" && body.eventId.trim() ? body.eventId.trim() : undefined

  if (!recipientUserId || !customerId) {
    res.status(400).json({ error: "recipientUserId and customerId are required" })
    return
  }
  if (recipientUserId === senderId) {
    res.status(400).json({ error: "Choose another team member" })
    return
  }

  const sameOrg = await usersShareSameOrganization(service, senderId, recipientUserId)
  if (!sameOrg) {
    res.status(403).json({ error: "That user is not in your organization" })
    return
  }

  const { data: senderProf } = await service.from("profiles").select("display_name, email").eq("id", senderId).maybeSingle()
  const senderName =
    (typeof senderProf?.display_name === "string" && senderProf.display_name.trim()) ||
    (typeof senderProf?.email === "string" && senderProf.email.trim()) ||
    "Team member"

  const { data: customer, error: custErr } = await service
    .from("customers")
    .select(
      "id, display_name, user_id, service_address, job_pipeline_status, best_contact_method, fit_classification, customer_identifiers(type, value)",
    )
    .eq("id", customerId)
    .maybeSingle()

  if (custErr || !customer) {
    res.status(404).json({ error: custErr?.message ?? "Customer not found" })
    return
  }
  if (String(customer.user_id) !== senderId) {
    const { data: omLink } = await service
      .from("office_manager_clients")
      .select("user_id")
      .eq("office_manager_id", senderId)
      .eq("user_id", customer.user_id)
      .maybeSingle()
    const { data: senderRoleRow } = await service.from("profiles").select("role").eq("id", senderId).maybeSingle()
    const isAdmin = senderRoleRow?.role === "admin"
    const sameOrgOwner = await usersShareSameOrganization(service, senderId, String(customer.user_id))
    if (!omLink && !isAdmin && !sameOrgOwner) {
      res.status(403).json({ error: "You cannot share this customer" })
      return
    }
  }

  type IdRow = { type: string; value: string }
  const ids = (customer.customer_identifiers ?? []) as IdRow[]
  const phones = ids.filter((i) => i.type === "phone").map((i) => i.value)
  const emails = ids.filter((i) => i.type === "email").map((i) => i.value)
  const contactLine = [...phones, ...emails].join(" · ")

  let calendarEvent: OrgSharedContactPayload["calendarEvent"]
  if (eventId) {
    const { data: ev } = await service
      .from("calendar_events")
      .select("id, title, start_at, end_at, notes, job_type_id, metadata, completed_at, cancelled_at, assignee_user_id")
      .eq("id", eventId)
      .eq("customer_id", customerId)
      .maybeSingle()
    if (ev) {
      let jobType: string | undefined
      if (ev.job_type_id) {
        const { data: jt } = await service.from("job_types").select("name").eq("id", ev.job_type_id).maybeSingle()
        jobType = typeof jt?.name === "string" ? jt.name : undefined
      }
      let assigneeLabel: string | undefined
      if (ev.assignee_user_id) {
        const { data: ap } = await service.from("profiles").select("display_name, email").eq("id", ev.assignee_user_id).maybeSingle()
        assigneeLabel =
          (typeof ap?.display_name === "string" && ap.display_name.trim()) ||
          (typeof ap?.email === "string" && ap.email.trim()) ||
          undefined
      }
      const meta = ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata) ? (ev.metadata as Record<string, unknown>) : {}
      calendarEvent = {
        id: String(ev.id),
        title: String(ev.title ?? "Scheduled job"),
        startAt: typeof ev.start_at === "string" ? ev.start_at : undefined,
        endAt: typeof ev.end_at === "string" ? ev.end_at : undefined,
        notes: typeof ev.notes === "string" ? ev.notes : undefined,
        jobType,
        assigneeLabel,
        scopeOfWork: typeof meta.scope_of_work === "string" ? meta.scope_of_work : undefined,
        materialsUsed: typeof meta.materials_used === "string" ? meta.materials_used : undefined,
        status: ev.cancelled_at ? "Cancelled" : ev.completed_at ? "Complete" : "Scheduled",
      }
    }
  }

  const sharedAt = new Date().toISOString()
  const payload: OrgSharedContactPayload = {
    customerId,
    customerName: String(customer.display_name ?? "Customer"),
    contactLine: contactLine || undefined,
    phones: phones.length ? phones : undefined,
    emails: emails.length ? emails : undefined,
    serviceAddress: typeof customer.service_address === "string" ? customer.service_address : undefined,
    jobPipelineStatus: typeof customer.job_pipeline_status === "string" ? customer.job_pipeline_status : undefined,
    bestContactMethod: typeof customer.best_contact_method === "string" ? customer.best_contact_method : undefined,
    leadFit: typeof customer.fit_classification === "string" ? customer.fit_classification : undefined,
    calendarEvent,
    sharedAt,
    sharedByUserId: senderId,
    sharedByDisplayName: senderName,
  }

  const inboxEntry: OrgSharedInboxEntry = {
    id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: sharedAt,
    fromUserId: senderId,
    fromDisplayName: senderName,
    payload,
    read: false,
  }

  const { data: recipientProf, error: recipErr } = await service
    .from("profiles")
    .select("metadata")
    .eq("id", recipientUserId)
    .maybeSingle()
  if (recipErr || !recipientProf) {
    res.status(404).json({ error: recipErr?.message ?? "Recipient not found" })
    return
  }

  const prevMeta =
    recipientProf.metadata && typeof recipientProf.metadata === "object" && !Array.isArray(recipientProf.metadata)
      ? { ...(recipientProf.metadata as Record<string, unknown>) }
      : {}

  const { error: updateErr } = await service
    .from("profiles")
    .update({ metadata: appendOrgSharedInboxEntry(prevMeta, inboxEntry) })
    .eq("id", recipientUserId)
  if (updateErr) {
    res.status(500).json({ error: updateErr.message })
    return
  }

  const bodyText = formatOrgSharedContactBody(payload)
  const subject = calendarEvent
    ? `Shared contact: ${payload.customerName} — ${calendarEvent.title}`
    : `Shared contact: ${payload.customerName}`

  await service.from("communication_events").insert({
    user_id: recipientUserId,
    customer_id: null,
    event_type: "note",
    direction: "inbound",
    subject,
    body: bodyText,
    metadata: {
      org_share: true,
      org_share_id: inboxEntry.id,
      from_user_id: senderId,
      source_customer_id: customerId,
      source_event_id: eventId ?? null,
      payload,
    },
    unread: true,
  })

  await service.from("communication_events").insert({
    user_id: senderId,
    customer_id: customerId,
    event_type: "note",
    direction: "outbound",
    subject: `Shared with team member`,
    body: bodyText,
    metadata: {
      org_share_sent: true,
      to_user_id: recipientUserId,
      source_event_id: eventId ?? null,
    },
  })

  res.status(200).json({ ok: true, shareId: inboxEntry.id })
}
