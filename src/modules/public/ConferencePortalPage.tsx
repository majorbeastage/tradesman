import { useEffect, useState } from "react"
import type { CSSProperties, FormEvent } from "react"
import { theme } from "../../styles/theme"
import { useAuth } from "../../contexts/AuthContext"
import ConferenceLineScheduler from "../../components/ConferenceLineScheduler"
import {
  fetchPublicConferenceInvite,
  formatConferenceWhen,
  type PublicConferenceInvite,
} from "../../lib/scheduledConferenceClient"

const shell: CSSProperties = {
  minHeight: "100vh",
  background: theme.background,
  color: theme.text,
}

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "28px 16px 48px",
}

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

const input: CSSProperties = {
  ...theme.formInput,
  fontSize: 15,
}

type Props = {
  inviteToken?: string | null
}

export default function ConferencePortalPage({ inviteToken }: Props) {
  const { user, session, role, loading, signIn, signOut } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [signingIn, setSigningIn] = useState(false)
  const [invite, setInvite] = useState<PublicConferenceInvite | null>(null)
  const [inviteError, setInviteError] = useState("")
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken))

  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    setInviteLoading(true)
    void fetchPublicConferenceInvite(inviteToken)
      .then((row) => {
        if (!cancelled) setInvite(row)
      })
      .catch((e) => {
        if (!cancelled) setInviteError(e instanceof Error ? e.message : "Invite not found.")
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [inviteToken])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setLoginError("")
    setSigningIn(true)
    const result = await signIn(email.trim(), password)
    if (result.error) setLoginError(result.error.message)
    setSigningIn(false)
  }

  return (
    <div style={shell}>
      <header style={{ background: theme.charcoal, color: "#fff", padding: "16px 0" }}>
        <div style={{ ...wrap, paddingTop: 0, paddingBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: "#fdba74", fontWeight: 800 }}>Tradesman</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Conference line</div>
          </div>
          <a href="/" style={{ color: "#fff", fontSize: 13, opacity: 0.85 }}>
            Back to Tradesman
          </a>
        </div>
      </header>

      <main style={wrap}>
        {inviteToken ? (
          <InviteCard loading={inviteLoading} error={inviteError} invite={invite} />
        ) : null}

        {!inviteToken && loading ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}

        {!inviteToken && !loading && !user ? (
          <section style={card}>
            <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Host a conference call</h1>
            <p style={{ margin: "0 0 18px", color: "#4b5563", lineHeight: 1.55 }}>
              Sign in to schedule a one-time call on <strong>(863) 341-8778</strong>. We will generate a PIN and email or text it to the people you invite.
            </p>
            <form onSubmit={(e) => void onLogin(e)} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
              <input style={input} type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input style={input} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {loginError ? <div style={{ color: "#991b1b", fontSize: 14 }}>{loginError}</div> : null}
              <button
                type="submit"
                disabled={signingIn}
                style={{ border: "none", borderRadius: 8, padding: "11px 14px", background: theme.primary, color: "#fff", fontWeight: 800, cursor: "pointer" }}
              >
                {signingIn ? "Signing in…" : "Sign in to schedule"}
              </button>
            </form>
          </section>
        ) : null}

        {!inviteToken && !loading && user && session?.access_token ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>Conference portal</h1>
                <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
                  Signed in as {user.email}
                  {role ? ` · ${role.replace(/_/g, " ")}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => void signOut()} style={{ border: `1px solid ${theme.border}`, background: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
                Sign out
              </button>
            </div>
            <ConferenceLineScheduler
              accessToken={session.access_token}
              hostName={typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : user.email ?? undefined}
              hostEmail={user.email ?? undefined}
            />
          </div>
        ) : null}
      </main>
    </div>
  )
}

function InviteCard({
  loading,
  error,
  invite,
}: {
  loading: boolean
  error: string
  invite: PublicConferenceInvite | null
}) {
  if (loading) {
    return (
      <section style={card}>
        <p style={{ margin: 0, color: "#6b7280" }}>Loading your conference details…</p>
      </section>
    )
  }
  if (error || !invite) {
    return (
      <section style={card}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Invite not found</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{error || "This conference link is invalid or expired."}</p>
      </section>
    )
  }

  const statusNote =
    invite.canceled || invite.joinStatus === "canceled"
      ? "This conference was canceled."
      : invite.joinStatus === "ended"
        ? "This conference has ended."
        : invite.joinStatus === "too_early"
          ? "You can join starting 15 minutes before the start time."
          : "This conference is open. Dial in now."

  return (
    <section style={{ ...card, marginBottom: 20 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: theme.primary, fontWeight: 800, marginBottom: 8 }}>
        You are invited
      </div>
      <h1 style={{ margin: "0 0 6px", fontSize: 26 }}>{invite.title}</h1>
      <p style={{ margin: "0 0 16px", color: "#4b5563" }}>
        Hosted by {invite.hostName || "your host"}
        {invite.guestName ? ` · for ${invite.guestName}` : ""}
      </p>
      <p style={{ margin: "0 0 18px", fontSize: 15 }}>
        <strong>{formatConferenceWhen(invite.startsAt)}</strong>
        <br />
        <span style={{ color: "#6b7280" }}>Until {formatConferenceWhen(invite.endsAt)}</span>
      </p>
      <div style={{ background: "#111827", color: "#fff", borderRadius: 12, padding: 18, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 18 }}>
          Dial <strong>{invite.dialInDisplay}</strong>
        </div>
        <div style={{ fontSize: 18 }}>
          PIN <strong style={{ letterSpacing: 2 }}>{invite.pin}</strong>
        </div>
      </div>
      <p style={{ margin: "14px 0 0", color: "#4b5563", fontSize: 14 }}>{statusNote}</p>
    </section>
  )
}
