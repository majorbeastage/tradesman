import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  DEFAULT_VOICE_AUTO_ATTENDANT,
  mergeVoiceAutoAttendantMetadata,
  parseVoiceAutoAttendant,
  type VoiceAutoAttendantMode,
} from "../lib/voiceAutoAttendant"
import { useLocale } from "../i18n/LocaleContext"

type Props = {
  profileUserId: string
}

export function CallScreeningSettingsPanel({ profileUserId }: Props) {
  const { t } = useLocale()
  const [settings, setSettings] = useState(DEFAULT_VOICE_AUTO_ATTENDANT)
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
    setSettings(parseVoiceAutoAttendant(meta.voice_auto_attendant_v1))
    setLoading(false)
  }, [profileUserId])

  useEffect(() => {
    void load()
  }, [load])

  async function save(next: typeof settings) {
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
      .update({ metadata: mergeVoiceAutoAttendantMetadata(prev, next), updated_at: new Date().toISOString() })
      .eq("id", profileUserId)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setSettings(next)
    setMessage(t("account.callScreening.saved"))
  }

  if (loading) return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>{t("common.loading")}</p>

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{t("account.callScreening.intro")}</p>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: theme.text }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void save({ ...settings, enabled: e.target.checked, mode: e.target.checked ? "ai_menu" : "off" })}
          style={{ marginTop: 3 }}
        />
        <span>{t("account.callScreening.enable")}</span>
      </label>
      {settings.enabled ? (
        <>
          <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t("account.callScreening.mode")}</span>
            <select
              value={settings.mode}
              onChange={(e) => void save({ ...settings, mode: e.target.value as VoiceAutoAttendantMode })}
              style={theme.formInput}
            >
              <option value="ai_menu">{t("account.callScreening.modeAi")}</option>
              <option value="recorded_menu">{t("account.callScreening.modeRecorded")}</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.spamScreenEnabled}
              onChange={(e) => void save({ ...settings, spamScreenEnabled: e.target.checked })}
            />
            {t("account.callScreening.spamScreen")}
          </label>
          <label style={{ display: "flex", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.forwardGoodLeads}
              onChange={(e) => void save({ ...settings, forwardGoodLeads: e.target.checked })}
            />
            {t("account.callScreening.forwardLeads")}
          </label>
          <label style={{ display: "flex", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.unknownCallerShowTradesmanId}
              onChange={(e) => void save({ ...settings, unknownCallerShowTradesmanId: e.target.checked })}
            />
            {t("account.callScreening.unknownCallerId")}
          </label>
          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{t("account.callScreening.phaseNote")}</p>
        </>
      ) : null}
      {message ? <p style={{ margin: 0, fontSize: 12, color: "#0f766e", fontWeight: 600 }}>{message}</p> : null}
      {saving ? <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("common.saving")}</p> : null}
    </div>
  )
}
