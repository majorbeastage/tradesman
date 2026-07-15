import { theme } from "../styles/theme"

/**
 * Shown in place of real email/SMS/call content while an admin or manager is
 * previewing another profile ("Viewing as"). Communications stay private even
 * in Edit mode.
 */
export default function PortalViewCommsHiddenNotice({ label = "communications" }: { label?: string }) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 12,
        border: `1px dashed ${theme.border}`,
        background: "#f8fafc",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
        Private {label} are hidden
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
        You are viewing another user&apos;s profile. Their actual emails, text messages, and phone
        calls with customers stay private and are not shown here — even with Edit mode on.
        Everything else in their account is visible.
      </p>
    </div>
  )
}
