import type { SupabaseClient } from "@supabase/supabase-js"
import { uploadEntityAttachmentFile } from "./uploadCommAttachment"

export const ARCHIVED_ESTIMATE_PDF_META = "archived_estimate_pdf"
export const CUSTOMER_SIGNED_ESTIMATE_LABEL = "Customer Signed Estimate or Proposal"

export type ArchivedEstimatePdfRow = {
  id: string
  public_url: string
  file_name: string | null
  created_at: string
  prepared_at: string | null
  source: string | null
  signed: boolean
}

function parseArchiveMeta(metadata: unknown): { prepared_at: string | null; source: string | null; signed: boolean } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { prepared_at: null, source: null, signed: false }
  }
  const m = metadata as Record<string, unknown>
  return {
    prepared_at: typeof m.prepared_at === "string" ? m.prepared_at : null,
    source: typeof m.source === "string" ? m.source : null,
    signed: m.customer_signed === true,
  }
}

export function isArchivedEstimatePdfMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  return (metadata as Record<string, unknown>)[ARCHIVED_ESTIMATE_PDF_META] === true
}

export function isCustomerSignedEstimateMetadata(metadata: unknown): boolean {
  if (!isArchivedEstimatePdfMetadata(metadata)) return false
  return parseArchiveMeta(metadata).signed
}

export function filterQuoteMediaAttachments<T extends { metadata?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => !isArchivedEstimatePdfMetadata(r.metadata))
}

export function filterCustomerSignedEstimateAttachments<T extends { metadata?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => isCustomerSignedEstimateMetadata(r.metadata))
}

export async function archiveEstimatePdfBytes(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  pdfBytes: Uint8Array,
  opts: { source: "email" | "download" | "manual"; preparedAt?: string; signed?: boolean },
): Promise<ArchivedEstimatePdfRow | null> {
  const shortId = quoteId.slice(0, 8).toUpperCase()
  const stamp = (opts.preparedAt ?? new Date().toISOString()).slice(0, 10)
  const fileName = `estimate-${shortId}-${stamp}.pdf`
  const file = new File([pdfBytes as BlobPart], fileName, { type: "application/pdf" })
  const up = await uploadEntityAttachmentFile({ userId, quoteId, file })
  if (!up) return null
  const prepared_at = opts.preparedAt ?? new Date().toISOString()
  const { data, error } = await supabase
    .from("entity_attachments")
    .insert({
      user_id: userId,
      quote_id: quoteId,
      storage_path: up.storage_path,
      public_url: up.public_url,
      content_type: "application/pdf",
      file_name: fileName,
      metadata: {
        [ARCHIVED_ESTIMATE_PDF_META]: true,
        prepared_at,
        source: opts.source,
        customer_signed: opts.signed === true,
      },
    })
    .select("id, public_url, file_name, created_at, metadata")
    .maybeSingle()
  if (error || !data) return null
  const meta = parseArchiveMeta((data as { metadata?: unknown }).metadata)
  return {
    id: String((data as { id: string }).id),
    public_url: String((data as { public_url: string }).public_url),
    file_name: (data as { file_name?: string | null }).file_name ?? fileName,
    created_at: String((data as { created_at: string }).created_at),
    prepared_at: meta.prepared_at,
    source: meta.source,
    signed: meta.signed,
  }
}

