import { useState, useEffect, useRef } from "react"
import { useAuth } from "../../contexts/AuthContext"
import type { UserRole } from "../../contexts/AuthContext"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "../../constants/helpDesk"
import { techSupportMailtoDeactivatedAccount, TRADESMAN_TECH_SUPPORT_EMAIL } from "../../constants/supportLinks"
import { supabase } from "../../lib/supabase"
import { getPasswordRecoveryRedirectTo } from "../../lib/authRedirectBase"
import { readSandboxLoginEmail, clearSandboxLoginEmail } from "../../lib/sandboxLogin"
import { repairSandboxProfile } from "../../lib/sandboxApi"
import { useLocale } from "../../i18n/LocaleContext"
import { PasswordFieldWithReveal } from "../../components/PasswordFieldWithReveal"
import { PublicLegalNav } from "../public/PublicLegalNav"

type LoginPageProps = {
  /** When true, admin portal sign-in (separate from contractor login). */
  isAdminLogin?: boolean
  onSuccess: (role: UserRole) => void
  onBack: () => void
  onGoToSignup: () => void
}

export default function LoginPage({ isAdminLogin = false, onSuccess, onBack, onGoToSignup }: LoginPageProps) {
  const { t } = useLocale()
  const { signIn, user, role, refetchProfile, accountAccessBlocked, accessBlockedMessage, clearAccessBlockedReason } = useAuth()
  const [mode, setMode] = useState<"signin" | "forgot">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sandboxLoginHint, setSandboxLoginHint] = useState(false)

  useEffect(() => {
    const pref = readSandboxLoginEmail()
    if (pref) {
      setEmail(pref)
      setSandboxLoginHint(true)
    }
  }, [])

  const didRedirect = useRef(false)
  useEffect(() => {
    if (sandboxLoginHint || !user || !role || didRedirect.current) return
    didRedirect.current = true
    onSuccess(role)
  }, [user, role, onSuccess, sandboxLoginHint])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!email.trim()) {
      setError(t("login.err.emailRequired"))
      return
    }
    if (mode === "forgot") {
      if (!supabase) {
        setError(t("login.err.noSupabase"))
        return
      }
      setSubmitting(true)
      try {
        const redirectTo = getPasswordRecoveryRedirectTo() || undefined
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), redirectTo ? { redirectTo } : undefined)
        if (err) setError(err.message)
        else setMessage(t("login.msg.resetSent"))
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (!password) {
      setError(t("login.err.passwordRequired"))
      return
    }
    setSubmitting(true)
    try {
      const { error: err } = await signIn(email.trim(), password)
      if (err) setError(err.message)
      else {
        clearSandboxLoginEmail()
        setSandboxLoginHint(false)
        setMessage(t("login.msg.signingIn"))
        try {
          await repairSandboxProfile()
        } catch {
          /* best effort */
        }
        const { role: freshRole } = await refetchProfile()
        if (freshRole) {
          didRedirect.current = true
          onSuccess(freshRole)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const formStyle: React.CSSProperties = {
    maxWidth: 360,
    margin: "0 auto",
    padding: 24,
    background: "white",
    borderRadius: 8,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  }
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    marginTop: 4,
    marginBottom: 16,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
  }
  const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: 14, color: theme.text }

  const isAdminPortalLogin = isAdminLogin

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.background }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: theme.primary, marginBottom: 16 }}
        >
          {t("login.backHome")}
        </button>
        {!isAdminPortalLogin && (
          <div
            style={{
              textAlign: "center",
              marginBottom: 14,
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "0.07em",
              color: theme.charcoal,
            }}
          >
            TRADESMAN
          </div>
        )}
        <h1 style={{ margin: "0 0 8px", color: theme.text, fontSize: 22 }}>
          {isAdminPortalLogin
            ? t("login.title.admin")
            : mode === "forgot"
              ? t("login.title.forgot")
              : t("login.title.signin")}
        </h1>
        <p style={{ margin: "0 0 20px", color: theme.text, fontSize: 14, opacity: 0.8 }}>
          {isAdminPortalLogin
            ? t("login.sub.admin")
            : mode === "forgot"
              ? t("login.sub.forgot")
              : t("login.sub.signin")}
        </p>

        {accountAccessBlocked && (
          <div
            role="alert"
            style={{
              margin: "0 0 16px",
              padding: "14px 16px",
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.55,
              color: "#991b1b",
              background: "rgba(185, 28, 28, 0.08)",
              border: "1px solid rgba(185, 28, 28, 0.25)",
            }}
          >
            {accessBlockedMessage ? (
              <p style={{ margin: 0, fontWeight: 600 }}>{accessBlockedMessage}</p>
            ) : (
              <>
                <p style={{ margin: "0 0 10px", fontWeight: 600 }}>{t("login.deactivatedTitle")}</p>
                <p style={{ margin: "0 0 8px", color: "#7f1d1d" }}>
                  <a href={techSupportMailtoDeactivatedAccount()} style={{ color: theme.primary, fontWeight: 600 }}>
                    {t("login.emailTech")}
                  </a>
                  <span style={{ opacity: 0.85 }}> ({TRADESMAN_TECH_SUPPORT_EMAIL})</span>
                </p>
                <p style={{ margin: 0, color: "#7f1d1d" }}>
                  {t("login.helpDeskLabel")}{" "}
                  <a href={`tel:${HELP_DESK_PHONE_E164}`} style={{ color: theme.primary, fontWeight: 600 }}>
                    {HELP_DESK_PHONE_DISPLAY}
                  </a>
                </p>
              </>
            )}
          </div>
        )}

        {sandboxLoginHint && mode === "signin" ? (
          <div
            style={{
              margin: "0 0 16px",
              padding: "12px 14px",
              borderRadius: 8,
              background: "#e0f2fe",
              border: "1px solid #7dd3fc",
              color: "#0c4a6e",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Training sandbox login.</strong> Enter the temporary password from the sandbox screen (or your email).
            This is a separate practice account — not your regular Tradesman login.
          </div>
        ) : null}

        <label style={labelStyle}>
          {t("login.email")}
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              clearAccessBlockedReason()
            }}
            autoComplete="email"
            style={inputStyle}
            placeholder={t("login.emailPlaceholder")}
          />
        </label>
        {mode !== "forgot" && (
          <PasswordFieldWithReveal
            label={t("login.password")}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="••••••••"
            revealLabelShow={t("login.showPassword")}
            revealLabelHide={t("login.hidePassword")}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
            name="password"
          />
        )}
        {error && <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
        {message && <p style={{ color: "#059669", fontSize: 14, margin: "0 0 12px" }}>{message}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "12px",
            background: theme.primary,
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting
            ? t("login.submit.wait")
            : mode === "forgot"
              ? t("login.submit.reset")
              : t("login.submit.signin")}
        </button>
        {!isAdminPortalLogin && mode === "signin" && (
          <p style={{ marginTop: 12, fontSize: 14, color: theme.text }}>
            <button
              type="button"
              onClick={() => { setMode("forgot"); setError(""); setMessage("") }}
              style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600, padding: 0 }}
            >
              {t("login.forgotLink")}
            </button>
          </p>
        )}
        {!isAdminPortalLogin && (
          <p style={{ marginTop: 16, fontSize: 14, color: theme.text }}>
            {mode === "forgot" ? (
              <button type="button" onClick={() => { setMode("signin"); setError(""); setMessage("") }} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                {t("login.backSignIn")}
              </button>
            ) : (
              <>
                {t("login.noAccount")}{" "}
                <button type="button" onClick={onGoToSignup} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                  {t("login.signUpCta")}
                </button>
              </>
            )}
          </p>
        )}
      </form>
      </div>
      <div style={{ maxWidth: 420, margin: "0 auto", width: "100%", padding: "0 20px 8px", boxSizing: "border-box" }}>
        <PublicLegalNav borderTop={false} />
      </div>
      <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 20 }} />
    </div>
  )
}
