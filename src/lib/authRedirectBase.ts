/**
 * Base URL embedded in Supabase auth emails (password reset, etc.).
 * Set `VITE_SITE_URL` in Vercel / production builds to your live origin so links never use localhost.
 */
export function getAuthRedirectBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL
  const trimmed = typeof fromEnv === "string" ? fromEnv.trim().replace(/\/+$/, "") : ""
  if (trimmed) return trimmed
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin
  return ""
}

/** Where Supabase redirects after the user clicks “reset password” in email (hash tokens appended by Supabase). */
export function getPasswordRecoveryRedirectTo(): string {
  const base = getAuthRedirectBaseUrl()
  return base ? `${base}/reset-password` : ""
}

/**
 * Supabase often sends users to **Authentication → Site URL** (usually `https://yoursite/`) with recovery tokens in the **hash**,
 * e.g. `/#access_token=...&type=recovery`. This app only shows the reset form when the path is `/reset-password` (see `App.tsx`).
 * Call once at startup (before reading `pathname`) so the SPA route matches and `ResetPasswordPage` runs.
 */
export function normalizePasswordRecoveryUrlInBrowser(): void {
  if (typeof window === "undefined") return
  const { pathname, hash } = window.location
  const pn = pathname === "" ? "/" : pathname
  if (pn !== "/" || !hash || hash === "#") return
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  if (!raw.trim()) return
  const sp = new URLSearchParams(raw)
  const type = sp.get("type")
  if (type === "signup" || type === "magiclink" || type === "email_change") return
  const isRecovery = type === "recovery"
  const isAuthError = Boolean(sp.get("error") && (sp.get("error_code") || sp.get("error_description")))
  if (!isRecovery && !isAuthError) return
  const next = `/reset-password${hash.startsWith("#") ? hash : `#${hash}`}`
  window.history.replaceState(null, document.title, next)
}

/**
 * Supabase puts errors in the URL hash (e.g. otp_expired) when a magic/reset link is invalid, expired, or already used.
 * Reads the message, clears the hash, returns text for UI.
 */
export function consumeAuthHashErrorMessage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  if (!raw.trim()) return null
  const params = new URLSearchParams(raw)
  const code = params.get("error_code")
  const err = params.get("error")
  if (!code && !err) return null
  const desc = params.get("error_description")?.replace(/\+/g, " ")
  const msg =
    code === "otp_expired"
      ? "That reset link has expired or was already used (each link works once). Request a new password reset and open the new email right away."
      : desc || err || "Something went wrong with that link."
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search)
  return msg
}
