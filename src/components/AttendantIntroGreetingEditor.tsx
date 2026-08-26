import { theme } from "../styles/theme"
import { INTRO_PROMPT_MAX_LENGTH } from "../lib/voiceAutoAttendant"
import { useLocale } from "../i18n/LocaleContext"
import { AttendantStepRecorder } from "./AttendantStepRecorder"

type Props = {
  introPrompt: string
  introRecordingUrl?: string
  disabled?: boolean
  onIntroPromptChange: (value: string) => void
  onIntroRecordingUrlChange: (url: string | undefined) => void
}

export function AttendantIntroGreetingEditor({
  introPrompt,
  introRecordingUrl,
  disabled = false,
  onIntroPromptChange,
  onIntroRecordingUrlChange,
}: Props) {
  const { t } = useLocale()

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{t("account.callScreening.openingLine")}</span>
      <div style={{ display: "grid", gap: 8, opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : undefined }}>
        <AttendantStepRecorder
          recordLabel={t("account.callScreening.recordOpeningButton")}
          onRecorded={(publicUrl) => onIntroRecordingUrlChange(publicUrl)}
        />
        {introRecordingUrl ? (
          <>
            <audio controls preload="none" src={introRecordingUrl} style={{ width: "100%", maxWidth: 640 }} />
            <button
              type="button"
              onClick={() => onIntroRecordingUrlChange(undefined)}
              style={{
                justifySelf: "start",
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t("account.callScreening.clearOpeningRecording")}
            </button>
          </>
        ) : null}
      </div>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
          {introRecordingUrl
            ? t("account.callScreening.openingLineFallbackLabel")
            : t("account.callScreening.openingLineAiLabel")}
        </span>
        <textarea
          value={introPrompt}
          disabled={disabled}
          onChange={(e) => onIntroPromptChange(e.target.value.slice(0, INTRO_PROMPT_MAX_LENGTH))}
          rows={3}
          style={{ ...theme.formInput, resize: "vertical", minHeight: 72, maxWidth: 640 }}
          placeholder={t("account.callScreening.openingLinePlaceholder")}
        />
      </label>
      <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{t("account.callScreening.openingLineHelp")}</span>
    </div>
  )
}
