/** Minimal copy of hosted website metadata parsing for the admin app shell. */

export type HostedWebsiteDoc = {
  v: 1
  hosting: "tradesman" | "external" | "none"
  publicUrl: string
  siteSlug: string
  customDomain: string
}

export function parseHostedWebsiteDoc(metadata: unknown): HostedWebsiteDoc {
  const empty: HostedWebsiteDoc = { v: 1, hosting: "none", publicUrl: "", siteSlug: "", customDomain: "" }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return empty
  const raw = (metadata as Record<string, unknown>).hosted_website_v1
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty
  const o = raw as Record<string, unknown>
  const hosting =
    o.hosting === "tradesman" || o.hosting === "external" || o.hosting === "none" ? o.hosting : "none"
  return {
    v: 1,
    hosting,
    publicUrl: typeof o.publicUrl === "string" ? o.publicUrl.trim() : "",
    siteSlug: typeof o.siteSlug === "string" ? o.siteSlug.trim().toLowerCase() : "",
    customDomain: typeof o.customDomain === "string" ? o.customDomain.trim().toLowerCase() : "",
  }
}
