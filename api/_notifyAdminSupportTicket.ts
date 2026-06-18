/**
 * POST /api/platform-tools?__route=notify-admin-support-ticket
 * (Also reachable at /api/notify-admin-support-ticket via vercel.json rewrite.)
 *
 * Sends ops email when a portal demo / web / tech ticket is created.
 * Phone tickets are skipped (help desk handler already emails).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"
import { notifyAdminOps } from "./_adminOpsNotify.js"
import { recordAdminOpsCustomerEvent } from "./_adminOpsCustomerEvent.js"

const TYPE_LABEL: Record<string, string> = {
  web: "Web support",
  tech: "Tech support",
  demo: "Demo request",
  phone: "Help desk phone",
}

export async function handleNotifyAdminSupportTicket(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : ""
  if (!ticketId) {
    res.status(400).json({ error: "ticketId required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const { data: ticket, error: ticketErr } = await service
    .from("support_tickets")
    .select("id, ticket_number, type, title, name, email, phone, business_name, message, preferred_contact, created_at")
    .eq("id", ticketId)
    .maybeSingle()

  if (ticketErr) {
    res.status(500).json({ error: ticketErr.message })
    return
  }
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" })
    return
  }

  const type = String(ticket.type ?? "")
  if (type === "phone") {
    res.status(200).json({ ok: true, skipped: true, reason: "phone tickets notify via help desk" })
    return
  }

  if (!firstEnv("RESEND_API_KEY") || !firstEnv("RESEND_FROM_EMAIL")) {
    res.status(200).json({ ok: true, notifyDisabled: true, hint: "Set RESEND_API_KEY and RESEND_FROM_EMAIL on Vercel" })
    return
  }

  const typeLabel = TYPE_LABEL[type] ?? type
  const subject = `[${ticket.ticket_number ?? "TICKET"}] New ${typeLabel}`
  const text = [
    `New ${typeLabel} ticket submitted.`,
    "",
    `Ticket: ${ticket.ticket_number ?? ticketId}`,
    `Title: ${ticket.title ?? "(none)"}`,
    `Name: ${ticket.name ?? "(none)"}`,
    `Email: ${ticket.email ?? "(none)"}`,
    `Phone: ${ticket.phone ?? "(none)"}`,
    `Business: ${ticket.business_name ?? "(none)"}`,
    ticket.preferred_contact ? `Preferred contact: ${ticket.preferred_contact}` : "",
    "",
    ticket.message ? `Message:\n${ticket.message}` : "",
    "",
    `Submitted: ${ticket.created_at ?? ""}`,
    `Ticket id: ${ticketId}`,
  ]
    .filter(Boolean)
    .join("\n")

  const result = await notifyAdminOps({
    service,
    subject,
    text,
    pushTitle: `New ${typeLabel}`,
    pushBody: `${ticket.name ?? ticket.email ?? ticket.ticket_number ?? "Ticket"} · ${ticket.title ?? ""}`.trim(),
  })

  if (!result.email.ok && result.email.disabled !== true) {
    res.status(502).json({ error: result.email.error ?? "Resend rejected the send" })
    return
  }

  const ticketEmail = String(ticket.email ?? "").trim()
  let customerEvent: Awaited<ReturnType<typeof recordAdminOpsCustomerEvent>> | undefined
  if (ticketEmail.includes("@")) {
    customerEvent = await recordAdminOpsCustomerEvent(service, {
      kind: type === "demo" ? "demo_request" : "support_ticket",
      externalId: `support-ticket:${ticketId}`,
      email: ticketEmail,
      displayName: typeof ticket.name === "string" ? ticket.name : null,
      subject,
      body: text,
      ticketId,
      phone: typeof ticket.phone === "string" ? ticket.phone : null,
    })
  }

  console.info("[notify-admin-support-ticket]", { ticketId, type, customerEvent, push: result.push })
  res.status(200).json({ ok: true, emailed: result.email.ok, push: result.push, customerEvent })
}
