/**
 * Tradesman-hosted customer websites (Growth tab) — separate from the legacy
 * in-app business public profile at /{slug}. Stores site URL, DNS, and editor handoff.
 */

export const HOSTED_WEBSITE_META_KEY = "hosted_website_v1"

export type HostedWebsiteHosting = "tradesman" | "external" | "none"

export type HostedWebsiteDoc = {
  v: 1
  /** Where the client's primary marketing site lives. */
  hosting: HostedWebsiteHosting
  /** Public URL customers see (custom domain or Tradesman sites URL). */
  publicUrl: string
  /** Path slug on the Tradesman sites Vercel deployment. */
  siteSlug: string
  /** Optional custom domain (client CNAME/A → Vercel). */
  customDomain: string
  updatedAt?: string
}

export function emptyHostedWebsiteDoc(): HostedWebsiteDoc {
  return {
    v: 1,
    hosting: "none",
    publicUrl: "",
    siteSlug: "",
    customDomain: "",
  }
}

export function parseHostedWebsiteDoc(metadata: unknown): HostedWebsiteDoc {
  const base = emptyHostedWebsiteDoc()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>)[HOSTED_WEBSITE_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const hosting =
    o.hosting === "tradesman" || o.hosting === "external" || o.hosting === "none" ? o.hosting : "none"
  return {
    v: 1,
    hosting,
    publicUrl: typeof o.publicUrl === "string" ? o.publicUrl.trim() : "",
    siteSlug: typeof o.siteSlug === "string" ? normalizeSiteSlug(o.siteSlug) : "",
    customDomain: typeof o.customDomain === "string" ? normalizeDomain(o.customDomain) : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  }
}

export function mergeHostedWebsiteMetadata(
  prevMetadata: unknown,
  patch: Partial<HostedWebsiteDoc>,
): Record<string, unknown> {
  const base =
    prevMetadata && typeof prevMetadata === "object" && !Array.isArray(prevMetadata)
      ? { ...(prevMetadata as Record<string, unknown>) }
      : {}
  const prev = parseHostedWebsiteDoc(base)
  const next: HostedWebsiteDoc = {
    ...prev,
    ...patch,
    v: 1,
    siteSlug: patch.siteSlug != null ? normalizeSiteSlug(patch.siteSlug) : prev.siteSlug,
    customDomain: patch.customDomain != null ? normalizeDomain(patch.customDomain) : prev.customDomain,
    publicUrl: patch.publicUrl != null ? patch.publicUrl.trim() : prev.publicUrl,
    updatedAt: new Date().toISOString(),
  }
  if (next.hosting === "tradesman") {
    next.publicUrl = resolveTradesmanPublicSiteUrl(next) || next.publicUrl
  }
  base[HOSTED_WEBSITE_META_KEY] = next
  return base
}

export function normalizeSiteSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
}

/** Origin for the public sites Vercel project (customer-facing pages). */
export function hostedWebsiteSitesOrigin(): string {
  const configured =
    (typeof import.meta !== "undefined" &&
      typeof import.meta.env?.VITE_HOSTED_WEBSITE_SITES_ORIGIN === "string" &&
      import.meta.env.VITE_HOSTED_WEBSITE_SITES_ORIGIN.trim()) ||
    ""
  return configured.replace(/\/+$/, "") || "https://sites.tradesman-us.com"
}

/** Origin for the website editor admin app (separate Vercel deploy). */
export function hostedWebsiteAdminOrigin(): string {
  const configured =
    (typeof import.meta !== "undefined" &&
      typeof import.meta.env?.VITE_HOSTED_WEBSITE_ADMIN_ORIGIN === "string" &&
      import.meta.env.VITE_HOSTED_WEBSITE_ADMIN_ORIGIN.trim()) ||
    ""
  return configured.replace(/\/+$/, "") || "https://sites-admin.tradesman-us.com"
}

export function tradesmanSiteUrlForSlug(siteSlug: string): string {
  const slug = normalizeSiteSlug(siteSlug)
  if (!slug) return ""
  const origin = hostedWebsiteSitesOrigin()
  return `${origin}/${encodeURIComponent(slug)}`
}

export function resolveTradesmanPublicSiteUrl(doc: HostedWebsiteDoc): string {
  const custom = doc.customDomain.trim()
  if (custom) return `https://${custom}`
  return tradesmanSiteUrlForSlug(doc.siteSlug)
}

export const VERCEL_DNS_INSTRUCTIONS = {
  apexA: "76.76.21.21",
  wwwCname: "cname.vercel-dns.com",
  note: "In your domain registrar, point your domain to Vercel. Propagation can take up to 48 hours.",
} as const
