import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { randomBytes } from "crypto"
import {
  createServiceSupabase,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"
import { uploadBytesToCommAttachments } from "./_commStorage.js"
import { autoAdvanceCustomerWorkflowServer } from "./_workflowAutoComplete.js"
import { emitUserNotificationServer } from "./_userNotifications.js"

type Json = Record<string, unknown>

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

function json(res: VercelResponse, status: number, body: Json) {
  res.status(status).json(body)
}

function metaObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) }
  return {}
}

function newToken(): string {
  // Hex only — URL path is lowercased in parts of the SPA, so avoid base64 case sensitivity.
  return randomBytes(24).toString("hex")
}

async function resolveAuthedUser(
  req: VercelRequest,
): Promise<{ sb: SupabaseClient; userId: string; service: SupabaseClient }> {
  const authHeader = typeof req.headers?.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  const supabaseUrl = pickSupabaseUrlForServer()
  const anonKey = pickSupabaseAnonKeyForServer()
  if (!token || !supabaseUrl || !anonKey) throw new Error("Unauthorized")
  const userSb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userSb.auth.getUser(token)
  if (error || !data.user?.id) throw new Error("Unauthorized")
  return { sb: userSb, userId: data.user.id, service: createServiceSupabase() }
}

async function findQuoteByEsignToken(service: SupabaseClient, token: string) {
  const cleaned = token.trim()
  if (!cleaned) return null

  // Prefer JSON text path filter (same pattern as other APIs). Fallback: contains.
  const primary = await service
    .from("quotes")
    .select("id, user_id, customer_id, status, metadata, customers ( display_name )")
    .filter("metadata->>esign_token", "eq", cleaned)
    .limit(1)
    .maybeSingle()
  if (!primary.error && primary.data) return primary.data

  const fallback = await service
    .from("quotes")
    .select("id, user_id, customer_id, status, metadata, customers ( display_name )")
    .contains("metadata", { esign_token: cleaned })
    .limit(1)
    .maybeSingle()
  if (fallback.error) throw new Error(fallback.error.message)
  return fallback.data
}

async function markApproved(
  service: SupabaseClient,
  userId: string,
  quoteId: string,
  customerId: string | null,
  signerName: string,
): Promise<void> {
  const { data: quote } = await service
    .from("quotes")
    .select("metadata, status")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!quote) return
  const prev = metaObj(quote.metadata)
  const signedAt = new Date().toISOString()
  const nextMeta = {
    ...prev,
    customer_approval: "approved",
    estimate_approval: "approved",
    customer_signed_at: signedAt,
    esign_signed_at: signedAt,
    esign_signer_name: signerName,
    esign_token: null,
  }
  const status = String(quote.status ?? "").trim()
  const nextStatus = status && status.toLowerCase() !== "accepted" ? "Accepted" : quote.status
  await service
    .from("quotes")
    .update({ metadata: nextMeta, ...(nextStatus ? { status: nextStatus } : {}) })
    .eq("id", quoteId)
    .eq("user_id", userId)

  if (customerId) {
    await autoAdvanceCustomerWorkflowServer(service, userId, customerId, "estimate_signed")
    void emitUserNotificationServer(service, {
      ownerUserId: userId,
      kind: "estimate_approved",
      title: "Estimate signed electronically",
      body: `${signerName} signed an estimate via e-sign link.`,
      customerId,
      quoteId,
    })
  }
}

