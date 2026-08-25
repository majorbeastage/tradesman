import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  DEFAULT_VOICE_AUTO_ATTENDANT,
  INTRO_PROMPT_MAX_LENGTH,
  mergeVoiceAutoAttendantMetadata,
  parseVoiceAutoAttendant,
  recommendedResponseTimeoutSeconds,
  type VoiceAutoAttendantMode,
  type VoiceAutoAttendantSettings,
} from "../lib/voiceAutoAttendant"
import { reencodeAttendantRecordingUrl } from "../lib/attendantRecordingUpload"
import { isTwilioPlaySafeAudioUrl } from "../lib/audioToTwilioWav"
import { voiceStudioUserRequest } from "../lib/voicePromptStudio"
import { useLocale } from "../i18n/LocaleContext"
import { CallScreeningMenuBuilder } from "./CallScreeningMenuBuilder"
import { CallScheduleCalendarLink } from "./CallScheduleCalendarLink"

type Props = {
  profileUserId: string
}

export function CallScreeningSettingsPanel({ profileUserId }: Props) {
  const { t } = useLocale()
  const [settings, setSettings] = useState<VoiceAutoAttendantSettings>(DEFAULT_VOICE_AUTO_ATTENDANT)
  const [menuDraft, setMenuDraft] = useState(DEFAULT_VOICE_AUTO_ATTENDANT.menuSteps)
  const [introDraft, setIntroDraft] = useState(DEFAULT_VOICE_AUTO_ATTENDANT.introPrompt)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [menuDirty, setMenuDirty] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    const parsed = parseVoiceAutoAttendant(meta.voice_auto_attendant_v1)
    setSettings(parsed)
    setMenuDraft(parsed.menuSteps)
    setIntroDraft(parsed.introPrompt)
    setMenuDirty(false)
    setLoading(false)
  }, [profileUserId])

  useEffect(() => {
    void load()
  }, [load])

  async function persist(next: VoiceAutoAttendantSettings) {
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
    setMenuDraft(next.menuSteps)
    setIntroDraft(next.introPrompt)
    setMenuDirty(false)
    setMessage(t("account.callScreening.saved"))
  }

  async function saveToggles(patch: Partial<VoiceAutoAttendantSettings>) {
    await persist({ ...settings, ...patch })
  }

  async function saveMenu() {
    setSaving(true)
    let timedSteps = menuDraft.map((step) => ({
      ...step,
      responseTimeoutSeconds: recommendedResponseTimeoutSeconds(step.kind, step.prompt),
    }))
    if (settings.mode === "record_own_menu") {
      timedSteps = await Promise.all(
        timedSteps.map(async (step) => {
          const url = step.recordingUrl?.trim()
          if (!url || isTwilioPlaySafeAudioUrl(url)) return step
          const converted = await reencodeAttendantRecordingUrl(profileUserId, url)
          return converted !== url ? { ...step, recordingUrl: converted } : step
        }),
      )
    }
    try {
      const payload = await voiceStudioUserRequest("client-analyze-auto-attendant", {
        steps: menuDraft.map(({ id, kind, prompt }) => ({ id, kind, prompt })),
      })
      const analyzed = Array.isArray(payload.steps)
        ? (payload.steps as Array<{ id?: string; responseTimeoutSeconds?: number }>)
        : []
      const timingById = new Map(analyzed.map((step) => [step.id, step.responseTimeoutSeconds]))
      timedSteps = timedSteps.map((step) => {
        const responseTimeoutSeconds = timingById.get(step.id)
        return typeof responseTimeoutSeconds === "number" && Number.isFinite(responseTimeoutSeconds)
          ? { ...step, responseTimeoutSeconds }
          : step
      })
    } catch {
      // The local recommendation keeps call timing safe if the AI service is temporarily unavailable.
    }
    setSaving(false)
    await persist({
      ...settings,
      introPrompt: introDraft.slice(0, INTRO_PROMPT_MAX_LENGTH),
      menuSteps: timedSteps,
    })
  }

  if (loading) return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>{t("common.loading")}</p>

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: theme.text }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            void saveToggles({ enabled: e.target.checked, mode: e.target.checked ? settings.mode === "off" ? "ai_menu" : settings.mode : "off" })
          }
          style={{ marginTop: 3 }}
        />
        <span>{t("account.callScreening.enable")}</span>
      </label>
      {settings.enabled ? (
        <>
          <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t("account.callScreening.mode")}</span>
            <select
              value={settings.mode === "off" ? "ai_menu" : settings.mode}
              onChange={(e) => void saveToggles({ mode: e.target.value as VoiceAutoAttendantMode })}
              style={theme.formInput}
            >
              <option value="ai_menu">{t("account.callScreening.modeAi")}</option>
              <option value="recorded_menu">{t("account.callScreening.modeRecorded")}</option>
              <option value="record_own_menu">{t("account.callScreening.modeRecordOwn")}</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t("account.callScreening.openingLine")}</span>
            <textarea
              value={introDraft}
              onChange={(e) => {
                setIntroDraft(e.target.value.slice(0, INTRO_PROMPT_MAX_LENGTH))
                setMenuDirty(true)
              }}
              rows={3}
              style={{ ...theme.formInput, resize: "vertical", minHeight: 72, maxWidth: 640 }}
              placeholder={t("account.callScreening.openingLinePlaceholder")}
            />
            <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{t("account.callScreening.openingLineHelp")}</span>
          </label>

          <div
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: 14,
              background: "#f8fafc",
              display: "grid",
              gap: 12,
            }}
          >
            <CallScreeningMenuBuilder
              mode={
                settings.mode === "recorded_menu"
                  ? "recorded_menu"
                  : settings.mode === "record_own_menu"
                    ? "record_own_menu"
                    : "ai_menu"
              }
              steps={menuDraft}
              collectContactInfo={settings.collectContactInfo}
              onChange={(steps) => {
                setMenuDraft(steps)
                setMenuDirty(true)
              }}
              onCollectContactChange={(v) => {
                setSettings((s) => ({ ...s, collectContactInfo: v }))
                setMenuDirty(true)
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                disabled={!menuDirty || saving}
                onClick={() => void saveMenu()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: menuDirty ? theme.primary : "#cbd5e1",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: menuDirty && !saving ? "pointer" : "default",
                }}
              >
                {t("account.callScreening.saveMenu")}
              </button>
              {menuDirty ? (
                <span style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>{t("account.callScreening.unsavedMenu")}</span>
              ) : null}
            </div>
          </div>

          <label style={{ display: "flex", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.spamScreenEnabled}
              onChange={(e) => void saveToggles({ spamScreenEnabled: e.target.checked })}
            />
            {t("account.callScreening.spamScreen")}
          </label>
          <label style={{ display: "flex", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.forwardGoodLeads}
              onChange={(e) => void saveToggles({ forwardGoodLeads: e.target.checked })}
            />
            {t("account.callScreening.forwardLeads")}
          </label>
          <label style={{ display: "flex", gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.unknownCallerShowTradesmanId}
              onChange={(e) => void saveToggles({ unknownCallerShowTradesmanId: e.target.checked })}
            />
            {t("account.callScreening.unknownCallerId")}
          </label>
        </>
      ) : null}
      {message ? <p style={{ margin: 0, fontSize: 12, color: "#0f766e", fontWeight: 600 }}>{message}</p> : null}
      {saving ? <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("common.saving")}</p> : null}
      <CallScheduleCalendarLink />
    </div>
  )
}
