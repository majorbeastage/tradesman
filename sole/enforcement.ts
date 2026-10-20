import { createHash } from "crypto"
import {
  SOLE_BUSINESS_REQUIRED_SLUGS,
  SOLE_LEGAL_VERSION,
  SOLE_SPEND_REQUIRED_SLUGS,
  soleLegalDocument,
  type SoleLegalDocument,
} from "./documents.js"

export type AcceptanceRef = {
  documentSlug: string
  documentVersion: string
}

export type SpendAuthorization = {
  platforms: string[]
  budgetCents: number
  cadence: "one_time" | "weekly" | "monthly"
  automationMode: "manual" | "advisory" | "automatic"
  status: string
}

const PII_KEY = /(^|_)(email|e-mail|phone|mobile|name|firstname|lastname|address|street|city|notes|customer)($|_)/i

export function documentContentHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex")
}

export function publishedDocumentHash(doc: SoleLegalDocument): string {
  return documentContentHash(`${doc.slug}\n${doc.version}\n${doc.body}`)
}

/** Months with no eligible managed spend owe no SOLE wholesale fee. Otherwise 3% or $15, whichever is greater. */
export function soleWholesaleFeeCents(eligibleSpendCents: number): number {
  if (!Number.isFinite(eligibleSpendCents) || eligibleSpendCents <= 0) return 0
  const threePercent = Math.round(eligibleSpendCents * 0.03)
  return Math.max(1500, threePercent)
}

export function missingAcceptances(accepted: AcceptanceRef[], requiredSlugs: string[], version = SOLE_LEGAL_VERSION): string[] {
  const have = new Set(
    accepted
      .filter((row) => row.documentVersion === version)
      .map((row) => row.documentSlug),
  )
  return [...new Set(requiredSlugs)].filter((slug) => !have.has(slug))
}

export function businessActivationGaps(accepted: AcceptanceRef[]): string[] {
  return missingAcceptances(accepted, SOLE_BUSINESS_REQUIRED_SLUGS)
}

export function spendPermissionGaps(accepted: AcceptanceRef[], authorization: SpendAuthorization | null): string[] {
  const gaps = missingAcceptances(accepted, [...SOLE_BUSINESS_REQUIRED_SLUGS, ...SOLE_SPEND_REQUIRED_SLUGS])
  if (!authorization) gaps.push("spending-authorization")
  else {
    if (authorization.status === "recorded_not_charged") {
      /* A recorded authorization is not a collected payment and cannot launch ads by itself. */
    }
    if (!authorization.platforms.length) gaps.push("advertising-platforms")
    if (!Number.isFinite(authorization.budgetCents) || authorization.budgetCents <= 0) gaps.push("budget")
    if (authorization.automationMode === "automatic") gaps.push("automatic-mode-not-separately-enabled")
  }
  return gaps
}

export function collectForbiddenPiiPaths(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return []
  const found: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key
    if (PII_KEY.test(key)) found.push(here)
    else found.push(...collectForbiddenPiiPaths(child, here))
  }
  return found
}

export function assertAttributionPayload(payload: Record<string, unknown>): void {
  const forbidden = collectForbiddenPiiPaths(payload)
  if (forbidden.length) {
    throw new Error(`Attribution events cannot include customer identity fields: ${forbidden.join(", ")}`)
  }
}

export function hashesForAcceptance(slugs: string[]): { slug: string; version: string; contentHash: string }[] {
  return slugs.map((slug) => {
    const document = soleLegalDocument(slug)
    if (!document) throw new Error(`Unknown SOLE legal document: ${slug}`)
    return { slug, version: document.version, contentHash: publishedDocumentHash(document) }
  })
}
