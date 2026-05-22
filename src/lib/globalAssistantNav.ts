/** Command routing for the platform assistant (registry + rules; LLM in Phase 2). */

import {
  ASSISTANT_ADMIN_PANEL_STORAGE_KEY,
  ADMIN_PANEL_LABELS,
  PLATFORM_ADMIN_INTENTS,
  PLATFORM_PAGE_INTENTS,
  PLATFORM_WIZARD_INTENTS,
  buildPlatformAssistantCatalogText,
  suggestPhrasesForPlatform,
  type AdminPanelId,
  type PlatformAssistantPlatform,
} from "./platformAssistantRegistry"
import { extractCustomerSearchQuery } from "./customerAssistantSearch"
import { isMissedCallAssistantPhrase } from "./customerAssistantMissedCall"
import { buildAssistantExplainMessage } from "./assistantExplain"
import {
  buildCustomVocabularyCatalogSection,
  matchCustomVocabularyEntry,
  type AssistantCustomActionPayload,
  type AssistantCustomVocabularyEntry,
} from "./platformAssistantCustomVocabulary"
import {
  buildAssistantSpecialistsCatalogSection,
  parseEstimateLineItemsHandoffIntent,
  type AssistantHandoffMode,
  type SpecialistAssistantId,
} from "./assistantHandoff"
import {
  buildPlatformAssistantDomainTraining,
  isCreateEstimatePhrase,
  isFocusSmsPhrase,
  isOpenSpecialtyReportPhrase,
  isOpenSelectedCustomerOnlyPhrase,
  normalizeAssistantPhrase,
  phraseHasWorkflowCue,
  resolveCustomerTargetFromPhrase,
} from "./platformAssistantVocabulary"
import type { SetupMiniWizardId } from "./setupGuideWizards"
import { getSetupMiniWizardDef } from "./setupGuideWizards"
import { TAB_ID_LABELS } from "../types/portal-builder"

export type GlobalAssistantAction =
  | { type: "navigate"; page: string; message: string }
  | { type: "open_setup_guide"; message: string }
  | { type: "open_mini_wizard"; wizardId: SetupMiniWizardId; message: string }
  | { type: "open_admin"; panel: AdminPanelId; message: string }
  | { type: "find_customer"; query: string; message: string }
  | { type: "open_last_missed_call"; message: string }
  | { type: "open_customer"; customerId: string; customerName: string; message: string }
  | { type: "open_current_customer"; message: string }
  | { type: "create_estimate"; customerId?: string; customerQuery?: string; message: string }
  | { type: "focus_customer_sms"; customerId?: string; customerQuery?: string; message: string }
  | { type: "open_specialty_report"; quoteId?: string; message: string }
  | { type: "explain"; message: string }
  | {
      type: "handoff_specialist_assistant"
      specialist: SpecialistAssistantId
      scopeText: string
      jobTypeName?: string
      mode: AssistantHandoffMode
      message: string
    }
  | { type: "clarify"; message: string }

export type AssistantParseResult = {
  action: GlobalAssistantAction
  /** 0–100; ≥80 auto-acts, 68–79 shows “Did you mean?”, below clarifies only */
  confidence: number
  alternatives?: Array<{ label: string; action: GlobalAssistantAction; confidence: number }>
  /** Top rule pattern score (≥8 skips LLM). Fast-path intents use 100. */
  ruleTopScore?: number
  routedBy?: "rules" | "llm"
}

/** Auto-run without confirmation. */
export const ASSISTANT_AUTO_CONFIDENCE = 80
/** Show optional confirm dialog. */
export const ASSISTANT_CONFIRM_MIN = 68
/** Rule engine matched strongly — do not call Phase 2 LLM. */
export const ASSISTANT_RULE_LLM_THRESHOLD = 8

export function shouldFallbackToLlm(parsed: AssistantParseResult, phrase?: string): boolean {
  if (parsed.routedBy === "llm") return false
  if ((parsed.ruleTopScore ?? 0) < ASSISTANT_RULE_LLM_THRESHOLD) return true
  const text = phrase?.trim()
  if (text && parsed.action.type === "clarify" && phraseHasWorkflowCue(text)) return true
  return false
}

