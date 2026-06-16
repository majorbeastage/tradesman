const EMAIL_SIGNATURE_STORAGE_KEY = "tradesman_email_signature"

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
  }
}

export function appendEmailSignature(body: string, signature?: string): string {
  const sig = (signature ?? loadStoredEmailSignature()).trim()
  const trimmed = body.trim()
  if (!sig) return trimmed
  return `${trimmed}${trimmed ? "\n\n" : ""}--\n${sig}`
}