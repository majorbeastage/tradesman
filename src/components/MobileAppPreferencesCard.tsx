import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import {
  requestGpsPermission,
  requestPushPermissionAndRegister,
  isNativeApp,
  openAppSystemSettings,
} from "../lib/capacitorMobile"

const CARD = {
  padding: 16,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "#fafafa",
  display: "grid" as const,
  gap: 12,
}

/** Body shape from `push-test` (also returned on 4xx/5xx when JSON). */
type PushTestPayload = {
  ok?: boolean
  error?: string
  hint?: string
  results?: { platform: string; ok: boolean; detail: string }[]
}

type Props = {
  profileUserId: string
  /** When wrapped in a collapsible section that already shows the title */
  hideTitle?: boolean
}

export default function MobileAppPreferencesCard({ profileUserId, hideTitle }: Props) {
  const { user } = useAuth()
  const canTestPushThisDevice = !!user?.id && user.id === profileUserId
  const [pushOptIn, setPushOptIn] = useState(false)
  const [gpsOptIn, setGpsOptIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [permMsg, setPermMsg] = useState<string | null>(null)
  const [testPushBusy, setTestPushBusy] = useState(false)

  useEffect(() => {
    if (!profileUserId || !supabase) return
    setLoading(true)
    void Promise.resolve(
      supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle(),
    )
      .then(({ data }) => {
        const m = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>
        setPushOptIn(m.mobile_push_opt_in === true)
        setGpsOptIn(m.mobile_gps_opt_in === true)
      })
      .finally(() => setLoading(false))
  }, [profileUserId])

  async function persist(next: { push?: boolean; gps?: boolean }) {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMsg(null)
    const { data, error } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    if (error) {
      setMsg(error.message)
      setSaving(false)
      return
    }
    const meta = { ...((data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>) }
    if (next.push !== undefined) meta.mobile_push_opt_in = next.push
    if (next.gps !== undefined) meta.mobile_gps_opt_in = next.gps
    const { error: up } = await supabase.from("profiles").update({ metadata: meta }).eq("id", profileUserId)
    setSaving(false)
    if (up) setMsg(up.message)
    else setMsg("Saved.")
  }

  return (
    <div style={{ ...CARD, ...(hideTitle ? { padding: 0, border: "none", background: "transparent", gap: 10 } : {}) }}>
      {!hideTitle ? <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>Mobile app</h2> : null}
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
        Tradesman on Android / iPhone uses your profile here. Enable push and GPS when you want dispatch, en-route messages, and (for office managers) live maps.
        {isNativeApp()
          ? " After you turn on “Allow push” or “Allow GPS” here, the app will ask the system for permission on this device (usually within a few seconds), same pattern as other apps."
          : " Open this page inside the installed app to request system permissions."}
      </p>
      {loading ? (
        <span style={{ color: theme.text }}>Loading…</span>
      ) : (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, color: theme.text, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={pushOptIn}
              onChange={(e) => {
                const v = e.target.checked
                setPushOptIn(v)
                void (async () => {
                  await persist({ push: v })
                  if (v && isNativeApp() && user?.id === profileUserId && supabase) {
                    const r = await requestPushPermissionAndRegister(supabase, user.id)
                    setPermMsg(r.message)
                  }
                })()
              }}
              disabled={saving}
            />
            Allow push notifications on this account
          </label>
          <button
            type="button"
            disabled={saving || !user?.id || user.id !== profileUserId}
            onClick={async () => {
              setPermMsg(null)
              const r = await requestPushPermissionAndRegister(supabase, user?.id ?? null)
              setPermMsg(r.message)
            }}
            style={{ ...theme.formInput, width: "fit-content", cursor: "pointer", fontWeight: 600 }}
          >
            Request push permission on this device
          </button>
          {user?.id && user.id !== profileUserId ? (
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              Sign in as this user on this device to register push for their account.
            </p>
          ) : null}
          {canTestPushThisDevice && pushOptIn ? (
            <button
              type="button"
              disabled={saving || testPushBusy || !supabase}
              onClick={async () => {
                setPermMsg(null)
                setTestPushBusy(true)
                try {
                  const { data, error, response: fnResponse } = await supabase!.functions.invoke("push-test", {
                    body: { title: "Tradesman test", body: "Push pipeline OK." },
                  })
                  // Non-2xx: `data` may be null; read error JSON from a clone so the body is not double-consumed.
                  let parsedFromBody: PushTestPayload | null = null
                  if (error && fnResponse) {
                    try {
                      const ct = (fnResponse.headers.get("Content-Type") ?? "").toLowerCase()
                      if (ct.includes("application/json")) {
                        const text = await fnResponse.clone().text()
                        if (text) parsedFromBody = JSON.parse(text) as PushTestPayload
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                  const d = (data as PushTestPayload | null) ?? parsedFromBody
                  const detailLines =
                    d?.results?.map((r) => `${r.platform}: ${r.detail}`).filter(Boolean).join(" · ") ?? ""
                  if (error) {
                    setPermMsg(
                      [d?.error, d?.hint, detailLines || error.message].filter(Boolean).join(" — ") ||
                        error.message,
                    )
                  } else if (d?.error) {
                    setPermMsg([d.error, d.hint].filter(Boolean).join(" — "))
                  } else if (d?.ok) {
                    setPermMsg(
                      detailLines
                        ? `Test push accepted by FCM. ${detailLines}`
                        : "Test push accepted by FCM. Check the notification shade on this device; if the app is open, also test once with app in background.",
                    )
                  } else {
                    setPermMsg(
                      detailLines ||
                        "Push test did not succeed — set Supabase secret FCM_SERVICE_ACCOUNT_JSON and deploy push-test, or confirm this device row exists in user_push_devices.",
                    )
                  }
                } catch (e) {
                  setPermMsg(e instanceof Error ? e.message : String(e))
                } finally {
                  setTestPushBusy(false)
                }
              }}
              style={{ ...theme.formInput, width: "fit-content", cursor: "pointer", fontWeight: 600, background: "#ecfdf5", borderColor: "#6ee7b7" }}
            >
              {testPushBusy ? "Sending test…" : "Send test push (this device)"}
            </button>
          ) : null}
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, color: theme.text, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={gpsOptIn}
              onChange={(e) => {
                const v = e.target.checked
                setGpsOptIn(v)
                void persist({ gps: v })
              }}
              disabled={saving}
            />
            Allow GPS / location for dispatch radius &amp; maps
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setPermMsg(null)
              const r = await requestGpsPermission()
              setPermMsg(r.message)
            }}
            style={{ ...theme.formInput, width: "fit-content", cursor: "pointer", fontWeight: 600 }}
          >
            Request location permission on this device
          </button>
          {isNativeApp() ? (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setPermMsg(null)
                const r = await openAppSystemSettings()
                setPermMsg(r.ok ? "Opened system settings for Tradesman. Enable Location and/or Notifications, then return here." : r.message)
              }}
              style={{ ...theme.formInput, width: "fit-content", cursor: "pointer", fontWeight: 600, background: "#eff6ff", borderColor: "#93c5fd" }}
            >
              Open system settings (Tradesman app)
            </button>
          ) : null}
        </>
      )}
      {msg && <p style={{ margin: 0, fontSize: 13, color: "#059669" }}>{msg}</p>}
      {permMsg && <p style={{ margin: 0, fontSize: 12, color: "#4b5563" }}>{permMsg}</p>}
    </div>
  )
}