export type GlobalAssistantParseContext = {
  platform?: PlatformAssistantPlatform
  /** Visible portal tab ids for this session (portal_config / API). */
  availableTabIds?: string[]
  /** User has admin role — may open admin portal from app shell. */
  isAdmin?: boolean
  /** Active portal tab (dashboard, customers, calendar, …) — biases setup wizards on this page. */
  currentPage?: string
  /** Customers tab — row/detail currently open (Phase 3). */
  selectedCustomerId?: string | null
  selectedCustomerName?: string | null
  /** Estimates tab — quote row open (specialty / variance report wizard). */
  selectedQuoteId?: string | null
  /** Admin-trained phrases from platform_settings (live). */
  customVocabulary?: AssistantCustomVocabularyEntry[]
}

export function customPayloadToGlobalAction(
  payload: AssistantCustomActionPayload,
  ctx: Pick<GlobalAssistantParseContext, "selectedCustomerId" | "selectedCustomerName" | "selectedQuoteId">,
): GlobalAssistantAction | null {
  const msg =
    payload.message?.trim() ||
    (payload.type === "navigate" && payload.page ? `Opening ${pageLabel(payload.page)}.` : "OK.")
  switch (payload.type) {
    case "navigate":
      if (!payload.page?.trim()) return null
      return { type: "navigate", page: payload.page.trim(), message: msg }
    case "open_setup_guide":
      return { type: "open_setup_guide", message: msg }
    case "open_mini_wizard":
      return { type: "open_mini_wizard", wizardId: payload.wizardId, message: msg }
    case "open_admin":
      return { type: "open_admin", panel: payload.panel, message: msg }
    case "find_customer":
      if (!payload.query?.trim()) return null
      return { type: "find_customer", query: payload.query.trim(), message: msg }
    case "open_last_missed_call":
      return { type: "open_last_missed_call", message: msg }
    case "open_current_customer":
      return { type: "open_current_customer", message: msg }
    case "create_estimate": {
      if (payload.useSelectedCustomer && ctx.selectedCustomerId) {
        return { type: "create_estimate", customerId: ctx.selectedCustomerId, message: msg }
      }
      const q = payload.customerQuery?.trim()
      if (q) return { type: "create_estimate", customerQuery: q, message: msg }
      if (ctx.selectedCustomerId) return { type: "create_estimate", customerId: ctx.selectedCustomerId, message: msg }
      return { type: "create_estimate", message: msg }
    }
    case "focus_customer_sms": {
      if (payload.useSelectedCustomer && ctx.selectedCustomerId) {
        return { type: "focus_customer_sms", customerId: ctx.selectedCustomerId, message: msg }
      }
      const q = payload.customerQuery?.trim()
      if (q) return { type: "focus_customer_sms", customerQuery: q, message: msg }
      if (ctx.selectedCustomerId) {
        return { type: "focus_customer_sms", customerId: ctx.selectedCustomerId, message: msg }
      }
      return { type: "focus_customer_sms", message: msg }
    }
    case "open_specialty_report": {
      const quoteId = payload.useSelectedQuote && ctx.selectedQuoteId ? ctx.selectedQuoteId : undefined
      return { type: "open_specialty_report", quoteId, message: msg }
    }
    case "explain":
      return { type: "explain", message: msg }
    case "handoff_specialist_assistant": {
      const scope = payload.scopeText?.trim()
      if (!scope || scope.length < 4 || !payload.specialist) return null
      return {
        type: "handoff_specialist_assistant",
        specialist: payload.specialist,
        scopeText: scope.slice(0, 2000),
        jobTypeName: payload.jobTypeName?.trim() || undefined,
        mode: payload.mode === "job_type_with_lines" ? "job_type_with_lines" : "line_items_only",
        message: msg,
      }
    }
    default:
      return null
  }
}

