import { useState, useEffect, useRef } from "react"
import { useAuth } from "../../contexts/AuthContext"
import type { UserRole } from "../../contexts/AuthContext"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "../../constants/helpDesk"
import { techSupportMailtoDeactivatedAccount, TRADESMAN_TECH_SUPPORT_EMAIL } from "../../constants/supportLinks"
import { supabase } from "../../lib/supabase"
import { getPasswordRecoveryRedirectTo } from "../../lib/authRedirectBase"
import { useLocale } from "../../i18n/LocaleContext"

type LoginType = "user" | "office_manager" | "admin"

type LoginPageProps = {
  /** Pre-selected login type (from home page). */
  loginType: LoginType
  onSuccess: (role: UserRole) => void
  onBack: () => void
}

export default function LoginPage({ loginType: initialLoginType, onSuccess, onBack }: LoginPageProps) {
  const { t } = useLocale()
  const { signIn, signUp, user, role, accountAccessBlocked, clearAccessBlockedReason } = useAuth()
  const [loginType, setLoginType] = useState<LoginType>(initialLoginType)
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const didRedirect = useRef(false)
  useEffect(() => {
    if (!user || !role || didRedirect.current) return
    didRedirect.current = true
    onSuccess(role)
  }, [user, role, onSuccess])

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
    if (mode === "signup") {
      if (password.length < 6) {
        setError(t("login.err.passwordShort"))
        return
      }
      if (password !== confirmPassword) {
        setError(t("login.err.passwordMismatch"))
        return
      }
    }
    setSubmitting(true)
    try {
      if (mode === "signin") {
        const { error: err } = await signIn(email.trim(), password)
        if (err) setError(err.message)
        else setMessage(t("login.msg.signingIn"))
      } else {
        const { error: err } = await signUp(email.trim(), password)
        if (err) setError(err.message)
        else setMessage(t("login.msg.confirmEmail"))
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

  const isAdminLogin = initialLoginType === "admin"

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
        {!isAdminLogin && (
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
          {isAdminLogin
            ? t("login.title.admin")
            : mode === "forgot"
              ? t("login.title.forgot")
              : mode === "signin"
                ? t("login.title.signin")
                : t("login.title.signup")}
        </h1>
        <p style={{ margin: "0 0 20px", color: theme.text, fontSize: 14, opacity: 0.8 }}>
          {isAdminLogin
            ? t("login.sub.admin")
            : mode === "forgot"
              ? t("login.sub.forgot")
              : mode === "signin"
                ? t("login.sub.signin")
                : t("login.sub.signup")}
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
          </div>
        )}

        {!isAdminLogin && mode === "signin" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ ...labelStyle, display: "block", marginBottom: 6 }}>{t("login.loginAs")}</label>
            <select
              value={loginType}
              onChange={(e) => setLoginType(e.target.value as LoginType)}
              style={{ ...inputStyle, marginTop: 0, marginBottom: 0 }}
            >
              <option value="user">{t("login.roleUser")}</option>
              <option value="office_manager">{t("login.roleOfficeManager")}</option>
            </select>
          </div>
        )}

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
          <label style={labelStyle}>
            {t("login.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              style={inputStyle}
              placeholder="••••••••"
            />
          </label>
        )}
        {mode === "signup" && !isAdminLogin && (
          <label style={labelStyle}>
            {t("login.confirmPassword")}
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
              placeholder="••••••••"
            />
          </label>
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
              : mode === "signin"
                ? t("login.submit.signin")
                : t("login.submit.signup")}
        </button>
        {!isAdminLogin && mode === "signin" && (
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
        {!isAdminLogin && (
          <p style={{ marginTop: 16, fontSize: 14, color: theme.text }}>
            {mode === "forgot" ? (
              <button type="button" onClick={() => { setMode("signin"); setError(""); setMessage("") }} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                {t("login.backSignIn")}
              </button>
            ) : mode === "signin" ? (
              <>
                {t("login.noAccount")}{" "}
                <button type="button" onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                  {t("login.signUpCta")}
                </button>
              </>
            ) : (
              <>
                {t("login.haveAccount")}{" "}
                <button type="button" onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                  {t("login.signInCta")}
                </button>
              </>
            )}
          </p>
        )}
      </form>
      </div>
      <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 20 }} />
    </div>
  )
}
