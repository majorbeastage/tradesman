/** Client helpers for training sandbox API. */

import { supabase } from "./supabase"
import { dispatchSandboxTrafficEvent } from "./sandboxTrafficEvents"

export type SandboxApiAction = "seed" | "inject_lead" | "tick" | "set_live_traffic" | "reset" | "repair_profile"

async function sandboxFetch(action: SandboxApiAction, body: Record<string, unknown> = {}): Promise<Response> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const userId = session?.user?.id
  if (!userId || !session?.access_token) {
    throw new Error("Sign in to use the training sandbox.")
  }
  return fetch("/api/sandbox-simulator", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action,
      userId,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      ...body,
    }),
  })
}

export async function repairSandboxProfile(): Promise<boolean> {
  const res = await sandboxFetch("repair_profile")
  const raw = await res.text()
  if (!res.ok) throw new Error(parseApiError(raw, res.status))
  try {
    const json = JSON.parse(raw) as { profileRepaired?: boolean }
    return json.profileRepaired === true
  } catch {
    return false
  }
}

export async function seedSandboxWorkspace(force = false): Promise<{ profileRepaired?: boolean; customerCount?: number }> {
  const res = await sandboxFetch("seed", force ? { force: true } : {})
  const raw = await res.text()
  if (!res.ok) throw new Error(parseApiError(raw, res.status))
  dispatchSandboxTrafficEvent()
  try {
    return JSON.parse(raw) as { profileRepaired?: boolean; customerCount?: number }
  } catch {
    return {}
  }
}

export async function injectSandboxLead(scenarioIndex?: number): Promise<{ scenario: string; channel: string }> {
  const res = await sandboxFetch("inject_lead", scenarioIndex != null ? { scenarioIndex } : {})
  const raw = await res.text()
  if (!res.ok) throw new Error(parseApiError(raw, res.status))
  const json = JSON.parse(raw) as { scenario?: string; channel?: string }
  dispatchSandboxTrafficEvent()
  return { scenario: json.scenario ?? "New lead", channel: json.channel ?? "web" }
}

export async function sandboxTrafficTick(): Promise<boolean> {
  const res = await sandboxFetch("tick")
  const raw = await res.text()
  if (!res.ok) return false
  try {
    const json = JSON.parse(raw) as { injected?: boolean }
    if (json.injected) dispatchSandboxTrafficEvent()
    return json.injected === true
  } catch {
    return false
  }
}

export async function setSandboxLiveTraffic(enabled: boolean, intervalMinutes = 3): Promise<void> {
  const res = await sandboxFetch("set_live_traffic", { enabled, intervalMinutes })
  const raw = await res.text()
  if (!res.ok) throw new Error(parseApiError(raw, res.status))
}

export async function resetSandboxWorkspace(): Promise<void> {
  const res = await sandboxFetch("reset")
  const raw = await res.text()
  if (!res.ok) throw new Error(parseApiError(raw, res.status))
  dispatchSandboxTrafficEvent()
}

export async function provisionSandboxAccount(params: {
  email: string
  name: string
  businessName?: string
}): Promise<{
  ok: boolean
  error?: string
  password?: string
  embedSlug?: string
  emailed?: boolean
  customerCount?: number
}> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "")
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (!base || !anon) return { ok: false, error: "Sandbox service is not configured." }

  const ac = new AbortController()
  const timer = window.setTimeout(() => ac.abort(), 45_000)
  let res: Response
  try {
    res = await fetch(`${base}/functions/v1/provision-sandbox`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify({
        email: params.email.trim(),
        name: params.name.trim(),
        business_name: params.businessName?.trim() || null,
      }),
      signal: ac.signal,
    })
  } catch (e) {
    window.clearTimeout(timer)
    const aborted = e instanceof Error && e.name === "AbortError"
    return {
      ok: false,
      error: aborted
        ? "Sandbox creation timed out after 45 seconds. Try again — if it keeps failing, contact support."
        : e instanceof Error
          ? e.message
          : "Network error while creating sandbox.",
    }
  }
  window.clearTimeout(timer)
  let json: {
    error?: string
    password?: string
    embedSlug?: string
    emailed?: boolean
    customerCount?: number
  } = {}
  try {
    json = (await res.json()) as typeof json
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const statusHint =
      res.status === 404
        ? " The training sandbox service is not deployed yet — contact support or try again in a few minutes."
        : ""
    return { ok: false, error: (json.error ?? `Sandbox service error (${res.status})`) + statusHint }
  }
  return { ok: true, password: json.password, embedSlug: json.embedSlug, emailed: json.emailed, customerCount: json.customerCount }
}

function parseApiError(raw: string, status: number): string {
  try {
    const j = JSON.parse(raw) as { error?: string }
    if (j.error) return j.error
  } catch {
    /* ignore */
  }
  return raw.trim() || `Request failed (${status})`
}
