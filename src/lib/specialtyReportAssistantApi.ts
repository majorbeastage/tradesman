import {
  buildSpecialtyReportFieldCatalog,
  type SpecialtyReportFieldAssignment,
} from "./specialtyReportAssistantParse"
import { platformToolsFetchOrigins, platformToolsJsonBody, readPlatformToolsJsonBody } from "./platformToolsJsonBody"
import { supabase } from "./supabase"

export async function fetchSpecialtyReportFieldFills(
  utterance: string,
  accessToken: string,
): Promise<{ fills: SpecialtyReportFieldAssignment[]; note?: string }> {
  const fields = buildSpecialtyReportFieldCatalog()
  const body = platformToolsJsonBody({ utterance: utterance.slice(0, 8000), fields })
  const bases = platformToolsFetchOrigins()
  let lastNote = ""

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i]
    const ac = new AbortController()
    const kill = window.setTimeout(() => ac.abort(), 50_000)
    let res: Response
    try {
      res = await fetch(`${base}/api/platform-tools?__route=specialty-report-field-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body,
        signal: ac.signal,
      })
    } catch (err) {
      clearTimeout(kill)
      lastNote = err instanceof Error ? err.message : String(err)
      if (i < bases.length - 1) continue
      return { fills: [], note: lastNote }
    }
    clearTimeout(kill)

    const parsed = await readPlatformToolsJsonBody<{
      ok?: boolean
      fills?: Array<{ fieldKey?: string; value?: string }>
      note?: string
    }>(res)
    const data = parsed.data
    if (!data) {
      lastNote = parsed.rawEmpty ? "Empty response from server." : "Invalid response from server."
      if (i < bases.length - 1) continue
      return { fills: [], note: lastNote }
    }
    const fills = (data.fills ?? [])
      .filter((r): r is { fieldKey: string; value: string } => typeof r.fieldKey === "string" && typeof r.value === "string")
      .map((r) => ({ fieldKey: r.fieldKey, value: r.value.trim() }))
      .filter((r) => r.value.length > 0)
    return { fills, note: typeof data.note === "string" ? data.note : undefined }
  }

  return { fills: [], note: lastNote || "Could not reach assistant service." }
}

export async function getPlatformToolsAccessToken(): Promise<string> {
  let tok = ""
  if (supabase) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session?.access_token) tok = refreshed.session.access_token.trim()
    else {
      const { data: snap } = await supabase.auth.getSession()
      if (snap.session?.access_token) tok = snap.session.access_token.trim()
    }
  }
  return tok
}
