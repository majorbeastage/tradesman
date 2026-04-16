import { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { isNativeApp, requestGpsPermission, requestPushPermissionAndRegister } from "../lib/capacitorMobile"

const STORAGE_KEY = "tradesman_native_perm_onboarding_v1"

/**
 * First signed-in session on the native app: prompt for notification + location so the OS shows the real dialogs.
 * User can dismiss; Account → Mobile app still has the same actions.
 */
export default function NativePermissionOnboarding() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"push" | "loc" | "both" | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!isNativeApp() || !user?.id) return
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch {
      return
    }
    const t = window.setTimeout(() => setOpen(true), 2800)
    return () => window.clearTimeout(t)
  }, [user?.id])

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  async function runBoth() {
    setBusy("both")
    setNote(null)
    try {
      const p = await requestPushPermissionAndRegister(supabase, user?.id ?? null)
      const g = await requestGpsPermission()
      setNote([p.message, g.message].filter(Boolean).join(" · "))
      if (p.ok && g.ok) dismiss()
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function runPush() {
    setBusy("push")
    setNote(null)
    try {
      await new Promise<void>((r) => window.requestAnimationFrame(() => r()))
      const p = await requestPushPermissionAndRegister(supabase, user?.id ?? null)
      setNote(p.message)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function runLoc() {
    setBusy("loc")
    setNote(null)
    try {
      await new Promise<void>((r) => window.requestAnimationFrame(() => r()))
      const g = await requestGpsPermission()
      setNote(g.message)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="native-perm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          borderRadius: 12,
          background: "#fff",
          padding: 20,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <h2 id="native-perm-title" style={{ margin: "0 0 10px", fontSize: 18, color: "#111827" }}>
          Set up this device
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
          Tradesman can send job alerts and use your location for team maps when you allow it. The next taps open the{" "}
          <strong>system permission prompts</strong> (not raw Android permission IDs).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runBoth()}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              fontSize: 15,
            }}
          >
            {busy === "both" ? "Please respond on screen…" : "Allow notifications & location"}
          </button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runPush()}
              style={{
                flex: "1 1 140px",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #1f2937",
                background: "#e5e7eb",
                color: "#111827",
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
                fontSize: 14,
              }}
            >
              {busy === "push" ? "…" : "Notifications only"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runLoc()}
              style={{
                flex: "1 1 140px",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #1f2937",
                background: "#e5e7eb",
                color: "#111827",
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
                fontSize: 14,
              }}
            >
              {busy === "loc" ? "…" : "Location only"}
            </button>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={dismiss}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#6b7280",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Not now
          </button>
        </div>
        {note ? <p style={{ margin: "14px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.45 }}>{note}</p> : null}
      </div>
    </div>
  )
}