function scorePatterns(text: string, patterns: RegExp[]): number {
  let best = 0
  for (const p of patterns) {
    if (p.test(text)) {
      const weight = Math.min(40, Math.max(8, p.source.replace(/\\b/g, "").length))
      best = Math.max(best, weight)
    }
  }
  return best
}

type ScoredMatch =
  | { kind: "wizard"; score: number; wizardId: SetupMiniWizardId }
  | { kind: "page"; score: number; page: string; label: string }
  | { kind: "admin"; score: number; panel: AdminPanelId; label: string }

function pageLabel(page: string): string {
  return TAB_ID_LABELS[page] ?? page
}

function describeScored(s: ScoredMatch): string {
  if (s.kind === "wizard") return getSetupMiniWizardDef(s.wizardId)?.label ?? s.wizardId
  if (s.kind === "admin") return ADMIN_PANEL_LABELS[s.panel]
  return s.label
}

function tabAvailable(page: string, ctx: GlobalAssistantParseContext): boolean {
  if (!ctx.availableTabIds?.length) return true
  return ctx.availableTabIds.includes(page)
}

function isExplainPhrase(text: string): boolean {
  return (
    /\b(what\s+(?:is|does)\s+this|help\s+(?:me\s+)?(?:here|with\s+this)|explain\s+(?:this|where\s+i\s+am)|how\s+do\s+i\s+use\s+this)\b/i.test(
      text,
    ) || /\bwhere\s+am\s+i\b/i.test(text)
  )
}

function scoreToConfidence(ruleScore: number): number {
  return Math.min(100, Math.round(ruleScore * 2.75))
}

function scoredToAction(top: ScoredMatch, text: string, ctx: GlobalAssistantParseContext): GlobalAssistantAction | null {
  if (top.kind === "wizard") {
    const def = getSetupMiniWizardDef(top.wizardId)
    if (def && !tabAvailable(def.page, ctx)) {
      return {
        type: "clarify",
        message: `“${def.label}” lives under ${pageLabel(def.page)}, but that tab is not enabled on your portal. Ask your admin or open Setup Guide.`,
      }
    }
    return {
      type: "open_mini_wizard",
      wizardId: top.wizardId,
      message: def
        ? `Opening ${def.label} on ${pageLabel(def.page)}. ${def.locationHint}`
        : `Opening the ${top.wizardId.replace(/_/g, " ")} setup wizard.`,
    }
  }
  if (top.kind === "admin") {
    return {
      type: "open_admin",
      panel: top.panel,
      message: `Opening admin — ${ADMIN_PANEL_LABELS[top.panel]}.`,
    }
  }
  if (top.kind === "page") {
    if (!tabAvailable(top.page, ctx)) {
      const alt = ctx.availableTabIds?.[0]
      return {
        type: "clarify",
        message: alt
          ? `The “${top.label}” tab is not on your portal menu. Try “${pageLabel(alt)}” or ask your admin to enable ${top.label}.`
          : `The “${top.label}” tab is not enabled for your account.`,
      }
    }
    if (/\bschedul/i.test(text) && /\b(problem|issue|help|confus|wrong)\b/i.test(text)) {
      return {
        type: "navigate",
        page: "calendar",
        message: "Opening Scheduling. Try “scheduling alerts” or “receipt template” for a guided setup.",
      }
    }
    return {
      type: "navigate",
      page: top.page,
      message: `Opening ${pageLabel(top.page)}.`,
    }
  }
  return null
}

