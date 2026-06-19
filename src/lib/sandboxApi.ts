/** Client helpers for training sandbox API. */

import { supabase } from "./supabase"
import { dispatchSandboxTrafficEvent } from "./sandboxTrafficEvents"

export type SandboxApiAction = "seed" | "inject_lead" | "tick" | "set_live_traffic" | "reset"

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

export async function seedSandboxWorkspace(force = false): Promise<void> {
  const res = await sandboxFetch("seed", force ? { force: true } : {})
  const raw = await res.text()
  if (!res.ok) throw new Error(parseApiError(raw, res.status))
  dispatchSandboxTrafficEvent()
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
}): Promise<{ ok: boolean; error?: string; password?: string; emailed?: boolean }> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "")
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (!base || !anon) return { ok: false, error: "Sandbox service is not configured." }

  const res = await fetch(`${base}/functions/v1/provision-sandbox`, {
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
  })
  let json: { error?: string; password?: string; emailed?: boolean } = {}
  try {
    json = (await res.json()) as typeof json
  } catch {
    /* ignore */
  }
  if (!res.ok) return { ok: false, error: json.error ?? `Sandbox service error (${res.status})` }
  return { ok: true, password: json.password, emailed: json.emailed }
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
