import type { CSSProperties } from "react"
import { useAppNavigationOptional } from "../contexts/AppNavigationContext"
import { queueCalendarSuiteNavigation } from "../lib/workflowNavigation"
import { theme } from "../styles/theme"
import { useLocale } from "../i18n/LocaleContext"

type Props = {
  style?: CSSProperties
  variant?: "button" | "link"
}

export function CallScheduleCalendarLink({ style, variant = "button" }: Props) {
  const nav = useAppNavigationOptional()
  const { t } = useLocale()

  function open() {
    queueCalendarSuiteNavigation({ id: "call_schedule" })
    nav?.navigatePage("calendar")
  }

  const label = t("account.callSchedule.openLink")

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={open}
        style={{
          border: "none",
          background: "none",
          padding: 0,
          color: theme.primary,
          fontWeight: 800,
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
          ...style,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      style={{
        border: `1px solid ${theme.primary}`,
        background: "#eff6ff",
        color: theme.primary,
        borderRadius: 8,
        padding: "8px 14px",
        fontWeight: 800,
        fontSize: 13,
        cursor: "pointer",
        width: "fit-content",
        ...style,
      }}
    >
      {label}
    </button>
  )
}
