import { supabase } from "./supabase"

const BUCKET = "comm-attachments"

/** Supabase comm-attachments bucket limit (50 MB). */
export const ENTITY_ATTACHMENT_MAX_BYTES = 52_428_800

export const ENTITY_ATTACHMENT_ACCEPT =
  "image/*,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** Some browsers (especially mobile) leave file.type empty for PDFs — fix before storage upload. */
export function normalizeEntityAttachmentFile(file: File): File {
  const name = file.name || "attachment"
  const lower = name.toLowerCase()
  let type = (file.type || "").trim()
  if (!type && lower.endsWith(".pdf")) type = "application/pdf"
  else if (!type && lower.endsWith(".docx")) type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  else if (!type && lower.endsWith(".doc")) type = "application/msword"
  else if (!type && /\.(jpe?g)$/.test(lower)) type = "image/jpeg"
  else if (!type && lower.endsWith(".png")) type = "image/png"
  else if (!type && lower.endsWith(".webp")) type = "image/webp"
  else if (!type && lower.endsWith(".gif")) type = "image/gif"
  if (type && type !== file.type) return new File([file], name, { type, lastModified: file.lastModified })
  return file
}

/**
 * Upload files to public comm-attachments bucket under the signed-in user's folder.
 * Returns public URLs for use with /api/outbound-messages (email attachments, MMS).
 */
/**
 * Storage RLS only allows uploads under auth.uid(). Account-owner / org-scoped
 * data user ids (e.g. Bhair → Shair) must not be used as the folder prefix.
 */
async function resolveStorageUploadUserId(preferredUserId?: string | null): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  const authId = data.user?.id?.trim() || ""
  if (authId) return authId
  const preferred = typeof preferredUserId === "string" ? preferredUserId.trim() : ""
  return preferred || null
}

/** Upload raw bytes to comm-attachments; returns a public HTTPS URL for outbound email/MMS. */
export async function uploadBytesForOutbound(
  userId: string,
  bytes: Uint8Array,
  filename: string,
  subfolder: string,
  contentType = "application/octet-stream",
): Promise<string | null> {
  if (!supabase || !bytes.length) return null
  const storageUserId = await resolveStorageUploadUserId(userId)
  if (!storageUserId) return null
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file.bin"
  const safeSub = subfolder.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 64) || "misc"
  const path = `${storageUserId}/${safeSub}/${crypto.randomUUID()}-${safeName}`
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  const blob = new Blob([buf], { type: contentType })
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType,
  })
  if (error) {
    console.error("[uploadBytesForOutbound]", error.message)
    return null
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl ?? null
}

export async function uploadFilesForOutbound(userId: string, files: File[], subfolder: string): Promise<string[]> {
  if (!supabase || !files.length) return []
  const storageUserId = await resolveStorageUploadUserId(userId)
  if (!storageUserId) return []
  const safeSub = subfolder.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 64) || "misc"
  const urls: string[] = []
  for (const f of files) {
    const name = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
    const path = `${storageUserId}/${safeSub}/${crypto.randomUUID()}-${name}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
      upsert: false,
      contentType: f.type || "application/octet-stream",
    })
    if (error) {
      console.error("[uploadCommAttachment]", error.message)
      continue
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    if (data?.publicUrl) urls.push(data.publicUrl)
  }
  return urls
}

export async function uploadEntityAttachmentFile(params: {
  userId: string
  quoteId?: string | null
  calendarEventId?: string | null
  file: File
}): Promise<{ public_url: string; storage_path: string } | null> {
  if (!supabase) return null
  const { userId, quoteId, calendarEventId } = params
  const file = normalizeEntityAttachmentFile(params.file)
  const prefix =
    quoteId != null && quoteId !== ""
      ? `${userId}/quotes/${quoteId}`
      : calendarEventId != null && calendarEventId !== ""
        ? `${userId}/calendar/${calendarEventId}`
        : null
  if (!prefix) return null
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
  const path = `${prefix}/${crypto.randomUUID()}-${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  })
  if (error) {
    console.error("[uploadEntityAttachment]", error.message, { path, contentType: file.type, size: file.size })
    return null
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) return null
  return { public_url: data.publicUrl, storage_path: path }
}

export async function uploadInvoiceAttachmentFile(params: {
  userId: string
  invoiceId: string
  file: File
}): Promise<{ public_url: string; storage_path: string } | null> {
  if (!supabase) return null
  const { userId, invoiceId, file } = params
  if (!invoiceId.trim()) return null
  const normalized = normalizeEntityAttachmentFile(file)
  const name = normalized.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
  const path = `${userId}/invoices/${invoiceId}/${crypto.randomUUID()}-${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, normalized, {
    upsert: false,
    contentType: normalized.type || "application/octet-stream",
  })
  if (error) {
    console.error("[uploadInvoiceAttachment]", error.message, { path, contentType: normalized.type, size: normalized.size })
    return null
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) return null
  return { public_url: data.publicUrl, storage_path: path }
}
