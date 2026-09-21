import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { useView } from "../../contexts/ViewContext"
import { DEFAULT_SOLE_SITE_LOGINS, SOLE_TRADESMAN_PROFILE_EMAIL, type SoleSiteLogin } from "../../constants/soleTradesmanProfile"
import { platformToolsJsonBody, platformToolsFetchOrigins, readPlatformToolsJsonBody } from "../../lib/platformToolsJsonBody"

type ProfileCard = {
  id: string
  email: string
  displayName: string | null
  role: string
}

type ApiPayload = {
  profile: ProfileCard | null
  logins: SoleSiteLogin[]
  profileEmail?: string
  error?: string
}

function emptyLogin(): SoleSiteLogin {
  return {
    id: "",
    siteKey: "custom",
    siteLabel: "",
    url: "",
    username: "",
    password: "",
    notes: "",
    updatedAt: null,
  }
}

async function soleWorkspaceApi(body: Record<string, unknown>): Promise<ApiPayload> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error("Sign in again.")
  const origins = platformToolsFetchOrigins()
  let last = "Could not reach the workspace API."
  for (const origin of origins) {
    const res = await fetch(`${origin}/api/platform-tools?__route=admin-sole-workspace`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: platformToolsJsonBody(body),
    })
    const parsed = await readPlatformToolsJsonBody<ApiPayload>(res)
    if (!res.ok) {
      last = parsed.data?.error || `Request failed (${res.status}).`
      if (res.status >= 500) continue
      throw new Error(last)
    }
    if (!parsed.data) {
      last = "Empty response from workspace API."
      continue
    }
    return parsed.data
  }
  throw new Error(last)
}

