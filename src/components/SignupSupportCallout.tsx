import { theme } from "../styles/theme"
import {
  SIGNUP_SUPPORT_PHONE_DISPLAY,
  signupSupportLineConfigured,
  signupSupportTelHref,
} from "../constants/signupSupportLine"

type Props = {
  /** Tighter layout for narrow panels (e.g. email confirmation screen). */
  compact?: boolean
}

/** Signup onboarding phone support callout. Hidden until a dialable line is configured. */
export default function SignupSupportCallout({ compact }: Props) {
  if (!signupSupportLineConfigured()) return null

  return (
    <div
      style={{
        marginTop: compact ? 20 : 24,
        marginBottom: 0,
        padding: compact ? "12px 14px" : "14px 16px",
        borderRadius: 12,
        border: `1px solid rgba(14, 165, 233, 0.35)`,
        background: "linear-gradient(175deg, #f0f9ff 0%, #e0f2fe 100%)",
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: compact ? 14 : 15, fontWeight: 800, color: theme.text }}>
        Prefer to talk with someone?
      </p>
      <p style={{ margin: "0 0 12px", fontSize: compact ? 13 : 14, color: theme.text, lineHeight: 1.55 }}>
        Call our support line directly — onboarding help before and during signup.
      </p>
      <a
        href={signupSupportTelHref()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 10,
          background: theme.primary,
          color: "#fff",
          fontWeight: 800,
          fontSize: compact ? 14 : 15,
          textDecoration: "none",
          boxShadow: "0 4px 14px rgba(249, 115, 22, 0.25)",
        }}
      >
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
          📞
        </span>
        Call {SIGNUP_SUPPORT_PHONE_DISPLAY}
      </a>
    </div>
  )
}
