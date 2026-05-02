import type { CSSProperties } from "react"
import defaultLogo from "../assets/logo.png"
import {
  type CommunicationUrgency,
  normalizeCommunicationUrgency,
} from "../lib/customerUrgency"

const wrap: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
}

function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#dc2626" d="M4 22V2h12l-2 5 2 5H8v10H4z" />
    </svg>
  )
}

function ConeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#ea580c" d="M12 3 4 21h16L12 3zm0 5 5 11H7l5-11z" />
    </svg>
  )
}

type Props = {
  level: string | null | undefined
  /** Company logo from profile metadata (e.g. estimate_template_logo_url); falls back to Tradesman mark. */
  brandLogoUrl?: string | null
}

export default function CommunicationUrgencyBadge({ level, brandLogoUrl }: Props) {
  const u = normalizeCommunicationUrgency(level)
  const label = u
  if (u === "Critical") {
    return (
      <span style={{ ...wrap, color: "#991b1b" }}>
        <FlagIcon />
        {label}
      </span>
    )
  }
  if (u === "Needs Attention") {
    return (
      <span style={{ ...wrap, color: "#a16207" }}>
        <span style={{ fontSize: 13 }} aria-hidden>
          ●
        </span>
        {label}
      </span>
    )
  }
  if (u === "In Process") {
    return (
      <span style={{ ...wrap, color: "#0369a1" }}>
        <span style={{ fontSize: 13, color: "#38bdf8" }} aria-hidden>
          ●
        </span>
        {label}
      </span>
    )
  }
  if (u === "Complete") {
    const src = brandLogoUrl?.trim() ? brandLogoUrl.trim() : defaultLogo
    return (
      <span style={{ ...wrap, color: "#15803d" }}>
        <img src={src} alt="" width={14} height={14} style={{ objectFit: "contain", borderRadius: 2 }} />
        {label}
      </span>
    )
  }
  if (u === "Lost") {
    return (
      <span style={{ ...wrap, color: "#9a3412" }}>
        <ConeIcon />
        {label}
      </span>
    )
  }
  return <span style={wrap}>{label}</span>
}

export function communicationUrgencySelectOptions(): CommunicationUrgency[] {
  return ["In Process", "Needs Attention", "Critical", "Complete", "Lost"]
}
