import { theme } from "../styles/theme"

export type AttachmentStripItem = {
  id: string
  public_url: string
  file_name?: string | null
  content_type?: string | null
}

function isProbablyImage(ct: string | null | undefined, url: string): boolean {
  const t = (ct || "").toLowerCase()
  if (t.startsWith("image/")) return true
  const u = url.toLowerCase()
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(u)
}

export default function AttachmentStrip({ items, compact }: { items: AttachmentStripItem[]; compact?: boolean }) {
  if (!items?.length) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 10, marginTop: compact ? 6 : 10 }}>
      {items.map((a) => {
        const label = (a.file_name || "Download").replace(/\s+/g, " ").trim()
        const img = isProbablyImage(a.content_type, a.public_url)
        return (
          <div
            key={a.id}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: img ? 4 : "8px 10px",
              background: "#fff",
              maxWidth: compact ? 140 : 200,
            }}
          >
            {img ? (
              <a href={a.public_url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                <img
                  src={a.public_url}
                  alt={label}
                  style={{ maxWidth: "100%", maxHeight: compact ? 100 : 140, display: "block", borderRadius: 4 }}
                />
                <span style={{ fontSize: 11, color: "#6b7280", display: "block", marginTop: 4, wordBreak: "break-all" }}>{label}</span>
              </a>
            ) : (
              <a
                href={a.public_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: theme.primary, fontWeight: 600, wordBreak: "break-all" }}
              >
                {label}
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