export function parseAssistantCommand(raw: string, ctx: GlobalAssistantParseContext = {}): AssistantParseResult {
  const text = normalizeAssistantPhrase(raw)
  const platform = ctx.platform ?? "user"

  if (!text) {
    return {
      confidence: 0,
      ruleTopScore: 0,
      routedBy: "rules",
      action: {
        type: "clarify",
        message: `Tell me what you would like to do — for example “${suggestPhrasesForPlatform(platform, 3).join('”, “')}”.`,
      },
    }
  }

  const customPayload = matchCustomVocabularyEntry(text, ctx.customVocabulary ?? [], ctx)
  if (customPayload) {
    const customAction = customPayloadToGlobalAction(customPayload, ctx)
    if (customAction) {
      return {
        confidence: 97,
        ruleTopScore: 100,
        routedBy: "rules",
        action: customAction,
      }
    }
  }

  const lineItemsHandoff = parseEstimateLineItemsHandoffIntent(text)
  if (lineItemsHandoff) {
    const baseHandoff = {
      type: "handoff_specialist_assistant" as const,
      specialist: "estimate_line_items_library" as const,
      scopeText: lineItemsHandoff.scopeText,
      jobTypeName: lineItemsHandoff.jobTypeName,
    }
    if (lineItemsHandoff.needsClarification) {
      return {
        confidence: 74,
        ruleTopScore: 100,
        routedBy: "rules",
        action: {
          type: "clarify",
          message:
            "I can build saved line items from your description. Do you want a job type bundled with those lines, or line items only for now?",
        },
        alternatives: [
          {
            label: "Job type + line items together",
            action: {
              ...baseHandoff,
              mode: "job_type_with_lines",
              message: `Opening line items assistant for ${lineItemsHandoff.jobTypeName ?? "your job type"}…`,
            },
            confidence: 88,
          },
          {
            label: "Line items only (job type later)",
            action: {
              ...baseHandoff,
              mode: "line_items_only",
              message: "Opening line items assistant with your scope…",
            },
            confidence: 86,
          },
          {
            label: "Open estimate line items (no AI yet)",
            action: {
              type: "open_mini_wizard",
              wizardId: "estimates_line_items",
              message: "Opening Estimates — line item setup wizard.",
            },
            confidence: 70,
          },
        ],
      }
    }
    const mode: AssistantHandoffMode = lineItemsHandoff.jobTypeName ? "job_type_with_lines" : "line_items_only"
    return {
      confidence: 92,
      ruleTopScore: 100,
      routedBy: "rules",
      action: {
        ...baseHandoff,
        mode,
        message: `Handing off to the line items assistant on Estimates…`,
      },
    }
  }

  if (/\b(job\s*types?)\b/i.test(text) && /\b(create|build|add|new)\b/i.test(text) && !isCreateEstimatePhrase(text)) {
    return {
      confidence: 86,
      ruleTopScore: 100,
      routedBy: "rules",
      action: {
        type: "handoff_specialist_assistant",
        specialist: "estimate_job_types_library",
        scopeText: text,
        mode: "line_items_only",
        message: "Opening job types on Estimates…",
      },
    }
  }

  if (isExplainPhrase(text)) {
    return {
      confidence: 88,
      ruleTopScore: 100,
      routedBy: "rules",
      action: { type: "explain", message: buildAssistantExplainMessage(ctx, text) },
    }
  }

  if (isFocusSmsPhrase(text)) {
    const target = resolveCustomerTargetFromPhrase(text, ctx)
    if (target.customerId || target.customerQuery) {
      const label = target.customerId ? ctx.selectedCustomerName ?? "customer" : target.customerQuery ?? "customer"
      return {
        confidence: 88,
        ruleTopScore: 100,
        routedBy: "rules",
        action: {
          type: "focus_customer_sms",
          customerId: target.customerId,
          customerQuery: target.customerQuery,
          message: `Opening ${label} for SMS.`,
        },
      }
    }
  }

  if (isOpenSpecialtyReportPhrase(text)) {
    if (tabAvailable("quotes", ctx)) {
      const qid = ctx.selectedQuoteId?.trim()
      return {
        confidence: qid ? 94 : 86,
        ruleTopScore: 100,
        routedBy: "rules",
        action: {
          type: "open_specialty_report",
          quoteId: qid || undefined,
          message: qid
            ? "Opening specialty report for this estimate."
            : "Opening Estimates — select an estimate, then say start report again or tap Start report.",
        },
      }
    }
  }

  if (isCreateEstimatePhrase(text)) {
    const target = resolveCustomerTargetFromPhrase(text, ctx)
    if (target.customerId || target.customerQuery) {
      const label = target.customerId ? ctx.selectedCustomerName ?? "customer" : target.customerQuery ?? "customer"
      return {
        confidence: 92,
        ruleTopScore: 100,
        routedBy: "rules",
        action: {
          type: "create_estimate",
          customerId: target.customerId,
          customerQuery: target.customerQuery,
          message: `Starting estimate for ${label}.`,
        },
      }
    }
    if (tabAvailable("quotes", ctx)) {
      return {
        confidence: 82,
        ruleTopScore: 100,
        routedBy: "rules",
        action: {
          type: "navigate",
          page: "quotes",
          message: "Opening Estimates. Say a customer name or open their record on Customers first.",
        },
      }
    }
  }

  if (isOpenSelectedCustomerOnlyPhrase(text) && ctx.selectedCustomerId) {
    const name = ctx.selectedCustomerName?.trim() || "this customer"
    return {
      confidence: 90,
      ruleTopScore: 100,
      routedBy: "rules",
      action: {
        type: "open_current_customer",
        message: `Opening ${name} on Customers.`,
      },
    }
  }

  if (isMissedCallAssistantPhrase(text)) {
    return {
      confidence: 90,
      ruleTopScore: 100,
      routedBy: "rules",
      action: {
        type: "open_last_missed_call",
        message: "Looking up your most recent missed call…",
      },
    }
  }

  const customerQ = extractCustomerSearchQuery(text)
  if (
    customerQ &&
    !isCreateEstimatePhrase(text) &&
    !isFocusSmsPhrase(text) &&
    (/\b(open|find|show|view|go\s+to|pull\s+up|customer|client)\b/i.test(text) || customerQ.length >= 3)
  ) {
    return {
      confidence: 86,
      ruleTopScore: 100,
      routedBy: "rules",
      action: { type: "find_customer", query: customerQ, message: `Looking up customer “${customerQ}”…` },
    }
  }

  if (/\bsetup\s+guide\b/i.test(text) || /\binitial\s+setup\b/i.test(text) || /\bget\s+started\b/i.test(text)) {
    return {
      confidence: 95,
      ruleTopScore: 100,
      routedBy: "rules",
      action: { type: "open_setup_guide", message: "Opening the Setup Guide." },
    }
  }

  const scored: ScoredMatch[] = []

  const currentPage = ctx.currentPage?.trim() || ""

  for (const row of PLATFORM_WIZARD_INTENTS) {
    const s = scorePatterns(text, row.patterns)
    if (s > 0) {
      const def = getSetupMiniWizardDef(row.wizardId)
      const onCurrentTab = Boolean(currentPage && def?.page === currentPage)
      scored.push({ kind: "wizard", score: s + 5 + (onCurrentTab ? 10 : 0), wizardId: row.wizardId })
    }
  }

  for (const row of PLATFORM_PAGE_INTENTS) {
    if (!row.platforms.includes(platform) && platform !== "admin") continue
    let s = scorePatterns(text, row.patterns)
    if (s > 0 && row.page === "quotes" && isCreateEstimatePhrase(text)) s = Math.max(0, s - 12)
    if (s > 0) scored.push({ kind: "page", score: s, page: row.page, label: row.label })
  }

  if (ctx.isAdmin) {
    for (const row of PLATFORM_ADMIN_INTENTS) {
      const s = scorePatterns(text, row.patterns)
      if (s > 0) scored.push({ kind: "admin", score: s + 3, panel: row.panel, label: row.label })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]
  const second = scored[1]

  if (top && top.score >= 8) {
    const primary = scoredToAction(top, text, ctx)
    if (!primary) {
      return {
        confidence: 0,
        ruleTopScore: top.score,
        routedBy: "rules",
        action: { type: "clarify", message: "Could not route that request." },
      }
    }
    if (primary.type === "clarify") {
      return { confidence: 40, ruleTopScore: top.score, routedBy: "rules", action: primary }
    }

    const confidence = scoreToConfidence(top.score)
    const alternatives: AssistantParseResult["alternatives"] = []

    if (second && second.score >= top.score - 3) {
      const altAction = scoredToAction(second, text, ctx)
      if (altAction && altAction.type !== "clarify" && altAction.type !== primary.type) {
        alternatives.push({
          label: describeScored(second),
          action: altAction,
          confidence: scoreToConfidence(second.score),
        })
      }
    }

    if (alternatives.length > 0 && confidence < ASSISTANT_AUTO_CONFIDENCE) {
      return {
        confidence,
        ruleTopScore: top.score,
        routedBy: "rules",
        action: primary,
        alternatives: [{ label: describeScored(top), action: primary, confidence }, ...alternatives].slice(0, 3),
      }
    }

    return {
      confidence,
      ruleTopScore: top.score,
      routedBy: "rules",
      action: primary,
      alternatives: alternatives.length ? alternatives : undefined,
    }
  }

  if (/\bschedul/i.test(text) && /\b(problem|issue|help|confus|wrong)\b/i.test(text)) {
    return {
      confidence: 78,
      ruleTopScore: 28,
      routedBy: "rules",
      action: {
        type: "navigate",
        page: "calendar",
        message: "Opening Scheduling. Try “scheduling alerts” or “receipt template” for a guided setup.",
      },
    }
  }

  const hints = suggestPhrasesForPlatform(platform, 6).map((p) => `“${p}”`).join(", ")
  logAssistantMiss(text, platform)
  const here =
    currentPage && tabAvailable(currentPage, ctx)
      ? ` You are on ${pageLabel(currentPage)} — try a setting on this tab or say “setup guide”.`
      : ""
  return {
    confidence: 0,
    ruleTopScore: top?.score ?? 0,
    routedBy: "rules",
    action: {
      type: "clarify",
      message: `I did not match that yet. Try ${hints}, or “setup guide”.${here}`,
    },
  }
}

/** @deprecated Prefer parseAssistantCommand for confidence; returns action only. */
export function parseGlobalAssistantCommand(raw: string, ctx: GlobalAssistantParseContext = {}): GlobalAssistantAction {
  return parseAssistantCommand(raw, ctx).action
}

const ASSISTANT_MISS_LOG_KEY = "tradesman_assistant_miss_log"

/** Dev aid: recent phrases that did not match (user can paste from Application → Session Storage). */
function logAssistantMiss(phrase: string, platform: PlatformAssistantPlatform): void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return
  try {
    const raw = sessionStorage.getItem(ASSISTANT_MISS_LOG_KEY)
    const list: Array<{ phrase: string; platform: string; at: string }> = raw ? JSON.parse(raw) : []
    list.unshift({ phrase, platform, at: new Date().toISOString() })
    sessionStorage.setItem(ASSISTANT_MISS_LOG_KEY, JSON.stringify(list.slice(0, 40)))
  } catch {
    /* ignore */
  }
}

/** For Phase 2 API — full catalog of what the assistant may do in this session. */
export function buildAssistantRoutingCatalog(ctx: GlobalAssistantParseContext): string {
  const base = buildPlatformAssistantCatalogText({
    platform: ctx.platform ?? "user",
    availableTabIds: ctx.availableTabIds,
    isAdmin: ctx.isAdmin,
    currentPage: ctx.currentPage,
    selectedCustomerId: ctx.selectedCustomerId,
    selectedCustomerName: ctx.selectedCustomerName,
    selectedQuoteId: ctx.selectedQuoteId,
  })
  const custom = buildCustomVocabularyCatalogSection(ctx.customVocabulary ?? [])
  const domain = buildPlatformAssistantDomainTraining(ctx)
  const specialists = buildAssistantSpecialistsCatalogSection()
  return [base, custom, specialists, domain].filter(Boolean).join("\n\n")
}

export { ASSISTANT_ADMIN_PANEL_STORAGE_KEY }
