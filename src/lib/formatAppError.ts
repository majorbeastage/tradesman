export const SESSION_EXPIRED_ERROR_CODE = "session_expired"

/** Turn thrown values into user-visible text (Supabase PostgrestError, Error, etc.). */
export function formatAppError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>
    const msg = typeof o.message === "string" ? o.message : ""
    const details = typeof o.details === "string" ? o.details : ""
    const hint = typeof o.hint === "string" ? o.hint : ""
    const code = typeof o.code === "string" ? o.code : ""
    const parts = [msg, details, hint, code && `(${code})`].filter(Boolean)
    if (parts.length) return parts.join(" - ")
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/** True when PostgREST/GoTrue rejected the request because the login token is dead. */
export function isAuthSessionError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : ""
  if (code === "PGRST301" || code === SESSION_EXPIRED_ERROR_CODE) return true
  const msg = formatAppError(err).toLowerCase()
  return (
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("invalid claim") ||
    msg.includes("session from session_id claim") ||
    msg.includes("auth session missing") ||
    msg.includes("not authenticated") ||
    msg.includes("please sign in again")
  )
}

export function sessionExpiredError(): Error {
  const err = new Error("Your session expired. Please sign in again.")
  ;(err as Error & { code?: string }).code = SESSION_EXPIRED_ERROR_CODE
  return err
}

/** Postgres statement_timeout (SQLSTATE 57014) — common on large shops under RLS. */
export function isStatementTimeoutError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : ""
  if (code === "57014") return true
  const msg = formatAppError(err).toLowerCase()
  return msg.includes("statement timeout") || msg.includes("57014")
}
