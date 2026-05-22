import type { AssistantParseResult, GlobalAssistantAction } from "./globalAssistantNav"

export type PlatformAssistantLlmResponse = {
  ok: boolean
  result?: AssistantParseResult
  fallback?: boolean
  note?: string
}

const ALLOWED_TYPES = new Set([
  "navigate",
  "open_setup_guide",
  "open_mini_wizard",
  "open_admin",
  "find_customer",
  "open_last_missed_call",
  "open_current_customer",
  "create_estimate",
  "focus_customer_sms",
  "open_specialty_report",
  "explain",
  "handoff_specialist_assistant",
  "clarify",
])

function isValidAction(action: GlobalAssistantAction): boolean {
  if (action.type === "open_customer") return false
  return ALLOWED_TYPES.has(action.type)
}

function normalizeLlmResult(raw: PlatformAssistantLlmResponse["result"]): AssistantParseResult | null {
  if (!raw?.action || !isValidAction(raw.action as GlobalAssistantAction)) return null
  const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0)))
  const action = raw.action as GlobalAssistantAction
  const alternatives = raw.alternatives
    ?.filter((a) => a?.action && isValidAction(a.action as GlobalAssistantAction))
    .slice(0, 3)
    .map((a) => ({
      label: String(a.label ?? "").slice(0, 80) || "Alternative",
      action: a.action as GlobalAssistantAction,
      confidence: Math.max(0, Math.min(100, Math.round(Number(a.confidence) || 0))),
    }))
  return {
    confidence,
    action,
    alternatives: alternatives?.length ? alternatives : undefined,
    ruleTopScore: 0,
    routedBy: "llm",
  }
}

/** Phase 2 — server LLM router when rule score is below threshold. */
export async function routePlatformAssistantWithLlm(
  accessToken: string,
  phrase: string,
  catalog: string,
  ctx: { isAdmin?: boolean; availableTabIds?: string[] },
): Promise<AssistantParseResult | null> {
  const token = accessToken.trim()
  if (!token || !phrase.trim() || !catalog.trim()) return null

  let res: Response
  try {
    res = await fetch("/api/platform-tools?__route=platform-assistant-route", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phrase: phrase.trim().slice(0, 500),
        catalog: catalog.slice(0, 24_000),
        isAdmin: Boolean(ctx.isAdmin),
        availableTabIds: ctx.availableTabIds ?? [],
      }),
    })
  } catch {
    return null
  }

  let data: PlatformAssistantLlmResponse
  try {
    data = (await res.json()) as PlatformAssistantLlmResponse
  } catch {
    return null
  }

  if (!data.ok || !data.result) return null
  return normalizeLlmResult(data.result)
}
