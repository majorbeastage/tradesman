import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  DEFAULT_CALL_HUNTING,
  mergeCallHuntingMetadata,
  newHuntTargetId,
  parseCallHunting,
  type CallHuntMode,
  type CallHuntingSettings,
} from "../lib/callHunting"

type Props = {
  profileUserId: string
  primaryForwardHint?: string
}

export function CallHuntingSettingsPanel({ profileUserId, primaryForwardHint }: Props) {
  const [settings, setSettings] = useState<CallHuntingSettings>(DEFAULT_CALL_HUNTING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    setSettings(parseCallHunting(meta.call_hunting_v1))
    setLoading(false)
  }, [profileUserId])

  useEffect(() => {
    void load()
  }, [load])

  async function persist(next: CallHuntingSettings) {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMessage("")
    const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    const prev =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    const { error } = await supabase
      .from("profiles")
      .update({ metadata: mergeCallHuntingMetadata(prev, next), updated_at: new Date().toISOString() })
      .eq("id", profileUserId)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setSettings(next)
    setMessage("Ring group saved.")
  }

  if (loading) return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading ring options…</p>

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
        After a caller clears screening (if enabled), Tradesman rings your primary forward number
        {primaryForwardHint ? ` (${primaryForwardHint})` : ""} plus any hunt numbers below. Messenger team calls are separate
        from this PSTN forward path.
      </p>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: theme.text }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void persist({ ...settings, enabled: e.target.checked, mode: e.target.checked && settings.mode === "primary_only" ? "sequential" : settings.mode })}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>Enable ring group / hunting</strong>
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Off = only the primary number on your Twilio channel rings (Admin → Communications).
          </span>
        </span>
      </label>

      {settings.enabled ? (
        <>
          <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>How should phones ring?</span>
            <select
              value={settings.mode}
              onChange={(e) => void persist({ ...settings, mode: e.target.value as CallHuntMode })}
              style={theme.formInput}
            >
              <option value="sequential">One at a time (hunt) — try next if no answer</option>
              <option value="simultaneous">All at once — first to answer wins</option>
              <option value="primary_only">Primary only (disable hunt targets)</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, maxWidth: 220 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Ring time (seconds)</span>
            <input
              type="number"
              min={8}
              max={45}
              value={settings.ringSeconds}
              onChange={(e) => setSettings((prev) => ({ ...prev, ringSeconds: Number(e.target.value) || 22 }))}
              onBlur={() => void persist(settings)}
              style={theme.formInput}
            />
          </label>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Additional phones (up to 5 total with primary)</div>
            {settings.targets.map((target, index) => (
              <div
                key={target.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 1.2fr auto",
                  gap: 8,
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={target.enabled}
                  onChange={(e) => {
                    const targets = settings.targets.map((row, i) => (i === index ? { ...row, enabled: e.target.checked } : row))
                    void persist({ ...settings, targets })
                  }}
                />
                <input
                  value={target.label}
                  placeholder="Label (office, tech…)"
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      targets: prev.targets.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)),
                    }))
                  }
                  onBlur={() => void persist(settings)}
                  style={theme.formInput}
                />
                <input
                  value={target.phone}
                  placeholder="+15551234567"
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      targets: prev.targets.map((row, i) => (i === index ? { ...row, phone: e.target.value } : row)),
                    }))
                  }
                  onBlur={() => void persist(settings)}
                  style={theme.formInput}
                />
                <button
                  type="button"
                  onClick={() => void persist({ ...settings, targets: settings.targets.filter((_, i) => i !== index) })}
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#b91c1c",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {settings.targets.length < 4 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void persist({
                    ...settings,
                    targets: [
                      ...settings.targets,
                      { id: newHuntTargetId(), label: "", phone: "", enabled: true },
                    ],
                  })
                }
                style={{
                  width: "fit-content",
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Add phone
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {message ? <p style={{ margin: 0, fontSize: 12, color: message.includes("saved") ? "#15803d" : "#b91c1c" }}>{message}</p> : null}
      {saving ? <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Saving…</p> : null}
    </div>
  )
}
