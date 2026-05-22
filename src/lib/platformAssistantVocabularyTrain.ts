import type {
  AssistantCustomActionPayload,
  AssistantCustomVocabularyEntry,
  AssistantVocabularyMatchMode,
} from "./platformAssistantCustomVocabulary"

export type VocabularyTrainChatTurn = { role: "user" | "assistant"; content: string }

export type VocabularyTrainProposal = {
  phrase: string
  match: AssistantVocabularyMatchMode
  action: AssistantCustomActionPayload
  label: string
  note?: string
}

export type VocabularyTrainCoachResponse = {
  ok: boolean
  reply: string
  /** True when coach is confident and admin can turn on proposed phrases. */
  readyToSave?: boolean
  proposals: VocabularyTrainProposal[]
  clarifyingQuestions?: string[]
  fallback?: boolean
}

export async function askPlatformAssistantVocabularyCoach(
  accessToken: string,
  opts: {
    message: string
    catalog: string
    context?: {
      platform?: string
      currentPage?: string
      selectedCustomerName?: string | null
    }
    history?: VocabularyTrainChatTurn[]
  },
): Promise<VocabularyTrainCoachResponse> {
  const token = accessToken.trim()
  if (!token) throw new Error("Not signed in.")

  const res = await fetch("/api/platform-tools?__route=platform-assistant-vocabulary-train", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: opts.message.trim().slice(0, 2000),
      catalog: opts.catalog.slice(0, 24_000),
      context: opts.context ?? {},
      history: opts.history?.slice(-24) ?? [],
    }),
  })

  let data: VocabularyTrainCoachResponse
  try {
    data = (await res.json()) as VocabularyTrainCoachResponse
  } catch {
    throw new Error(`Training coach failed (HTTP ${res.status}).`)
  }

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Training coach failed (HTTP ${res.status}).`)
  }

  return {
    ok: Boolean(data.ok),
    reply: data.reply ?? "",
    readyToSave: Boolean(data.readyToSave),
    proposals: Array.isArray(data.proposals) ? data.proposals : [],
    clarifyingQuestions: data.clarifyingQuestions,
    fallback: data.fallback,
  }
}

export function proposalToDraftEntry(
  p: VocabularyTrainProposal,
): Omit<AssistantCustomVocabularyEntry, "id" | "createdAt" | "createdBy"> {
  return {
    phrase: p.phrase,
    match: p.match,
    action: p.action,
    enabled: true,
    note: p.note,
  }
}

export function describeCustomAction(a: AssistantCustomActionPayload): string {
  switch (a.type) {
    case "navigate":
      return `Open ${a.page} tab`
    case "find_customer":
      return `Find customer “${a.query}”`
    case "create_estimate":
      return a.useSelectedCustomer ? "Start estimate (customer on screen)" : `Start estimate for ${a.customerQuery ?? "named customer"}`
    case "focus_customer_sms":
      return a.useSelectedCustomer ? "Open SMS (customer on screen)" : `SMS for ${a.customerQuery ?? "customer"}`
    case "handoff_specialist_assistant":
      return `Hand off → ${a.specialist.replace(/_/g, " ")}`
    case "open_mini_wizard":
      return `Setup wizard: ${a.wizardId}`
    case "open_admin":
      return `Admin: ${a.panel}`
    default:
      return a.type.replace(/_/g, " ")
  }
}
