import type { CSSProperties } from "react"
import { theme } from "../styles/theme"
import { useLocale } from "../i18n/LocaleContext"

export type ForwardDialCallerIdMode = "caller_number" | "twilio_number"

export type CallForwardAdvancedValues = {
  callForwardingEnabled: boolean
  forwardDialCallerIdMode: ForwardDialCallerIdMode
  forwardWhisperOnAnswer: boolean
  forwardWhisperOnlyOutsideBusinessHours: boolean
  forwardWhisperRequireKeypress: boolean
  forwardWhisperAnnouncementTemplate: string
}

type Props = {
  values: CallForwardAdvancedValues
  onChange: (patch: Partial<CallForwardAdvancedValues>) => void
  compact?: boolean
  primaryPhoneHint?: string | null
}

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  fontSize: 13,
}

export function CallForwardAdvancedOptions({ values, onChange, compact, primaryPhoneHint }: Props) {
  const { t } = useLocale()

  return (
    <div style={{ display: "grid", gap: compact ? 10 : 12 }}>
      {primaryPhoneHint ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
          Primary: <strong>{primaryPhoneHint}</strong>
        </p>
      ) : null}

      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
        {t("account.forward.callerIdLabel")}
        <select
          value={values.forwardDialCallerIdMode}
          disabled={!values.callForwardingEnabled}
          onChange={(e) =>
            onChange({
              forwardDialCallerIdMode: e.target.value === "twilio_number" ? "twilio_number" : "caller_number",
            })
          }
          style={{ ...inputStyle, maxWidth: 420 }}
        >
          <option value="caller_number">{t("account.forward.callerIdInbound")}</option>
          <option value="twilio_number">{t("account.forward.callerIdTwilio")}</option>
        </select>
      </label>

      {!values.callForwardingEnabled ? (
        <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>{t("account.forward.whisperOffWarn")}</p>
      ) : null}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
        <input
          type="checkbox"
          checked={values.forwardWhisperOnAnswer}
          onChange={(e) => {
            const on = e.target.checked
            onChange({
              forwardWhisperOnAnswer: on,
              ...(on
                ? {}
                : {
                    forwardWhisperOnlyOutsideBusinessHours: false,
                    forwardWhisperRequireKeypress: false,
                  }),
            })
          }}
        />
        {t("account.forward.announceTitle")}
      </label>

      {values.forwardWhisperOnAnswer ? (
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: compact ? 10 : 12,
            background: "#fafafa",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>{t("account.forward.whisperHeading")}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={values.forwardWhisperOnlyOutsideBusinessHours}
              onChange={(e) => onChange({ forwardWhisperOnlyOutsideBusinessHours: e.target.checked })}
            />
            {t("account.forward.whisperAfterHours")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={values.forwardWhisperRequireKeypress}
              onChange={(e) => onChange({ forwardWhisperRequireKeypress: e.target.checked })}
            />
            {t("account.forward.requireKeypress")}
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            {t("account.forward.customAnnounce")}
            <textarea
              value={values.forwardWhisperAnnouncementTemplate}
              onChange={(e) => onChange({ forwardWhisperAnnouncementTemplate: e.target.value })}
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              placeholder={t("account.whisperTemplate.placeholder")}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
