import { useEffect, useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { TIMEZONE_OPTIONS } from "../../constants/timezones"
import { getDefaultPortalConfigForNewUser } from "../../types/portal-builder"
import {
  DEFAULT_SIGNUP_REQUIREMENTS,
  SIGNUP_REQUIREMENTS_KEY,
  parseSignupRequirements,
  type SignupRequirementsValue,
} from "../../types/signup-requirements"

type Props = {
  onBack: () => void
  onSuccessNeedVerify: () => void
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

async function tryCompleteSignupViaEdge(body: {
  email: string
  password: string
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
}): Promise<"success" | "not_deployed"> {
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

export default function SignupPage({ onBack, onSuccessNeedVerify }: Props) {
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

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

    const edgeBody = {
      email: em,
      password,
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
    }

    setSubmitting(true)
    try {
      let edgeOutcome: "success" | "not_deployed" = "not_deployed"
      try {
        edgeOutcome = await tryCompleteSignupViaEdge(edgeBody)
      } catch (edgeErr) {
        setError(edgeErr instanceof Error ? edgeErr.message : String(edgeErr))
        return
      }

      if (edgeOutcome === "success") {
        setMessage(
          "Check your email to verify your address, then sign in with User Login. Your profile details were saved."
        )
        onSuccessNeedVerify()
        return
      }

      const { data, error: signErr } = await supabase.auth.signUp({
        email: em,
        password,
        options: { data: { display_name: dn } },
      })
      if (signErr) {
        setError(signErr.message)
        return
      }
      const uid = data.user?.id
      if (!uid) {
        setError("Could not create account. This email may already be registered.")
        return
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
        updated_at: new Date().toISOString(),
      }

      if (data.session) {
        const { error: upErr } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" })
        if (upErr) {
          setError(`Account created but profile save failed: ${upErr.message}. You can complete details in My T after signing in.`)
          return
        }
        setMessage("Welcome! Your account is ready. Sign in with User Login anytime.")
      } else {
        setMessage(
          "Check your email to verify your address before first sign-in. After you confirm, open User Login. If your profile is incomplete, use Account (My T) or ask your admin to deploy the complete-signup edge function for full signup without a session."
        )
        onSuccessNeedVerify()
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
          <label style={labelStyle}>
            Password <span style={{ color: "#b91c1c" }}>*</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={inputStyle} autoComplete="new-password" />
          </label>
          <label style={labelStyle}>
            Confirm password <span style={{ color: "#b91c1c" }}>*</span>
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required minLength={6} style={inputStyle} autoComplete="new-password" />
          </label>
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