async function stampSignedPdf(params: {
  sourcePdfUrl: string | null
  signerName: string
  signaturePngBase64: string | null
  businessLabel: string
  quoteId: string
}): Promise<Uint8Array> {
  let pdfDoc: PDFDocument
  if (params.sourcePdfUrl) {
    try {
      const res = await fetch(params.sourcePdfUrl)
      if (!res.ok) throw new Error(`pdf fetch ${res.status}`)
      const buf = await res.arrayBuffer()
      pdfDoc = await PDFDocument.load(buf)
    } catch {
      pdfDoc = await PDFDocument.create()
      pdfDoc.addPage([612, 792])
    }
  } else {
    pdfDoc = await PDFDocument.create()
    pdfDoc.addPage([612, 792])
  }

  const page = pdfDoc.addPage([612, 200])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const when = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
  page.drawText("Electronically signed", { x: 36, y: 160, size: 14, font: bold, color: rgb(0.06, 0.09, 0.16) })
  page.drawText(`Signer: ${params.signerName}`, { x: 36, y: 132, size: 11, font, color: rgb(0.2, 0.25, 0.33) })
  page.drawText(`Date: ${when}`, { x: 36, y: 114, size: 11, font, color: rgb(0.2, 0.25, 0.33) })
  page.drawText(`Business: ${params.businessLabel}`, { x: 36, y: 96, size: 11, font, color: rgb(0.2, 0.25, 0.33) })
  page.drawText(`Estimate: ${params.quoteId.slice(0, 8).toUpperCase()}`, {
    x: 36,
    y: 78,
    size: 11,
    font,
    color: rgb(0.2, 0.25, 0.33),
  })

  if (params.signaturePngBase64) {
    try {
      const raw = params.signaturePngBase64.replace(/^data:image\/\w+;base64,/, "")
      const pngBytes = Buffer.from(raw, "base64")
      const img = await pdfDoc.embedPng(pngBytes)
      const w = Math.min(220, img.width)
      const h = (img.height / img.width) * w
      page.drawImage(img, { x: 36, y: 18, width: w, height: Math.min(h, 50) })
    } catch {
      /* typed name is enough */
    }
  }

  return pdfDoc.save()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).end()

  try {
    const action = String(req.query.__action ?? req.body?.action ?? "").trim().toLowerCase()

    if (req.method === "GET" || action === "get") {
      const token = String(req.query.token ?? "").trim()
      if (!token || token.length < 16) return json(res, 400, { error: "Missing token." })
      const service = createServiceSupabase()
      const quote = await findQuoteByEsignToken(service, token)
      if (!quote) return json(res, 404, { error: "This signing link is invalid or has expired." })
      const meta = metaObj(quote.metadata)
      const expiresAt = typeof meta.esign_expires_at === "string" ? meta.esign_expires_at : null
      if (expiresAt && Date.parse(expiresAt) < Date.now()) {
        return json(res, 410, { error: "This signing link has expired. Ask the business for a new link." })
      }
      if (meta.esign_signed_at) {
        return json(res, 200, { alreadySigned: true, signerName: meta.esign_signer_name ?? null })
      }
      const { data: profile } = await service
        .from("profiles")
        .select("display_name")
        .eq("id", quote.user_id)
        .maybeSingle()
      const cust = quote.customers as { display_name?: string | null } | { display_name?: string | null }[] | null
      const customerName = Array.isArray(cust) ? cust[0]?.display_name : cust?.display_name
      return json(res, 200, {
        alreadySigned: false,
        quoteId: quote.id,
        businessName: (profile as { display_name?: string | null } | null)?.display_name?.trim() || "Business",
        customerName: customerName?.trim() || "Customer",
        pdfUrl: typeof meta.esign_pdf_url === "string" ? meta.esign_pdf_url : null,
        expiresAt,
      })
    }

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" })

    const body = (typeof req.body === "object" && req.body ? req.body : {}) as Json

    if (action === "create") {
      const { userId, service } = await resolveAuthedUser(req)
      const quoteId = String(body.quoteId ?? "").trim()
      const pdfUrl = typeof body.pdfUrl === "string" ? body.pdfUrl.trim() : ""
      if (!quoteId) return json(res, 400, { error: "quoteId required" })

      const { data: quote, error } = await service
        .from("quotes")
        .select("id, metadata, customer_id")
        .eq("id", quoteId)
        .eq("user_id", userId)
        .maybeSingle()
      if (error || !quote) return json(res, 404, { error: "Estimate not found." })

      const token = newToken()
      const createdAt = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const prev = metaObj(quote.metadata)
      const nextMeta = {
        ...prev,
        esign_token: token,
        esign_created_at: createdAt,
        esign_expires_at: expiresAt,
        esign_pdf_url: pdfUrl || (typeof prev.esign_pdf_url === "string" ? prev.esign_pdf_url : null),
        esign_signed_at: null,
        esign_signer_name: null,
      }
      const { error: upErr } = await service.from("quotes").update({ metadata: nextMeta }).eq("id", quoteId).eq("user_id", userId)
      if (upErr) return json(res, 500, { error: upErr.message })

      const origin = String(body.origin ?? "")
        .trim()
        .replace(/\/+$/, "")
      const base =
        origin ||
        (typeof req.headers.origin === "string" ? req.headers.origin.replace(/\/+$/, "") : "") ||
        "https://www.tradesman-us.com"
      return json(res, 200, {
        token,
        url: `${base}/e/${token}`,
        expiresAt,
      })
    }

    if (action === "sign") {
      const token = String(body.token ?? "").trim()
      const signerName = String(body.signerName ?? "").trim().slice(0, 120)
      const signaturePngBase64 =
        typeof body.signaturePngBase64 === "string" && body.signaturePngBase64.startsWith("data:image")
          ? body.signaturePngBase64
          : null
      if (!token || token.length < 16) return json(res, 400, { error: "Missing token." })
      if (signerName.length < 2) return json(res, 400, { error: "Enter your full name to sign." })

      const service = createServiceSupabase()
      const quote = await findQuoteByEsignToken(service, token)
      if (!quote) return json(res, 404, { error: "This signing link is invalid or has expired." })
      const meta = metaObj(quote.metadata)
      const expiresAt = typeof meta.esign_expires_at === "string" ? meta.esign_expires_at : null
      if (expiresAt && Date.parse(expiresAt) < Date.now()) {
        return json(res, 410, { error: "This signing link has expired." })
      }
      if (meta.esign_signed_at) return json(res, 200, { ok: true, alreadySigned: true })

      const { data: profile } = await service.from("profiles").select("display_name").eq("id", quote.user_id).maybeSingle()
      const businessLabel =
        (profile as { display_name?: string | null } | null)?.display_name?.trim() || "Business"
      const pdfUrl = typeof meta.esign_pdf_url === "string" ? meta.esign_pdf_url : null
      const signedBytes = await stampSignedPdf({
        sourcePdfUrl: pdfUrl,
        signerName,
        signaturePngBase64,
        businessLabel,
        quoteId: quote.id,
      })

      const shortId = quote.id.slice(0, 8).toUpperCase()
      const stamp = new Date().toISOString().slice(0, 10)
      const fileName = `estimate-signed-${shortId}-${stamp}.pdf`
      const storagePath = `${quote.user_id}/quotes/${quote.id}/${randomBytes(8).toString("hex")}-${fileName}`
      const publicUrl = await uploadBytesToCommAttachments({
        storagePath,
        body: Buffer.from(signedBytes),
        contentType: "application/pdf",
        logTag: "estimate-esign",
      })
      if (!publicUrl) return json(res, 500, { error: "Could not store signed estimate." })

      await service.from("entity_attachments").insert({
        user_id: quote.user_id,
        quote_id: quote.id,
        storage_path: storagePath,
        public_url: publicUrl,
        content_type: "application/pdf",
        file_name: fileName,
        metadata: {
          archived_estimate_pdf: true,
          prepared_at: new Date().toISOString(),
          source: "esign",
          customer_signed: true,
          esign_signer_name: signerName,
        },
      })

      await markApproved(
        service,
        quote.user_id as string,
        quote.id as string,
        (quote.customer_id as string | null) ?? null,
        signerName,
      )

      return json(res, 200, { ok: true, alreadySigned: false })
    }

    return json(res, 400, { error: "Unknown action." })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = /unauthorized/i.test(msg) ? 401 : 500
    return json(res, status, { error: msg })
  }
}
