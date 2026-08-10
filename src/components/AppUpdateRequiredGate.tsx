import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { APP_VERSION } from "../constants/appVersion"
import {
  fetchAppVersionRequirements,
  nativeUpdateRequired,
  openNativeAppStore,
} from "../lib/appUpdateRequirement"

/**
 * On native builds: blocks the app when installed version is below server minimum.
 * Set MIN_ANDROID_APP_VERSION / MIN_IOS_APP_VERSION on Vercel when you ship a required update.
 */
export default function AppUpdateRequiredGate() {
  const [blocked, setBlocked] = useState(false)
  const [minVersion, setMinVersion] = useState<string | null>(null)
  const [storeUrl, setStoreUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    void fetchAppVersionRequirements().then((req) => {
      if (cancelled) return
      const check = nativeUpdateRequired(req)
      if (check.required) {
        setBlocked(true)
        setMinVersion(check.minVersion)
        setStoreUrl(check.storeUrl)
        setMessage(req.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!blocked) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(15, 23, 42, 0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: "100%",
          background: "#fff",
          borderRadius: 16,
          padding: "24px 22px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Update required</h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
          {message ||
            "A newer version of Tradesman is required to continue. Install the update from your app store — your Tradesman login stays the same."}
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "#94a3b8" }}>
          Installed: {APP_VERSION}
          {minVersion ? ` · Required: ${minVersion}+` : null}
        </p>
        <button
          type="button"
          onClick={() => openNativeAppStore(storeUrl)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: "#0f766e",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          {Capacitor.getPlatform() === "ios" ? "Open App Store" : "Open Google Play"}
        </button>
      </div>
    </div>
  )
}
