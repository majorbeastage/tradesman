/** Client helpers for self-serve demo accounts (request-a-demo flow). */

export const DEMO_ACTIVATION_HOURS = 8
export const DEMO_ACTIVE_HOURS = 24

export function isDemoProfile(
  portalConfig: { demo_account?: boolean } | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  role?: string | null,
): boolean {
  if (role === "demo_user") return true
  if (portalConfig?.demo_account === true) return true
  if (metadata?.demo_account === true) return true
  return false
}

/** Returns a user-facing block reason, or null if access is OK. */
export function demoAccessBlockReason(
  metadata: Record<string, unknown> | null | undefined,
  portalConfig: { demo_account?: boolean } | null | undefined,
  role?: string | null,
): string | null {
  if (!isDemoProfile(portalConfig, metadata, role)) return null

  const activateBy = typeof metadata?.demo_activate_by === "string" ? metadata.demo_activate_by : null
  const activatedAt = typeof metadata?.demo_activated_at === "string" ? metadata.demo_activated_at : null
  const expiresAt = typeof metadata?.demo_expires_at === "string" ? metadata.demo_expires_at : null
  const now = Date.now()

  if (!activatedAt && activateBy && new Date(activateBy).getTime() < now) {
    return "Your demo login was not used within 8 hours and has been removed. Request a new demo from the home page."
  }
  if (activatedAt && expiresAt && new Date(expiresAt).getTime() < now) {
    return "Your 24-hour demo period has ended. Contact us or sign up for a paid plan to continue."
  }
  return null
}

export async function activateDemoSession(accessToken: string): Promise<void> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "")
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (!base || !anon || !accessToken.trim()) return

  await fetch(`${base}/functions/v1/activate-demo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
  }).catch(() => {
    /* best-effort */
  })
}
