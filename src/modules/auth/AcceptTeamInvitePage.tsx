import { useEffect, useMemo, useState, type CSSProperties } from "react"
import SignupPoliciesAcknowledgement from "../../components/SignupPoliciesAcknowledgement"
import { PasswordFieldWithReveal } from "../../components/PasswordFieldWithReveal"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"

type InvitePreview = {
  invite_email: string
  invite_role: string
  owner_name: string
  expires_at: string
}

const roleLabels: Record<string, string> = {
  user: "User",
  office_manager: "Office manager",
  corporate_internal: "Internal user",
  corporate_external: "External user",
}

async function callInviteEndpoint(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "")
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!base || !anon) throw new Error("Invite service is not configured.")
  const res = await fetch(`${base}/functions/v1/accept-team-invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not process invitation.")
  return data
}

export default function AcceptTeamInvitePage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token")?.trim() ?? "", [])
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [ackTerms, setAckTerms] = useState(false)
  const [ackPrivacy, setAckPrivacy] = useState(false)
  const [ackSms, setAckSms] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void callInviteEndpoint({ action: "preview", token })
      .then((data) => {
        if (!cancelled) setInvite(data as unknown as InvitePreview)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !invite) return
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== password2) {
      setError("Passwords do not match.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      let userId: string | null = null
      const { data, error: signupErr } = await supabase.auth.signUp({
        email: invite.invite_email,
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      if (!signupErr) {
        userId = data.user?.id ?? data.session?.user?.id ?? null
      } else if (/already registered|already exists/i.test(signupErr.message)) {
        const signedIn = await supabase.auth.signInWithPassword({ email: invite.invite_email, password })
        if (signedIn.error) throw new Error("This email already has an account. Enter its password to join this team.")
        userId = signedIn.data.user?.id ?? null
      } else {
        throw signupErr
      }
      if (!userId) throw new Error("Could not create the user account.")

      await callInviteEndpoint({
        action: "complete",
        token,
        user_id: userId,
        display_name: displayName.trim(),
        primary_phone: phone.trim(),
        ack_terms: ackTerms,
        ack_privacy: ackPrivacy,
        ack_sms: ackSms,
      })
      setDone(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "32px 16px", color: theme.text }}>
      <div style={{ width: "min(620px, 100%)", margin: "0 auto", background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, boxShadow: "0 16px 40px rgba(15,23,42,0.08)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Join your Tradesman team</h1>
        {loading ? <p>Checking invitation…</p> : null}
        {done ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>Your team profile is ready.</p>
            <p style={{ margin: 0 }}>
              Check <strong>{invite?.invite_email}</strong> for the verification email, then verify your address and sign in.
            </p>
            <a href="/#contractor-login" style={{ color: theme.primary, fontWeight: 700 }}>Go to sign in</a>
          </div>
        ) : invite ? (
          <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: 14 }}>
            <div style={{ padding: 12, borderRadius: 9, background: "#f1f5f9", fontSize: 14 }}>
              <strong>{invite.owner_name}</strong> invited <strong>{invite.invite_email}</strong> as{" "}
              <strong>{roleLabels[invite.invite_role] ?? "User"}</strong>.
            </div>
            <label style={labelStyle}>
              Your name
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Mobile phone
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            </label>
            <PasswordFieldWithReveal
              label="Create password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              revealLabelShow="Show"
              revealLabelHide="Hide"
              inputStyle={inputStyle}
              required
              minLength={8}
            />
            <PasswordFieldWithReveal
              label="Confirm password"
              value={password2}
              onChange={setPassword2}
              autoComplete="new-password"
              revealLabelShow="Show"
              revealLabelHide="Hide"
              inputStyle={inputStyle}
              required
              minLength={8}
            />
            <SignupPoliciesAcknowledgement
              ackTerms={ackTerms}
              onAckTermsChange={setAckTerms}
              ackPrivacy={ackPrivacy}
              onAckPrivacyChange={setAckPrivacy}
              ackSms={ackSms}
              onAckSmsChange={setAckSms}
            />
            <button type="submit" disabled={submitting} style={{ padding: "11px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 800, cursor: submitting ? "wait" : "pointer" }}>
              {submitting ? "Creating account…" : "Join team"}
            </button>
          </form>
        ) : null}
        {error ? <p style={{ margin: "14px 0 0", color: "#b91c1c", fontWeight: 600 }}>{error}</p> : null}
      </div>
    </main>
  )
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 14,
  fontWeight: 700,
}

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  font: "inherit",
}
