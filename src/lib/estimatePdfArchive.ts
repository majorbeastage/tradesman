import type { SupabaseClient } from "@supabase/supabase-js"
import { uploadEntityAttachmentFile } from "./uploadCommAttachment"

export const ARCHIVED_ESTIMATE_PDF_META = "archived_estimate_pdf"

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
