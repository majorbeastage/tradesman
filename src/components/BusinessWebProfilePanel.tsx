import type { CSSProperties } from "react"
import { useAppNavigationOptional } from "../contexts/AppNavigationContext"
import { openHostedWebsiteEditor } from "../lib/accountNavigation"
import { businessWebProfilePublicUrl, businessWebProfileSlugFromName } from "../lib/businessPublicProfile"
import { theme } from "../styles/theme"

type Props = {
  businessNameForSlug: string
  /** Optional published slug from profiles.business_web_profile_slug */
  publishedSlug?: string | null
}

const card: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  display: "grid",
  gap: 12,
}

/**
 * Account fold launcher — editing lives in the Website Builder portal tab.
 */
export function BusinessWebProfilePanel({ businessNameForSlug, publishedSlug }: Props) {
  const nav = useAppNavigationOptional()
  const slug =
    (typeof publishedSlug === "string" && publishedSlug.trim()
      ? publishedSlug.trim().toLowerCase()
      : businessWebProfileSlugFromName(businessNameForSlug)) || ""
  const publicUrl = slug
    ? businessWebProfilePublicUrl(slug, typeof window !== "undefined" ? window.location.origin : undefined)
    : ""

  return (
    <div style={card}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 6 }}>Website Builder</div>
        <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Hosted marketing sites now live under the <strong>Website</strong> sidebar tab. Pick the Classic
          template, change logo, colors, photos, and words. Contact Us uses this account’s phone, email, and address.
        </p>
      </div>
      {publicUrl ? (
        <div style={{ fontSize: 12, color: "#0f766e", fontWeight: 700, wordBreak: "break-all" }}>{publicUrl}</div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={() => openHostedWebsiteEditor((page) => nav?.navigatePage(page))}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Open Website Builder
        </button>
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              color: theme.text,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            View live site
          </a>
        ) : null}
      </div>
    </div>
  )
}
