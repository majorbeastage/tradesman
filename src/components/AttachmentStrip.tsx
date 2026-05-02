import { theme } from "../styles/theme"
import { isProbablyImageAttachment } from "../lib/communicationAttachments"

export type AttachmentStripItem = {
  id: string
  public_url: string
  file_name?: string | null
  content_type?: string | null
}

export default function AttachmentStrip({ items, compact }: { items: AttachmentStripItem[]; compact?: boolean }) {
  if (!items?.length) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 10, marginTop: compact ? 6 : 10 }}>
      {items.map((a) => {
        const label = (a.file_name || "Download").replace(/\s+/g, " ").trim()
        const img = isProbablyImageAttachment(a.content_type, a.public_url, a.file_name)
        return (
          <div
            key={a.id}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: img ? 4 : "8px 10px",
              background: "#fff",
              maxWidth: compact ? 120 : 160,
            }}
          >
            {img ? (
              <a href={a.public_url} target="_blank" rel="noopener noreferrer" title={label} style={{ display: "block" }}>
                <img
                  src={a.public_url}
                  alt={label}
                  style={{
                    width: compact ? 56 : 72,
                    height: compact ? 56 : 72,
                    objectFit: "cover",
                    display: "block",
                    borderRadius: 4,
                  }}
                />
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
