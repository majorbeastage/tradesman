/**
 * Open the hosted website admin portal with a one-time Tradesman SSO code.
 * No separate website admin username/password — same Supabase account.
 */
import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabase"
import { forceRefreshAccessToken, getFreshAccessToken } from "./authPlatformApi"
import { hostedWebsiteAdminOrigin } from "./hostedWebsite"

function handoffApiUrl(): string {
  if (!Capacitor.isNativePlatform()) return "/api/website-admin-handoff"
  const configured = String(import.meta.env.VITE_PUBLIC_APP_ORIGIN ?? "").trim().replace(/\/+$/, "")
  return `${configured || "https://www.tradesman-us.com"}/api/website-admin-handoff`
}

async function issueWebsiteAdminHandoffCode(): Promise<string> {
  if (!supabase) throw new Error("Not signed in.")
  let token = await getFreshAccessToken(supabase, null)
  if (!token) throw new Error("No active session. Sign in to Tradesman first.")

  const request = (accessToken: string) =>
    fetch(handoffApiUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue" }),
    })

  let response = await request(token)
  if (response.status === 401) {
    token = (await forceRefreshAccessToken(supabase)) ?? ""
    if (token) response = await request(token)
  }
  const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string }
  if (!response.ok || !payload.code) {
    throw new Error(payload.error || "Could not open the website editor.")
  }
  return payload.code
}

/** Opens the website admin app in a new tab with SSO. */
export async function openWebsiteAdminPortal(): Promise<{ ok: boolean; error?: string }> {
  try {
    const code = await issueWebsiteAdminHandoffCode()
    const adminOrigin = hostedWebsiteAdminOrigin()
    const url = `${adminOrigin}/?code=${encodeURIComponent(code)}`
    if (typeof window === "undefined") return { ok: false, error: "Browser unavailable." }
    window.open(url, "_blank", "noopener,noreferrer")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not open website editor." }
  }
}