export default function AdminSoleWorkspaceSection() {
  const { setView } = useView()
  const [profile, setProfile] = useState<ProfileCard | null>(null)
  const [logins, setLogins] = useState<SoleSiteLogin[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, SoleSiteLogin>>({})
  const [adding, setAdding] = useState<SoleSiteLogin | null>(null)

  const applyPayload = useCallback((data: ApiPayload) => {
    setProfile(data.profile)
    setLogins(data.logins ?? [])
    setDrafts(Object.fromEntries((data.logins ?? []).map((l) => [l.id, { ...l }])))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      applyPayload(await soleWorkspaceApi({ action: "load" }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [applyPayload])

  useEffect(() => {
    void load()
  }, [load])

  function openTradesmanProfile() {
    if (!profile?.id) {
      setError(`No Tradesman profile for ${SOLE_TRADESMAN_PROFILE_EMAIL} yet. Create that user first.`)
      return
    }
    try {
      sessionStorage.setItem("tradesman_portal_view_role", "user")
      sessionStorage.setItem("tradesman_portal_target_user", profile.id)
    } catch {
      /* ignore */
    }
    window.location.hash = "#/app/dashboard"
    setView("app")
  }

  async function saveLogin(login: SoleSiteLogin) {
    if (!login.siteLabel.trim()) {
      setError("Give this login a site name.")
      return
    }
    setSavingId(login.id || "new")
    setError("")
    setMessage("")
    try {
      applyPayload(await soleWorkspaceApi({ action: "save", login }))
      setAdding(null)
      setMessage("Saved.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  async function deleteLogin(id: string) {
    if (!confirm("Remove this site login from the SOLE workspace?")) return
    setSavingId(id)
    setError("")
    try {
      applyPayload(await soleWorkspaceApi({ action: "delete", id }))
      setMessage("Removed.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  function startSuggested(siteKey: string) {
    const def = DEFAULT_SOLE_SITE_LOGINS.find((s) => s.siteKey === siteKey)
    if (!def) return
    setAdding({
      ...emptyLogin(),
      siteKey: def.siteKey,
      siteLabel: def.siteLabel,
      url: def.url,
    })
  }

  const usedKeys = new Set(logins.map((l) => l.siteKey))
  const suggestions = DEFAULT_SOLE_SITE_LOGINS.filter((s) => !usedKeys.has(s.siteKey))

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 880 }}>
      <AdminSettingBlock id="admin:sole:intro">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>SOLE workspace</h1>
        <p style={{ color: theme.text, opacity: 0.8, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          This is the Tradesman home for <strong>{SOLE_TRADESMAN_PROFILE_EMAIL}</strong> — User zero on this platform.
          SOLE’s own logins to Meta, Google, Yelp, and the other 18 sites live in{" "}
          <strong>SOLE Admin</strong> at{" "}
          <a href="https://sole.systems/ops" target="_blank" rel="noopener noreferrer">
            sole.systems/ops
          </a>
          , not here. This shop then uses the Growth tab applet to grant SOLE management of Tradesman-US profiles.
        </p>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:sole:profile">
        <h2 style={{ color: theme.text, margin: "0 0 12px", fontSize: 16 }}>Tradesman profile</h2>
        {loading ? (
          <p style={{ color: theme.text, margin: 0 }}>Loading…</p>
        ) : profile ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 4, fontSize: 14, color: theme.text }}>
              <div>
                <strong>{profile.displayName || "SOLE"}</strong>
              </div>
              <div>{profile.email}</div>
              <div style={{ opacity: 0.7, fontSize: 13 }}>Role: {profile.role}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={openTradesmanProfile} style={primaryBtn}>
                Open this profile in Tradesman
              </button>
              <a href="https://sole.systems/ops" target="_blank" rel="noopener noreferrer" style={secondaryLink}>
                Open SOLE Admin
              </a>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ color: theme.text, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              No Tradesman user is signed up as <strong>{SOLE_TRADESMAN_PROFILE_EMAIL}</strong> yet. Create that account
              (or change an existing profile’s email), then this workspace can open their dashboard, website, and
              conversations.
            </p>
            <a href="https://sole.systems/ops" target="_blank" rel="noopener noreferrer" style={secondaryLink}>
              Open SOLE Admin
            </a>
          </div>
        )}
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:sole:logins">
        <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 16 }}>Site logins</h2>
        <p style={{ color: theme.text, opacity: 0.75, margin: "0 0 14px", fontSize: 13, lineHeight: 1.45 }}>
          Stored encrypted on the server. Only admins can see these. Use this for the passwords SOLE uses on other
          websites — not Tradesman sign-in.
        </p>
        {suggestions.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {suggestions.map((s) => (
              <button key={s.siteKey} type="button" onClick={() => startSuggested(s.siteKey)} style={chipBtn}>
                + {s.siteLabel}
              </button>
            ))}
            <button type="button" onClick={() => setAdding(emptyLogin())} style={chipBtn}>
              + Other site
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(emptyLogin())} style={{ ...chipBtn, marginBottom: 14 }}>
            + Other site
          </button>
        )}

        {adding ? (
          <LoginCard
            login={adding}
            reveal
            busy={savingId === "new" || savingId === adding.id}
            onChange={setAdding}
            onSave={() => void saveLogin(adding)}
            onCancel={() => setAdding(null)}
          />
        ) : null}

        {logins.length === 0 && !adding ? (
          <p style={{ color: theme.text, opacity: 0.65, margin: 0, fontSize: 13 }}>No site logins saved yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {logins.map((login) => {
              const draft = drafts[login.id] ?? login
              const shown = Boolean(reveal[login.id])
              return (
                <LoginCard
                  key={login.id}
                  login={draft}
                  reveal={shown}
                  busy={savingId === login.id}
                  onChange={(next) => setDrafts((prev) => ({ ...prev, [login.id]: next }))}
                  onToggleReveal={() => setReveal((prev) => ({ ...prev, [login.id]: !prev[login.id] }))}
                  onSave={() => void saveLogin(draft)}
                  onDelete={() => void deleteLogin(login.id)}
                />
              )
            })}
          </div>
        )}
      </AdminSettingBlock>

      {message ? <p style={{ margin: 0, fontSize: 13, color: "#047857", fontWeight: 700 }}>{message}</p> : null}
      {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  )
}

function LoginCard({
  login,
  reveal,
  busy,
  onChange,
  onSave,
  onDelete,
  onCancel,
  onToggleReveal,
}: {
  login: SoleSiteLogin
  reveal: boolean
  busy: boolean
  onChange: (next: SoleSiteLogin) => void
  onSave: () => void
  onDelete?: () => void
  onCancel?: () => void
  onToggleReveal?: () => void
}) {
  function submit(e: FormEvent) {
    e.preventDefault()
    onSave()
  }
  return (
    <form onSubmit={submit} style={card}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={label}>
          Site
          <input style={input} value={login.siteLabel} onChange={(e) => onChange({ ...login, siteLabel: e.target.value })} />
        </label>
        <label style={label}>
          Login URL
          <input style={input} value={login.url} onChange={(e) => onChange({ ...login, url: e.target.value })} placeholder="https://…" />
        </label>
        <label style={label}>
          Username / email
          <input style={input} value={login.username} autoComplete="off" onChange={(e) => onChange({ ...login, username: e.target.value })} />
        </label>
        <label style={label}>
          Password
          <span style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...input, flex: 1 }}
              type={reveal ? "text" : "password"}
              value={login.password}
              autoComplete="new-password"
              onChange={(e) => onChange({ ...login, password: e.target.value })}
            />
            {onToggleReveal ? (
              <button type="button" onClick={onToggleReveal} style={tinyBtn}>
                {reveal ? "Hide" : "Show"}
              </button>
            ) : null}
          </span>
        </label>
      </div>
      <label style={{ ...label, marginTop: 10 }}>
        Notes
        <textarea
          style={{ ...input, minHeight: 64, resize: "vertical" }}
          value={login.notes}
          onChange={(e) => onChange({ ...login, notes: e.target.value })}
          placeholder="2FA device, page name, who owns the ad account…"
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>
          {busy ? "Saving…" : "Save login"}
        </button>
        {login.url ? (
          <a href={login.url} target="_blank" rel="noopener noreferrer" style={secondaryLink}>
            Open site
          </a>
        ) : null}
        {onDelete ? (
          <button type="button" disabled={busy} onClick={onDelete} style={dangerBtn}>
            Remove
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" onClick={onCancel} style={tinyBtn}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}

const card: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  padding: 14,
  background: "#fff",
}
const label: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#334155" }
const input: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  fontWeight: 500,
  color: "#0f172a",
  background: "#fff",
}
const primaryBtn: CSSProperties = {
  border: "none",
  background: theme.primary,
  color: "#fff",
  borderRadius: 8,
  padding: "9px 12px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}
const secondaryLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 700,
  fontSize: 13,
  textDecoration: "none",
}
const chipBtn: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#0f172a",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}
const tinyBtn: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#334155",
  borderRadius: 8,
  padding: "8px 10px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}
const dangerBtn: CSSProperties = {
  border: "none",
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: 8,
  padding: "9px 12px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}
