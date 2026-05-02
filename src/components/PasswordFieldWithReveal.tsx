import { useId, useState, type CSSProperties, type ReactNode } from "react"
import { theme } from "../styles/theme"

type Props = {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
  revealLabelShow: string
  revealLabelHide: string
  labelStyle?: CSSProperties
  inputStyle: CSSProperties
  /** Space below this field (matches stacked form fields). */
  wrapMarginBottom?: number
  /** Space between label and input row (default matches Login). */
  innerGapTop?: number
  id?: string
  name?: string
  required?: boolean
  minLength?: number
}

/**
 * Password input with an in-field control to toggle visibility (does not change the value).
 */
export function PasswordFieldWithReveal({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  revealLabelShow,
  revealLabelHide,
  labelStyle,
  inputStyle,
  wrapMarginBottom = 16,
  innerGapTop = 4,
  id,
  name,
  required,
  minLength,
}: Props) {
  const genId = useId()
  const fieldId = id ?? `pwd-${genId.replace(/:/g, "")}`
  const [visible, setVisible] = useState(false)

  return (
    <label style={{ display: "block", ...labelStyle }}>
      {label}
      <div style={{ position: "relative", marginTop: innerGapTop, marginBottom: wrapMarginBottom }}>
        <input
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          style={{
            ...inputStyle,
            marginTop: 0,
            marginBottom: 0,
            width: "100%",
            paddingRight: 88,
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          aria-label={visible ? revealLabelHide : revealLabelShow}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            color: theme.primary,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 10px",
            lineHeight: 1.2,
          }}
        >
          {visible ? revealLabelHide : revealLabelShow}
        </button>
      </div>
    </label>
  )
}
