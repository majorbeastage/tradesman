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
import type { SetupMiniWizardId } from "./setupGuideWizards"
import { getSetupMiniWizardDef } from "./setupGuideWizards"
import { TAB_ID_LABELS } from "../types/portal-builder"

export type GlobalAssistantAction =
  | { type: "navigate"; page: string; message: string }
  | { type: "open_setup_guide"; message: string }
  | { type: "open_mini_wizard"; wizardId: SetupMiniWizardId; message: string }
  | { type: "open_admin"; panel: AdminPanelId; message: string }
  | { type: "clarify"; message: string }

export type GlobalAssistantParseContext = {
  platform?: PlatformAssistantPlatform
  /** Visible portal tab ids for this session (portal_config / API). */
  availableTabIds?: string[]
  /** User has admin role — may open admin portal from app shell. */
  isAdmin?: boolean
}

function normalizeCommandText(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
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

export function parseGlobalAssistantCommand(
  raw: string,
  ctx: GlobalAssistantParseContext = {},
): GlobalAssistantAction {
  const text = normalizeCommandText(raw)
  const platform = ctx.platform ?? "user"

  if (!text) {
    return {
      type: "clarify",
      message: `Tell me what you would like to do — for example “${suggestPhrasesForPlatform(platform, 3).join('”, “')}”.`,
    }
  }

  if (/\bsetup\s+guide\b/i.test(text) || /\binitial\s+setup\b/i.test(text) || /\bget\s+started\b/i.test(text)) {
    return { type: "open_setup_guide", message: "Opening the Setup Guide." }
  }

  const scored: ScoredMatch[] = []

  for (const row of PLATFORM_WIZARD_INTENTS) {
    const s = scorePatterns(text, row.patterns)
    if (s > 0) scored.push({ kind: "wizard", score: s + 5, wizardId: row.wizardId })
  }

  for (const row of PLATFORM_PAGE_INTENTS) {
    if (!row.platforms.includes(platform) && platform !== "admin") continue
    const s = scorePatterns(text, row.patterns)
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
    if (second && second.score >= top.score - 2 && top.kind !== second.kind) {
      return {
        type: "clarify",
        message: `I heard multiple matches. Try being more specific — e.g. “${describeScored(top)}” or “${describeScored(second)}”.`,
      }
    }

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
  }

  if (/\bschedul/i.test(text) && /\b(problem|issue|help|confus|wrong)\b/i.test(text)) {
    return {
      type: "navigate",
      page: "calendar",
      message: "Opening Scheduling. Try “scheduling alerts” or “receipt template” for a guided setup.",
    }
  }

  const hints = suggestPhrasesForPlatform(platform, 6).map((p) => `“${p}”`).join(", ")
  return {
    type: "clarify",
    message: `I did not match that yet. Try ${hints}, or “setup guide”.`,
  }
}

/** For Phase 2 API — full catalog of what the assistant may do in this session. */
export function buildAssistantRoutingCatalog(ctx: GlobalAssistantParseContext): string {
  return buildPlatformAssistantCatalogText({
    platform: ctx.platform ?? "user",
    availableTabIds: ctx.availableTabIds,
    isAdmin: ctx.isAdmin,
  })
}

export { ASSISTANT_ADMIN_PANEL_STORAGE_KEY }
