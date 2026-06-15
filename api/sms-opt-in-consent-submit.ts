/**
 * POST /api/sms-opt-in-consent-submit
 * Public web form: business + customer info, optional unchecked-by-default SMS opt-in checkbox.
 * Emails summary + filled PDF to ops (default admin@tradesman-us.com).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { firstEnv } from "./_communications.js"
import { buildSmsOptInConsentFormPdfBytes, smsOptInConsentFormFilename } from "./_smsOptInConsentFormPdf.js"

const DEFAULT_NOTIFY = ["admin@tradesman-us.com", "admin@mail.tradesman-us.com"]

function parseNotifyRecipients(): string[] {
  const raw = firstEnv("SMS_OPT_IN_NOTIFY_EMAIL", "ADMIN_SIGNUP_NOTIFY_EMAIL").trim()
  if (!raw) return [...DEFAULT_NOTIFY]
  const parts = raw
    .split(/[,;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"))
  return parts.length > 0 ? [...new Set(parts)] : [...DEFAULT_NOTIFY]
}

function clip(s: unknown, max: number): string {
  return String(s ?? "")
    .trim()
    .slice(0, max)
}

function pickBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>
  return {}
}

function isValidPhone(s: string): boolean {
  const digits = s.replace(/\D/g, "")
  return digits.length >= 10 && digits.length <= 15
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST, OPTIONS").json({ error: "Method not allowed" })
    return
  }

  const body = pickBody(req)
  if (clip(body.website, 200)) {
    res.status(200).json({ ok: true })
    return
  }

  const businessName = clip(body.businessName, 120)
  const businessPhone = clip(body.businessPhone, 40)
  const businessAddress = clip(body.businessAddress, 200)
  const customerName = clip(body.customerName, 120)
  const customerPhone = clip(body.customerPhone, 40)
  const customerEmail = clip(body.customerEmail, 120)
  const smsConsentAgreed = body.smsConsentAgreed === true

  const missing: string[] = []
  if (!businessName) missing.push("businessName")
  if (!businessPhone || !isValidPhone(businessPhone)) missing.push("businessPhone")
  if (!customerName) missing.push("customerName")
  if (!customerPhone || !isValidPhone(customerPhone)) missing.push("customerPhone")

  if (missing.length > 0) {
    res.status(400).json({
      error: "Missing or invalid required fields",
      fields: missing,
    })
    return
  }

  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) {
    res.status(503).json({
      error: "Email delivery is not configured",
      hint: "Set RESEND_API_KEY and RESEND_FROM_EMAIL on Vercel",
    })
    return
  }

  const submittedAt = new Date().toISOString()
  const consentMethodNote = "Tradesman public web form (sms-cta/submit)"

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await buildSmsOptInConsentFormPdfBytes({
      businessName,
      businessPhone,
      businessAddress: businessAddress || undefined,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      electronicConsentAt: smsConsentAgreed ? submittedAt : undefined,
      consentMethodNote,
    })
  } catch (e) {
    console.error("[api/sms-opt-in-consent-submit] pdf", e)
    res.status(500).json({ error: "Could not generate consent PDF" })
    return
  }

  const filename = smsOptInConsentFormFilename(businessName)
  const pdfBase64 = Buffer.from(pdfBytes).toString("base64")
  const to = parseNotifyRecipients()

  const text = [
    "SMS consent form submitted via Tradesman public form.",
    "",
    `Submitted (UTC): ${submittedAt}`,
    `Form URL: https://www.tradesman-us.com/sms-cta/submit`,
    "",
    "— Business —",
    `Name: ${businessName}`,
    `Phone: ${businessPhone}`,
    `Address: ${businessAddress || "(none)"}`,
    "",
    "— Customer —",
    `Name: ${customerName}`,
    `Mobile: ${customerPhone}`,
    `Email: ${customerEmail || "(none)"}`,
    "",
    "— Consent —",
    smsConsentAgreed
      ? "SMS opt-in: customer checked the optional opt-in box (not pre-selected on form)."
      : "SMS opt-in: customer did not opt in (optional box left unchecked).",
    `Method: ${consentMethodNote}`,
    "",
    smsConsentAgreed
      ? "PDF attachment contains the same fields with the opt-in checkbox marked."
      : "PDF attachment contains the same fields with the optional opt-in checkbox unchecked.",
  ].join("\n")

  let sendRes: Response
  try {
    sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: smsConsentAgreed
          ? `SMS opt-in consent — ${businessName} / ${customerName}`
          : `SMS consent form (no opt-in) — ${businessName} / ${customerName}`,
        text,
        attachments: [{ filename, content: pdfBase64 }],
      }),
    })
  } catch (e) {
    console.error("[api/sms-opt-in-consent-submit] resend", e)
    res.status(502).json({ error: "Email send failed" })
    return
  }

  if (!sendRes.ok) {
    const t = await sendRes.text()
    console.error("[api/sms-opt-in-consent-submit] Resend", sendRes.status, t)
    res.status(502).json({ error: "Email provider rejected the send" })
    return
  }

  console.info("[api/sms-opt-in-consent-submit] emailed", { to, businessName, customerName })
  res.status(200).json({ ok: true, emailed: true })
}
