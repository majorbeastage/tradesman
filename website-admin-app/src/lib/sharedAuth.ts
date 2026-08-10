import { supabase } from "./supabaseClient"

function handoffApiUrl(): string {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_ORIGIN ?? "").trim().replace(/\/+$/, "")
  if (configured) return `${configured}/api/website-admin-handoff`
  return "/api/website-admin-handoff"
}

async function redeemHandoffCode(code: string): Promise<boolean> {
  const response = await fetch(handoffApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem", code }),
  })
  const payload = (await response.json().catch(() => ({}))) as { tokenHash?: string }
  if (!response.ok || !payload.tokenHash || !supabase) return false
  const { error } = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "magiclink",
  })
  return !error
}

export async function applySessionFromUrl(url: string): Promise<boolean> {
  try {
    const params = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "")
    const code = params.get("code")?.trim()
    if (!code?.startsWith("wh_")) return false
    return redeemHandoffCode(code)
  } catch {
    return false
  }
}

export async function initSharedAuth(): Promise<() => void> {
  if (typeof window !== "undefined") {
    const href = window.location.href
    if (href.includes("code=wh_")) {
      await applySessionFromUrl(href)
      history.replaceState(null, "", window.location.pathname)
    }
  }
  return () => {}
}
