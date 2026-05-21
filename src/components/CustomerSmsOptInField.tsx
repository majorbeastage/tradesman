import { theme } from "../styles/theme"
import { customerSmsConsentCheckboxLabel } from "../lib/customerSmsConsent"
import { LEGAL_LINKS } from "../lib/legalLinks"

type Props = {
  businessName: string
  checked: boolean
  onChange: (checked: boolean) => void
  required?: boolean
  disabled?: boolean
  /** Optional short note below checkbox (e.g. consent source). */
  footnote?: string
}

export default function CustomerSmsOptInField({
  businessName,
  checked,
  onChange,
  required = false,
  disabled = false,
  footnote,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : ""
  const label = customerSmsConsentCheckboxLabel(businessName)

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          fontSize: 13,
          lineHeight: 1.55,
          color: "#334155",
          cursor: disabled ? "default" : "pointer",
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${checked ? theme.primary : theme.border}`,
          background: checked ? "#fff7ed" : "#f8fafc",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required={required}
          disabled={disabled}
          style={{ marginTop: 4, flexShrink: 0, width: 18, height: 18 }}
        />
        <span>
          <strong style={{ display: "block", marginBottom: 6, color: "#0f172a" }}>SMS opt-in (required for texting)</strong>
          {label}{" "}
          {origin ? (
            <>
              See{" "}
              <a href={`${origin}${LEGAL_LINKS.privacy}`} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
                Privacy
              </a>
              ,{" "}
              <a href={`${origin}${LEGAL_LINKS.terms}`} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
                Terms
              </a>
              , and{" "}
              <a href={`${origin}${LEGAL_LINKS.smsConsent}`} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
                SMS terms
              </a>
              .
            </>
          ) : null}
        </span>
      </label>
      {footnote ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{footnote}</p>
      ) : null}
    </div>
  )
}
