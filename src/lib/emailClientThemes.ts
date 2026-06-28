import type { CSSProperties } from "react"

export type EmailClientThemeId = "light" | "dark" | "slate" | "warm" | "ocean"

export type EmailClientTheme = {
  id: EmailClientThemeId
  label: string
  shellBackground: string
  panelBackground: string
  panelBorder: string
  text: string
  textMuted: string
  accent: string
  accentSoft: string
  threadActiveBackground: string
  messageOutboundBackground: string
  messageInboundBackground: string
}

export const EMAIL_CLIENT_THEMES: EmailClientTheme[] = [
  {
    id: "light",
    label: "Light",
    shellBackground: "#f8fafc",
    panelBackground: "#ffffff",
    panelBorder: "#e2e8f0",
    text: "#111827",
    textMuted: "#64748b",
    accent: "#f97316",
    accentSoft: "#fff7ed",
    threadActiveBackground: "#fff7ed",
    messageOutboundBackground: "#f8fafc",
    messageInboundBackground: "#ffffff",
  },
  {
    id: "dark",
    label: "Dark",
    shellBackground: "#0f172a",
    panelBackground: "#1e293b",
    panelBorder: "#334155",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    accent: "#fb923c",
    accentSoft: "#431407",
    threadActiveBackground: "#334155",
    messageOutboundBackground: "#273549",
    messageInboundBackground: "#1e293b",
  },
  {
    id: "slate",
    label: "Slate",
    shellBackground: "#eef2f6",
    panelBackground: "#ffffff",
    panelBorder: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#475569",
    accent: "#6366f1",
    accentSoft: "#eef2ff",
    threadActiveBackground: "#eef2ff",
    messageOutboundBackground: "#f1f5f9",
    messageInboundBackground: "#ffffff",
  },
  {
    id: "warm",
    label: "Warm",
    shellBackground: "#fffbeb",
    panelBackground: "#fffef7",
    panelBorder: "#fde68a",
    text: "#422006",
    textMuted: "#92400e",
    accent: "#ea580c",
    accentSoft: "#ffedd5",
    threadActiveBackground: "#ffedd5",
    messageOutboundBackground: "#fef3c7",
    messageInboundBackground: "#fffef7",
  },
  {
    id: "ocean",
    label: "Ocean",
    shellBackground: "#ecfeff",
    panelBackground: "#ffffff",
    panelBorder: "#a5f3fc",
    text: "#164e63",
    textMuted: "#0e7490",
    accent: "#0891b2",
    accentSoft: "#cffafe",
    threadActiveBackground: "#cffafe",
    messageOutboundBackground: "#f0fdfa",
    messageInboundBackground: "#ffffff",
  },
]

export function emailClientThemeById(id: string | null | undefined): EmailClientTheme {
  return EMAIL_CLIENT_THEMES.find((t) => t.id === id) ?? EMAIL_CLIENT_THEMES[0]
}

export function emailThemePanelStyle(theme: EmailClientTheme): CSSProperties {
  return {
    border: `1px solid ${theme.panelBorder}`,
    borderRadius: 12,
    background: theme.panelBackground,
    padding: 12,
    boxSizing: "border-box",
    color: theme.text,
  }
}
