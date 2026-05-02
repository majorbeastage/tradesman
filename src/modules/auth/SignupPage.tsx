import { useEffect, useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { PasswordFieldWithReveal } from "../../components/PasswordFieldWithReveal"
import { useLocale } from "../../i18n/LocaleContext"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { revokeOtherAuthSessions } from "../../lib/authSingleSession"
import { TIMEZONE_OPTIONS } from "../../constants/timezones"
import { getDefaultPortalConfigForNewUser } from "../../types/portal-builder"
import {
  DEFAULT_SIGNUP_REQUIREMENTS,
  SIGNUP_REQUIREMENTS_KEY,
  parseSignupRequirements,
  type SignupRequirementsValue,
} from "../../types/signup-requirements"
import { PRODUCT_PACKAGES, PRODUCT_PACKAGE_IDS, type ProductPackageId } from "../../lib/productPackages"

type Props = {
  onBack: () => void
  /** Preset from Pricing page or cold load via App sessionStorage. */
  initialProductPackage?: string | null
}

function normalizePhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  return `${keepPlus ? "+" : ""}${digits}`
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function formatBusinessAddress(a: {
  address_line_1: string
  address_line_2: string
  address_city: string
  address_state: string
  address_zip: string
}): string {
  const lines = [a.address_line_1.trim(), a.address_line_2.trim()].filter(Boolean)
  const cityStateZip = [a.address_city.trim(), a.address_state.trim(), a.address_zip.trim()].filter(Boolean)
  if (cityStateZip.length) lines.push(cityStateZip.join(", "))
  return lines.join("\n")
}

const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonEnv = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

type SyncProfileBody = {
  user_id: string
  email: string
  display_name: string
  website_url: string | null
  primary_phone: string | null
  best_contact_phone: string | null
  address_line_1: string | null
  address_line_2: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  business_address: string | null
  timezone: string
  signup_extras?: Record<string, string | null>
  ack_terms?: boolean
  ack_privacy?: boolean
  ack_sms?: boolean
  use_ai_automation?: boolean
  ui_language?: string
}

/** Saves full profile via Edge (service role). Password is never sent. */
async function trySyncSignupProfileViaEdge(body: SyncProfileBody): Promise<"success" | "not_deployed"> {
  if (!supabaseUrlEnv?.trim() || !supabaseAnonEnv?.trim()) return "not_deployed"
  const base = supabaseUrlEnv.replace(/\/$/, "")
  const fnUrl = `${base}/functions/v1/complete-signup`
  let res: Response
  try {
    res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonEnv}`,
        apikey: supabaseAnonEnv,
      },
      body: JSON.stringify(body),
    })
  } catch {
    return "not_deployed"
  }
  if (res.status === 404) return "not_deployed"
  let json: { error?: string } = {}
  try {
    json = (await res.json()) as { error?: string }
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(json.error || `Signup service error (${res.status})`)
  }
  return "success"
}

function req(cfg: SignupRequirementsValue, field: keyof SignupRequirementsValue["fields"]): boolean {
  return cfg.fields[field] === "required"
}

export default function SignupPage({ onBack, initialProductPackage }: Props) {
  const { t } = useLocale()
  const [signupCfg, setSignupCfg] = useState<SignupRequirementsValue>({
    ...DEFAULT_SIGNUP_REQUIREMENTS,
    fields: { ...DEFAULT_SIGNUP_REQUIREMENTS.fields },
    custom_fields: [...DEFAULT_SIGNUP_REQUIREMENTS.custom_fields],
  })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [primaryPhone, setPrimaryPhone] = useState("")
  const [bestContactPhone, setBestContactPhone] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [zip, setZip] = useState("")
  const [timezone, setTimezone] = useState("America/New_York")
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [ackTerms, setAckTerms] = useState(false)
  const [ackPrivacy, setAckPrivacy] = useState(false)
  const [ackSms, setAckSms] = useState(false)
  /** User must explicitly allow or deny AI features (stored as `ai_assistant_visible` / edge `use_ai_automation`). */
  const [aiAutomationChoice, setAiAutomationChoice] = useState<"allow" | "deny" | null>(null)
  const [uiLanguage, setUiLanguage] = useState<"en" | "es">("en")
  const [productPackageChoice, setProductPackageChoice] = useState<ProductPackageId | "">("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  /** After signup when email confirmation is required — stay on this screen until user leaves. */
  const [awaitingEmailFor, setAwaitingEmailFor] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)
  const [resendHint, setResendHint] = useState<string>("")

  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const { data, error: err } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", SIGNUP_REQUIREMENTS_KEY)
        .maybeSingle()
      if (!err && data?.value) setSignupCfg(parseSignupRequirements(data.value))
    })()
  }, [])

  useEffect(() => {
    setExtras((prev) => {
      const next = { ...prev }
      for (const f of signupCfg.custom_fields) {
        if (!(f.id in next)) next[f.id] = ""
      }
      return next
    })
  }, [signupCfg.custom_fields])

  useEffect(() => {
    if (!initialProductPackage) return
    if (PRODUCT_PACKAGE_IDS.includes(initialProductPackage as ProductPackageId)) {
      setProductPackageChoice(initialProductPackage as ProductPackageId)
    }
  }, [initialProductPackage])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!supabase) {
      setError("App is not connected to Supabase. Check your .env configuration.")
      return
    }
    const em = email.trim()
    if (!em) {
      setError("Login email is required.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== password2) {
      setError("Passwords do not match.")
      return
    }
    const dn = displayName.trim() || em.split("@")[0] || "Account"
    if (req(signupCfg, "display_name") && !displayName.trim()) {
      setError("Business / display name is required.")
      return
    }
    if (req(signupCfg, "primary_phone") && !primaryPhone.trim()) {
      setError("Primary phone is required.")
      return
    }
    if (req(signupCfg, "best_contact_phone") && !bestContactPhone.trim()) {
      setError("Best contact phone is required.")
      return
    }
    if (req(signupCfg, "website_url") && !websiteUrl.trim()) {
      setError("Website URL is required.")
      return
    }
    if (req(signupCfg, "address")) {
      if (!addressLine1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
        setError("Address line 1, city, state, and zip are required.")
        return
      }
    }
    if (req(signupCfg, "timezone") && !timezone.trim()) {
      setError("Timezone is required.")
      return
    }
    for (const f of signupCfg.custom_fields) {
      const v = (extras[f.id] ?? "").trim()
      if (f.required && !v) {
        setError(`Please fill in: ${f.label}`)
        return
      }
    }
    if (signupCfg.require_terms_ack && signupCfg.show_terms_link && !ackTerms) {
      setError("Please confirm that you agree to the Terms & Conditions.")
      return
    }
    if (signupCfg.require_privacy_ack && signupCfg.show_privacy_link && !ackPrivacy) {
      setError("Please confirm that you acknowledge the Privacy Policy.")
      return
    }
    if (signupCfg.require_sms_consent_ack && signupCfg.show_sms_consent_link && !ackSms) {
      setError("Please confirm SMS consent.")
      return
    }
    if (aiAutomationChoice === null) {
      setError("Please choose whether to allow AI-assisted features in your account.")
      return
    }
    const useAiAutomation = aiAutomationChoice === "allow"

    const website = websiteUrl.trim() ? normalizeUrl(websiteUrl) : null
    const primary = normalizePhone(primaryPhone) || null
    const best = bestContactPhone.trim() ? normalizePhone(bestContactPhone) : null
    const addr = {
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      address_city: city,
      address_state: state,
      address_zip: zip,
    }
    const business_address = formatBusinessAddress(addr) || null
    const tz = timezone.trim() || "America/New_York"

    const signup_extras: Record<string, string | null> = {}
    for (const f of signupCfg.custom_fields) {
      const v = (extras[f.id] ?? "").trim()
      signup_extras[f.id] = v || null
    }

    setSubmitting(true)
    try {
      const { data, error: signErr } = await supabase.auth.signUp({
        email: em,
        password,
        options: { data: { display_name: dn } },
      })
      if (signErr) {
        setError(signErr.message)
        return
      }
      if (data.session) await revokeOtherAuthSessions()
      const uid = data.user?.id ?? data.session?.user?.id
      if (!uid) {
        setError(
          "Could not create account (no user id from sign up). If this email is already registered, sign in instead; otherwise try again or contact support.",
        )
        return
      }

      const syncBody: SyncProfileBody = {
        user_id: uid,
        email: em,
        display_name: dn,
        website_url: website,
        primary_phone: primary,
        best_contact_phone: best,
        address_line_1: addressLine1.trim() || null,
        address_line_2: addressLine2.trim() || null,
        address_city: city.trim() || null,
        address_state: state.trim() || null,
        address_zip: zip.trim() || null,
        business_address,
        timezone: tz,
        signup_extras: Object.keys(signup_extras).length ? signup_extras : undefined,
        ack_terms: ackTerms,
        ack_privacy: ackPrivacy,
        ack_sms: ackSms,
        use_ai_automation: useAiAutomation,
        ui_language: uiLanguage,
      }

      const profilePayload = {
        id: uid,
        email: em,
        display_name: dn,
        role: "new_user" as const,
        website_url: website,
        primary_phone: primary,
        best_contact_phone: best,
        address_line_1: addressLine1.trim() || null,
        address_line_2: addressLine2.trim() || null,
        address_city: city.trim() || null,
        address_state: state.trim() || null,
        address_zip: zip.trim() || null,
        business_address,
        timezone: tz,
        signup_extras: Object.keys(signup_extras).length ? signup_extras : {},
        portal_config: getDefaultPortalConfigForNewUser(),
        ai_assistant_visible: useAiAutomation,
        metadata: { ui_language: uiLanguage },
        updated_at: new Date().toISOString(),
      }

      let edgeOutcome: "success" | "not_deployed" = "not_deployed"
      try {
        edgeOutcome = await trySyncSignupProfileViaEdge(syncBody)
      } catch (edgeErr) {
        if (data.session) {
          const { error: upErr } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" })
          if (upErr) {
            setError(
              `Account created but profile save failed: ${upErr.message}. ${edgeErr instanceof Error ? edgeErr.message : String(edgeErr)}`,
            )
            return
          }
          setMessage("Welcome! Your account is ready. Sign in with User Login anytime.")
          return
        }
        setError(
          edgeErr instanceof Error
            ? `${edgeErr.message} Your confirmation email may still arrive — check inbox and spam. After confirming, sign in; if profile data is missing, contact support (Edge function may need redeploy).`
            : String(edgeErr),
        )
        setAwaitingEmailFor(em)
        return
      }

      if (edgeOutcome === "not_deployed") {
        if (data.session) {
          const { error: upErr } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" })
          if (upErr) {
            setError(`Account created but profile save failed: ${upErr.message}`)
            return
          }
          setMessage("Welcome! Your account is ready. Sign in with User Login anytime.")
        } else {
          setAwaitingEmailFor(em)
          setError(
            "Confirmation email should be on the way. The profile server is not deployed — after you confirm your email, open Account (My T) to finish your details, or ask your admin to deploy the complete-signup function.",
          )
        }
        return
      }

      if (!data.session) {
        setAwaitingEmailFor(em)
        setMessage("")
        setError("")
      } else {
        setMessage("Welcome! Your account is ready. Sign in with User Login anytime.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 440,
    padding: "10px 12px",
    marginTop: 6,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
  }

  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, fontSize: 14, color: theme.text, marginBottom: 4 }

  const mark = (field: keyof SignupRequirementsValue["fields"]) =>
    req(signupCfg, field) ? (
      <span style={{ color: "#b91c1c" }}>*</span>
    ) : (
      <span style={{ fontWeight: 400, opacity: 0.75 }}>(optional)</span>
    )

  const legalLink = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 700 }}>
      {label}
    </a>
  )

  async function handleResendConfirmation() {
    if (!supabase || !awaitingEmailFor) return
    setResendBusy(true)
    setResendHint("")
    try {
      const { error: rErr } = await supabase.auth.resend({ type: "signup", email: awaitingEmailFor })
      if (rErr) setResendHint(rErr.message)
      else setResendHint("Another confirmation message was sent. Check inbox, spam, and promotions.")
    } finally {
      setResendBusy(false)
    }
  }

  if (awaitingEmailFor) {
    return (
      <div style={{ minHeight: "100vh", background: theme.background, padding: 24 }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => {
              setAwaitingEmailFor(null)
              onBack()
            }}
            style={{
              marginBottom: 20,
              padding: "8px 14px",
              background: "transparent",
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              cursor: "pointer",
              color: theme.text,
              fontWeight: 600,
            }}
          >
            ← Back to home
          </button>
          <div
            style={{
              padding: 28,
              borderRadius: 14,
              border: `2px solid ${theme.primary}`,
              background: "#fff",
              boxShadow: "0 8px 28px rgba(0,0,0,0.08)",
            }}
          >
            <h1 style={{ color: theme.text, margin: "0 0 12px", fontSize: 26 }}>Check your email</h1>
            <p style={{ color: theme.text, margin: "0 0 14px", lineHeight: 1.6, fontSize: 15 }}>
              We created your account and sent a <strong>confirmation link</strong> to{" "}
              <strong style={{ wordBreak: "break-all" }}>{awaitingEmailFor}</strong>.
            </p>
            <p style={{ color: "#374151", margin: "0 0 14px", lineHeight: 1.6, fontSize: 14 }}>
              <strong>You cannot sign in until you open that link.</strong> The message usually arrives within a minute. Check spam,
              promotions, and “All mail” if you use Gmail.
            </p>
            <p style={{ color: "#6b7280", margin: "0 0 18px", lineHeight: 1.55, fontSize: 13 }}>
              After you confirm, use <strong>User Login</strong> on the home page with the same email and password you just chose.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
              <button
                type="button"
                disabled={resendBusy}
                onClick={() => void handleResendConfirmation()}
                style={{
                  padding: "10px 18px",
                  background: theme.primary,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: resendBusy ? "wait" : "pointer",
                  fontSize: 14,
                }}
              >
                {resendBusy ? "Sending…" : "Resend confirmation email"}
              </button>
            </div>
            {resendHint ? (
              <p style={{ margin: "0 0 14px", fontSize: 14, color: resendHint.includes("sent") ? "#059669" : "#b91c1c" }}>{resendHint}</p>
            ) : null}
            <div
              style={{
                marginTop: 8,
                padding: 14,
                borderRadius: 10,
                background: "#f9fafb",
                border: `1px solid ${theme.border}`,
                fontSize: 13,
                color: "#4b5563",
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: theme.text }}>Still nothing?</strong> In Supabase: Authentication → Providers → Email → confirm
              signups is enabled; Authentication → Emails → templates; Project Settings → Auth → SMTP (custom SMTP is often required for
              reliable delivery). The confirmation link must match your <strong>Site URL</strong> and allowed redirect URLs.
            </div>
          </div>
          <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 8, marginTop: 24 }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.background, padding: 24 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginBottom: 20,
            padding: "8px 14px",
            background: "transparent",
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            cursor: "pointer",
            color: theme.text,
            fontWeight: 600,
          }}
        >
          ← Back
        </button>
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 26 }}>Create your account</h1>
        <p style={{ color: theme.text, opacity: 0.85, margin: "0 0 20px", lineHeight: 1.55, fontSize: 14 }}>
          Required fields are marked. Email verification may be required before your first login, depending on your project settings.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "grid", gap: 14 }}>
          <label style={labelStyle}>
            Login email <span style={{ color: "#b91c1c" }}>*</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} autoComplete="email" />
          </label>
          <PasswordFieldWithReveal
            label={
              <>
                Password <span style={{ color: "#b91c1c" }}>*</span>
              </>
            }
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            revealLabelShow={t("login.showPassword")}
            revealLabelHide={t("login.hidePassword")}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
            wrapMarginBottom={0}
            innerGapTop={6}
            name="new-password"
            required
            minLength={6}
          />
          <PasswordFieldWithReveal
            label={
              <>
                Confirm password <span style={{ color: "#b91c1c" }}>*</span>
              </>
            }
            value={password2}
            onChange={setPassword2}
            autoComplete="new-password"
            revealLabelShow={t("login.showPassword")}
            revealLabelHide={t("login.hidePassword")}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
            wrapMarginBottom={0}
            innerGapTop={6}
            name="confirm-password"
            required
            minLength={6}
          />
          <label style={labelStyle}>
            Business / display name {mark("display_name")}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required={req(signupCfg, "display_name")}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Website URL {mark("website_url")}
            <input type="text" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} required={req(signupCfg, "website_url")} style={inputStyle} placeholder="https://yourbusiness.com" />
          </label>
          <label style={labelStyle}>
            Primary phone (business / app / forwarding) {mark("primary_phone")}
            <input type="tel" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} required={req(signupCfg, "primary_phone")} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Best contact phone if different {mark("best_contact_phone")}
            <input type="tel" value={bestContactPhone} onChange={(e) => setBestContactPhone(e.target.value)} required={req(signupCfg, "best_contact_phone")} style={inputStyle} />
          </label>
          <div style={{ marginTop: 4 }}>
            <span style={{ ...labelStyle, marginBottom: 8 }}>
              Business address {mark("address")}
            </span>
            <label style={{ ...labelStyle, fontWeight: 500 }}>Address line 1</label>
            <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required={req(signupCfg, "address")} style={inputStyle} />
            <label style={{ ...labelStyle, fontWeight: 500, marginTop: 8 }}>Address line 2</label>
            <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <label style={labelStyle}>
                City
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} required={req(signupCfg, "address")} style={{ ...inputStyle, maxWidth: "none" }} />
              </label>
              <label style={labelStyle}>
                State
                <input type="text" value={state} onChange={(e) => setState(e.target.value)} required={req(signupCfg, "address")} style={{ ...inputStyle, maxWidth: "none" }} />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 8 }}>Zip</label>
            <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} required={req(signupCfg, "address")} style={inputStyle} />
          </div>
          <label style={labelStyle}>
            Timezone {mark("timezone")}
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} required={req(signupCfg, "timezone")} style={inputStyle}>
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Product package <span style={{ fontWeight: 400, opacity: 0.75 }}>(optional)</span>
            <select
              value={productPackageChoice}
              onChange={(e) => setProductPackageChoice((e.target.value as ProductPackageId | "") || "")}
              style={inputStyle}
            >
              <option value="">No selection — we&apos;ll follow up</option>
              {PRODUCT_PACKAGES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} — {p.priceLine.replace(/\s*\*+\s*$/, "").trim()}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400, display: "block", marginTop: 4 }}>
              Lets our team know which plan you&apos;re interested in. See{" "}
              <a href="/pricing" style={{ color: theme.primary, fontWeight: 600 }}>
                Pricing
              </a>{" "}
              for full details.
            </span>
          </label>

          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              fontSize: 14,
              color: theme.text,
              lineHeight: 1.55,
            }}
          >
            <p style={{ margin: "0 0 10px", fontWeight: 700 }}>AI-assisted features</p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", fontWeight: 400 }}>
              Choose whether Tradesman may show AI-assisted tools (summaries, suggestions, etc.) in your workspace. You can change this anytime
              under Account (My T).
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 500, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="ai-automation"
                  checked={aiAutomationChoice === "allow"}
                  onChange={() => setAiAutomationChoice("allow")}
                  style={{ marginTop: 3 }}
                />
                <span>Yes — allow AI-assisted features where available</span>
              </label>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 500, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="ai-automation"
                  checked={aiAutomationChoice === "deny"}
                  onChange={() => setAiAutomationChoice("deny")}
                  style={{ marginTop: 3 }}
                />
                <span>No — do not use AI features (hide AI options on Leads, Conversations, Quotes, and Calendar)</span>
              </label>
            </div>
            <label style={{ display: "grid", gap: 6, marginTop: 14, fontWeight: 600 }}>
              Language
              <select
                value={uiLanguage}
                onChange={(e) => setUiLanguage(e.target.value === "es" ? "es" : "en")}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
                Controls navigation and shared labels after sign-in. You can change this in Account (My T).
              </span>
            </label>
          </div>

          {signupCfg.custom_fields.map((f) => (
            <label key={f.id} style={labelStyle}>
              {f.label} {f.required ? <span style={{ color: "#b91c1c" }}>*</span> : <span style={{ fontWeight: 400, opacity: 0.75 }}>(optional)</span>}
              <input
                type="text"
                value={extras[f.id] ?? ""}
                onChange={(e) => setExtras((prev) => ({ ...prev, [f.id]: e.target.value }))}
                required={f.required}
                style={inputStyle}
              />
            </label>
          ))}

          {(signupCfg.show_terms_link || signupCfg.show_privacy_link || signupCfg.show_sms_consent_link) && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                fontSize: 14,
                color: theme.text,
                lineHeight: 1.55,
              }}
            >
              <p style={{ margin: "0 0 10px", fontWeight: 700 }}>Policies</p>
              <p style={{ margin: 0 }}>
                {signupCfg.show_terms_link ? (
                  <>
                    {legalLink("/terms", "Terms & Conditions")}
                    {signupCfg.show_privacy_link || signupCfg.show_sms_consent_link ? " · " : ""}
                  </>
                ) : null}
                {signupCfg.show_privacy_link ? (
                  <>
                    {legalLink("/privacy", "Privacy Policy")}
                    {signupCfg.show_sms_consent_link ? " · " : ""}
                  </>
                ) : null}
                {signupCfg.show_sms_consent_link ? legalLink("/sms-consent", "SMS consent") : null}
              </p>
              {signupCfg.require_terms_ack && signupCfg.show_terms_link ? (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontWeight: 500, cursor: "pointer" }}>
                  <input type="checkbox" checked={ackTerms} onChange={(e) => setAckTerms(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>I agree to the Terms &amp; Conditions.</span>
                </label>
              ) : null}
              {signupCfg.require_privacy_ack && signupCfg.show_privacy_link ? (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, fontWeight: 500, cursor: "pointer" }}>
                  <input type="checkbox" checked={ackPrivacy} onChange={(e) => setAckPrivacy(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>I acknowledge the Privacy Policy.</span>
                </label>
              ) : null}
              {signupCfg.require_sms_consent_ack && signupCfg.show_sms_consent_link ? (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, fontWeight: 500, cursor: "pointer" }}>
                  <input type="checkbox" checked={ackSms} onChange={(e) => setAckSms(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>I consent to SMS messaging as described on the SMS consent page.</span>
                </label>
              ) : null}
            </div>
          )}

          {error && <p style={{ color: "#b91c1c", margin: 0, fontSize: 14 }}>{error}</p>}
          {message && <p style={{ color: "#059669", margin: 0, fontSize: 14 }}>{message}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 8,
              padding: "14px 22px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
      <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 8 }} />
    </div>
  )
}
