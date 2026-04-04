import { useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { TIMEZONE_OPTIONS } from "../../constants/timezones"
import { getDefaultPortalConfigForNewUser } from "../../types/portal-builder"

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

/** Try server-side signup + profile (works when email verification leaves no session). Returns whether to skip client signUp. */
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
    // Network / CORS / ad-block / wrong URL — fall back to client signUp instead of blocking signup.
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

export default function SignupPage({ onBack, onSuccessNeedVerify }: Props) {
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!supabase) {
      setError("App is not connected to Supabase. Check your .env configuration.")
      return
    }
    const em = email.trim()
    const dn = displayName.trim()
    if (!em || !dn) {
      setError("Login email and business / display name are required.")
      return
    }
    if (!primaryPhone.trim()) {
      setError("Primary phone is required.")
      return
    }
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError("Address line 1, city, state, and zip are required.")
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
      timezone,
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
        timezone,
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
          Required fields are marked. Email verification may be required before your first login, depending on your project settings. We will connect confirmation and admin approval workflows when email is fully enabled.
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
            Business / display name <span style={{ color: "#b91c1c" }}>*</span>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Website URL <span style={{ fontWeight: 400, opacity: 0.75 }}>(optional)</span>
            <input type="text" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} style={inputStyle} placeholder="https://yourbusiness.com" />
          </label>
          <label style={labelStyle}>
            Primary phone (business / app / forwarding) <span style={{ color: "#b91c1c" }}>*</span>
            <input type="tel" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Best contact phone if different <span style={{ fontWeight: 400, opacity: 0.75 }}>(optional)</span>
            <input type="tel" value={bestContactPhone} onChange={(e) => setBestContactPhone(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ marginTop: 4 }}>
            <span style={{ ...labelStyle, marginBottom: 8 }}>Business address <span style={{ color: "#b91c1c" }}>*</span></span>
            <label style={{ ...labelStyle, fontWeight: 500 }}>Address line 1</label>
            <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required style={inputStyle} />
            <label style={{ ...labelStyle, fontWeight: 500, marginTop: 8 }}>Address line 2</label>
            <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <label style={labelStyle}>
                City
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} required style={{ ...inputStyle, maxWidth: "none" }} />
              </label>
              <label style={labelStyle}>
                State
                <input type="text" value={state} onChange={(e) => setState(e.target.value)} required style={{ ...inputStyle, maxWidth: "none" }} />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 8 }}>Zip</label>
            <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} required style={inputStyle} />
          </div>
          <label style={labelStyle}>
            Timezone <span style={{ color: "#b91c1c" }}>*</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle}>
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>

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
