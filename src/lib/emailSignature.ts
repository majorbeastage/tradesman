const EMAIL_SIGNATURE_STORAGE_KEY = "tradesman_email_signature"
export const EMAIL_SIGNATURE_META_KEY = "email_signature_v1"

export type EmailSignatureDoc = {
  v: 1
  text: string
  html?: string
  logoUrl?: string | null
  updated_at?: string
}

export function loadStoredEmailSignature(): string {
  if (typeof window === "undefined") return ""
  try {
    return localStorage.getItem(EMAIL_SIGNATURE_STORAGE_KEY)?.trim() ?? ""
  } catch {
    return ""
  }
}

export function saveStoredEmailSignature(signature: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(EMAIL_SIGNATURE_STORAGE_KEY, signature)
  } catch {
    /* ignore */
  }
}

export function parseEmailSignatureDoc(raw: unknown): EmailSignatureDoc | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const text = typeof o.text === "string" ? o.text.trim() : ""
  const html = typeof o.html === "string" ? o.html.trim() : ""
  if (!text && !html) return null
  return {
    v: 1,
    text: text || htmlToPlainText(html),
    html: html || undefined,
    logoUrl: typeof o.logoUrl === "string" && o.logoUrl.trim() ? o.logoUrl.trim() : null,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : undefined,
  }
}

export function loadEmailSignatureFromMetadata(metadata: unknown): EmailSignatureDoc | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  return parseEmailSignatureDoc((metadata as Record<string, unknown>)[EMAIL_SIGNATURE_META_KEY])
}

export function mergeEmailSignatureMetadata(
  prevMeta: Record<string, unknown>,
  doc: EmailSignatureDoc,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [EMAIL_SIGNATURE_META_KEY]: {
      ...doc,
      v: 1,
      updated_at: new Date().toISOString(),
    },
  }
}

export type EmailSignatureRoleHint = "field" | "office_manager" | "corporate_management" | "unknown"

export function inferSignatureRoleHint(role: string | null | undefined): EmailSignatureRoleHint {
  const r = (role ?? "").trim().toLowerCase()
  if (r === "office_manager" || r === "om") return "office_manager"
  if (r === "corporate_management" || r === "corp" || r === "admin") return "corporate_management"
  if (r) return "field"
  return "unknown"
}

/** Starter signature text when the user has not saved one yet (role-aware placeholders). */
export function defaultSignatureTextForRole(
  role: string | null | undefined,
  displayName?: string | null,
): string {
  const name = displayName?.trim() || "Your name"
  const hint = inferSignatureRoleHint(role)
  switch (hint) {
    case "office_manager":
      return `${name}\nOffice Manager\n{{Company name}}\n{{Office phone}}`
    case "corporate_management":
      return `${name}\n{{Title}}\n{{Company name}}\n{{Office phone}}`
    default:
      return `${name}\n{{Your trade}} Specialist\n{{Mobile phone}}`
  }
}

export function buildEmailSignatureDoc(text: string, logoUrl?: string | null): EmailSignatureDoc | null {
  const trimmed = text.trim()
  const logo = logoUrl?.trim() || null
  if (!trimmed && !logo) return null
  return { v: 1, text: trimmed, logoUrl: logo }
}

export function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  const div = document.createElement("div")
  div.innerHTML = html
  return (div.innerText || div.textContent || "").trim()
}

export function appendEmailSignature(body: string, signature?: string): string {
  const sig = (signature ?? loadStoredEmailSignature()).trim()
  const trimmed = body.trim()
  if (!sig) return trimmed
  return `${trimmed}${trimmed ? "\n\n" : ""}--\n${sig}`
}

export function appendHtmlEmailSignature(bodyHtml: string, sigDoc: EmailSignatureDoc | null): string {
  const trimmed = bodyHtml.trim()
  if (!sigDoc) return trimmed
  const sigHtml =
    sigDoc.html?.trim() ||
    (sigDoc.text ? `<div style="white-space:pre-wrap">${escapeHtml(sigDoc.text)}</div>` : "")
  if (!sigHtml) return trimmed
  const logo =
    sigDoc.logoUrl?.trim() ?
      `<div style="margin-top:8px"><img src="${escapeAttr(sigDoc.logoUrl.trim())}" alt="" style="max-height:48px;max-width:160px" /></div>`
    : ""
  const block = `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;color:#475569;font-size:13px">${sigHtml}${logo}</div>`
  return `${trimmed}${block}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}
