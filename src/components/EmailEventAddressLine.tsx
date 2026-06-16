import type { CSSProperties } from "react"
import { formatCommEventEmailAddressSummary } from "../lib/communicationEmailAddresses"

type EmailEventAddressLineProps = {
  event: { metadata?: unknown }
  style?: CSSProperties
}

export function EmailEventAddressLine({ event, style }: EmailEventAddressLineProps) {
  const summary = formatCommEventEmailAddressSummary(event)
  if (!summary) return null
  return (
    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b", lineHeight: 1.45, ...style }}>
      {summary}
    </p>
  )
}
