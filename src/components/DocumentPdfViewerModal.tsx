import { theme } from "../styles/theme"

type Props = {
  title: string
  pdfUrl: string
  preparedAtLabel?: string | null
  onClose: () => void
  onEditEstimate?: () => void
  editNotice?: string
}

export default function DocumentPdfViewerModal({
  title,
  pdfUrl,
  preparedAtLabel,
  onClose,
  onEditEstimate,
  editNotice = "Editing this estimate will remove any customer signatures and update dates to today. Your previous PDF stays archived in the customer file.",
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13000,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          height: "min(88vh, 900px)",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: theme.text }}>{title}</div>
            {preparedAtLabel ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Filed copy · {preparedAtLabel}</div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onEditEstimate ? (
              <button
                type="button"
                onClick={onEditEstimate}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Edit this estimate
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
        {onEditEstimate ? (
          <div style={{ padding: "8px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
            {editNotice}
          </div>
        ) : null}
        <iframe title={title} src={pdfUrl} style={{ flex: 1, width: "100%", border: "none", background: "#f1f5f9" }} />
      </div>
    </div>
  )
}
