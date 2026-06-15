/**
 * POST /api/platform-tools?__route=notify-admin-support-ticket
 * (Also reachable at /api/notify-admin-support-ticket via vercel.json rewrite.)
 *
 * Sends ops email when a portal demo / web / tech ticket is created.
 * Phone tickets are skipped (help desk handler already emails).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"

const DEFAULT_OPS_INBOXES = ["admin@tradesman-us.com", "admin@mail.tradesman-us.com"]

function parseAdminRecipients(): string[] {
  const raw = firstEnv("ADMIN_SIGNUP_NOTIFY_EMAIL", "HELP_DESK_TICKET_NOTIFY_EMAIL").trim()
  if (!raw) return [...DEFAULT_OPS_INBOXES]
  const parts = raw
    .split(/[,;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"))
  return parts.length > 0 ? [...new Set(parts)] : [...DEFAULT_OPS_INBOXES]
}

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

  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) {
    res.status(200).json({ ok: true, notifyDisabled: true, hint: "Set RESEND_API_KEY and RESEND_FROM_EMAIL on Vercel" })
    return
  }

  const adminRecipients = parseAdminRecipients()
  const typeLabel = TYPE_LABEL[type] ?? type
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

  try {
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: adminRecipients,
        subject: `[${ticket.ticket_number ?? "TICKET"}] New ${typeLabel}`,
        text,
      }),
    })
    if (!sendRes.ok) {
      const t = await sendRes.text()
      console.error("[notify-admin-support-ticket] Resend", sendRes.status, t)
      res.status(502).json({ error: "Resend rejected the send" })
      return
    }
    console.info("[notify-admin-support-ticket] emailed", { ticketId, type, to: adminRecipients })
    res.status(200).json({ ok: true, emailed: true })
  } catch (e) {
    console.error("[notify-admin-support-ticket]", e instanceof Error ? e.message : e)
    res.status(502).json({ error: "Resend request failed" })
  }
}