export async function loadArchivedEstimatePdfs(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<ArchivedEstimatePdfRow[]> {
  const { data, error } = await supabase
    .from("entity_attachments")
    .select("id, public_url, file_name, created_at, metadata")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
  if (error) throw error
  const out: ArchivedEstimatePdfRow[] = []
  for (const row of data ?? []) {
    const meta = (row as { metadata?: unknown }).metadata
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue
    if ((meta as Record<string, unknown>)[ARCHIVED_ESTIMATE_PDF_META] !== true) continue
    const parsed = parseArchiveMeta(meta)
    out.push({
      id: String((row as { id: string }).id),
      public_url: String((row as { public_url: string }).public_url),
      file_name: (row as { file_name?: string | null }).file_name ?? null,
      created_at: String((row as { created_at: string }).created_at),
      prepared_at: parsed.prepared_at,
      source: parsed.source,
      signed: parsed.signed,
    })
  }
  return out
}

export async function getLatestArchivedEstimatePdf(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<ArchivedEstimatePdfRow | null> {
  const rows = await loadArchivedEstimatePdfs(supabase, quoteId)
  return rows[0] ?? null
}

function safeInboundFileName(raw: string | null | undefined, quoteId: string): string {
  const base = (raw || "customer-signed-estimate").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base
  const shortId = quoteId.slice(0, 8).toUpperCase()
  const stamp = new Date().toISOString().slice(0, 10)
  return `customer-signed-${shortId}-${stamp}.pdf`
}

async function markQuoteApprovedByCustomer(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<void> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("metadata, status")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !quote) return
  const prevMeta =
    quote.metadata && typeof quote.metadata === "object" && !Array.isArray(quote.metadata)
      ? (quote.metadata as Record<string, unknown>)
      : {}
  const signedAt = new Date().toISOString()
  const nextMeta = {
    ...prevMeta,
    customer_approval: "approved",
    estimate_approval: "approved",
    customer_signed_at: signedAt,
  }
  const status = String(quote.status ?? "").trim()
  const nextStatus = status && status.toLowerCase() !== "accepted" ? "Accepted" : quote.status
  await supabase
    .from("quotes")
    .update({ metadata: nextMeta, ...(nextStatus ? { status: nextStatus } : {}) })
    .eq("id", quoteId)
    .eq("user_id", userId)
}

/** Copy an inbound email/MMS file onto a quote as a customer-signed estimate or proposal. */
export async function saveInboundFileAsCustomerSignedEstimate(
  supabase: SupabaseClient,
  params: {
    userId: string
    quoteId: string
    sourceUrl: string
    fileName?: string | null
    contentType?: string | null
    communicationAttachmentId?: string | null
    markApproved?: boolean
  },
): Promise<ArchivedEstimatePdfRow | null> {
  const { userId, quoteId, sourceUrl } = params
  if (!sourceUrl.trim()) return null

  if (params.communicationAttachmentId) {
    const { data: existing } = await supabase
      .from("entity_attachments")
      .select("id, public_url, file_name, created_at, metadata")
      .eq("quote_id", quoteId)
      .eq("user_id", userId)
      .filter("metadata->>saved_comm_attachment_id", "eq", params.communicationAttachmentId)
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      const meta = parseArchiveMeta((existing as { metadata?: unknown }).metadata)
      return {
        id: String(existing.id),
        public_url: String((existing as { public_url: string }).public_url),
        file_name: (existing as { file_name?: string | null }).file_name ?? null,
        created_at: String((existing as { created_at: string }).created_at),
        prepared_at: meta.prepared_at,
        source: meta.source,
        signed: meta.signed,
      }
    }
  }

  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error("Could not download the attachment.")
  const arrayBuffer = await res.arrayBuffer()
  if (!arrayBuffer.byteLength) throw new Error("Attachment file is empty.")
  const contentType =
    params.contentType?.trim() ||
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    "application/octet-stream"
  const fileName = safeInboundFileName(params.fileName, quoteId)
  const file = new File([arrayBuffer], fileName, { type: contentType })
  const up = await uploadEntityAttachmentFile({ userId, quoteId, file })
  if (!up) throw new Error("Upload failed.")

  const savedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from("entity_attachments")
    .insert({
      user_id: userId,
      quote_id: quoteId,
      storage_path: up.storage_path,
      public_url: up.public_url,
      content_type: contentType,
      file_name: fileName,
      metadata: {
        [ARCHIVED_ESTIMATE_PDF_META]: true,
        customer_signed: true,
        customer_signed_label: CUSTOMER_SIGNED_ESTIMATE_LABEL,
        prepared_at: savedAt,
        source: "inbound_email",
        saved_at: savedAt,
        ...(params.communicationAttachmentId
          ? { saved_comm_attachment_id: params.communicationAttachmentId }
          : {}),
      },
    })
    .select("id, public_url, file_name, created_at, metadata")
    .maybeSingle()
  if (error || !data) throw error ?? new Error("Could not save attachment to estimate.")

  if (params.markApproved !== false) {
    await markQuoteApprovedByCustomer(supabase, userId, quoteId)
  }

  const meta = parseArchiveMeta((data as { metadata?: unknown }).metadata)
  return {
    id: String((data as { id: string }).id),
    public_url: String((data as { public_url: string }).public_url),
    file_name: (data as { file_name?: string | null }).file_name ?? fileName,
    created_at: String((data as { created_at: string }).created_at),
    prepared_at: meta.prepared_at,
    source: meta.source,
    signed: meta.signed,
  }
}
