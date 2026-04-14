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

type Props = {
  profileUserId: string
}

export default function MobileAppPreferencesCard({ profileUserId }: Props) {
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
    <div style={CARD}>
      <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>Mobile app (MyT)</h2>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
        Tradesman on Android / iPhone uses your profile here. Enable push and GPS when you want dispatch, en-route messages, and (for office managers) live maps.
        {isNativeApp() ? "" : " Open this page inside the installed app to request system permissions."}
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
                void persist({ push: v })
              }}
              disabled={saving}
            />
            Allow push notifications on this account
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setPermMsg(null)
              const r = await requestPushPermissionAndRegister()
              setPermMsg(r.message)
            }}
            style={{ ...theme.formInput, width: "fit-content", cursor: "pointer", fontWeight: 600 }}
          >
            Request push permission on this device
          </button>
          {canTestPushThisDevice && pushOptIn ? (
            <button
              type="button"
              disabled={saving || testPushBusy || !supabase}
              onClick={async () => {
                setPermMsg(null)
                setTestPushBusy(true)
                try {
                  const { data, error } = await supabase!.functions.invoke("push-test", {
                    body: { title: "Tradesman test", body: "Push pipeline OK." },
                  })
                  if (error) setPermMsg(error.message)
                  else {
                    const d = data as { ok?: boolean; results?: { ok: boolean; detail: string }[]; error?: string }
                    if (d?.error) setPermMsg(d.error)
                    else if (d?.ok) setPermMsg("Test push sent. Check this device.")
                    else setPermMsg(d?.results?.map((r) => r.detail).join(" · ") || "Push test failed — see Supabase logs / FCM secret.")
                  }
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
