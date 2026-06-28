/** App visual scheme — stored on profiles.metadata.app_scheme_v1 */

export const APP_SCHEME_META_KEY = "app_scheme_v1"

export type AppSchemeId =
  | "standard"
  | "dark"
  | "light"
  | "matrix"
  | "sunshine"
  | "landscape"
  | "garage"
  | "general_contractor"
  | "custom"

export type AppSchemeCustomConfig = {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  sidebarColor: string
  logoUrl: string | null
}

export type AppSchemeV1 = {
  _v: 1
  schemeId: AppSchemeId
  custom: AppSchemeCustomConfig
}

export type AppSchemeDefinition = {
  id: AppSchemeId
  label: string
  tagline: string
  /** Mini preview swatches for thumbnail */
  preview: { sidebar: string; shell: string; accent: string; card: string }
}

export const APP_SCHEME_DEFINITIONS: AppSchemeDefinition[] = [
  {
    id: "standard",
    label: "Standard",
    tagline: "Original Tradesman look",
    preview: { sidebar: "#2a2a2a", shell: "#E4E7EC", accent: "#F97316", card: "#ffffff" },
  },
  {
    id: "dark",
    label: "Dark Pro",
    tagline: "Charcoal shell with orange glow",
    preview: { sidebar: "#0f1419", shell: "#151c28", accent: "#fb923c", card: "#1e293b" },
  },
  {
    id: "light",
    label: "Light",
    tagline: "Bright, airy workspace",
    preview: { sidebar: "#f8fafc", shell: "#ffffff", accent: "#ea580c", card: "#f1f5f9" },
  },
  {
    id: "matrix",
    label: "Matrix",
    tagline: "Green code on black",
    preview: { sidebar: "#020617", shell: "#0a0f0a", accent: "#22c55e", card: "#111827" },
  },
  {
    id: "sunshine",
    label: "Sunshine",
    tagline: "Tropical coral & teal",
    preview: { sidebar: "#0e7490", shell: "#fef3c7", accent: "#f97316", card: "#fff7ed" },
  },
  {
    id: "landscape",
    label: "Landscape",
    tagline: "Lawn & garden greens",
    preview: { sidebar: "#365314", shell: "#ecfccb", accent: "#84cc16", card: "#fefce8" },
  },
  {
    id: "garage",
    label: "Garage",
    tagline: "Diamond plate steel",
    preview: { sidebar: "#27272a", shell: "#52525b", accent: "#a1a1aa", card: "#71717a" },
  },
  {
    id: "general_contractor",
    label: "General Contractor",
    tagline: "2×4 lumber & jobsite tan",
    preview: { sidebar: "#78350f", shell: "#fef3c7", accent: "#d97706", card: "#fde68a" },
  },
  {
    id: "custom",
    label: "Custom",
    tagline: "Your logo & brand colors",
    preview: { sidebar: "#334155", shell: "#f1f5f9", accent: "#6366f1", card: "#ffffff" },
  },
]

export function defaultAppSchemeCustom(): AppSchemeCustomConfig {
  return {
    primaryColor: "#F97316",
    accentColor: "#FB923C",
    backgroundColor: "#E4E7EC",
    sidebarColor: "#2a2a2a",
    logoUrl: null,
  }
}

export function defaultAppSchemeV1(): AppSchemeV1 {
  return { _v: 1, schemeId: "standard", custom: defaultAppSchemeCustom() }
}

function parseCustom(raw: unknown): AppSchemeCustomConfig {
  const base = defaultAppSchemeCustom()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  return {
    primaryColor: typeof o.primaryColor === "string" && o.primaryColor.trim() ? o.primaryColor.trim() : base.primaryColor,
    accentColor: typeof o.accentColor === "string" && o.accentColor.trim() ? o.accentColor.trim() : base.accentColor,
    backgroundColor:
      typeof o.backgroundColor === "string" && o.backgroundColor.trim() ? o.backgroundColor.trim() : base.backgroundColor,
    sidebarColor: typeof o.sidebarColor === "string" && o.sidebarColor.trim() ? o.sidebarColor.trim() : base.sidebarColor,
    logoUrl: typeof o.logoUrl === "string" && o.logoUrl.trim() ? o.logoUrl.trim() : null,
  }
}

export function parseAppSchemeV1(metadata: unknown): AppSchemeV1 {
  const base = defaultAppSchemeV1()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>)[APP_SCHEME_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const id = o.schemeId
  const schemeId: AppSchemeId = APP_SCHEME_DEFINITIONS.some((d) => d.id === id) ? (id as AppSchemeId) : "standard"
  return {
    _v: 1,
    schemeId,
    custom: parseCustom(o.custom),
  }
}

export function mergeAppSchemeV1(metadata: unknown, patch: Partial<AppSchemeV1>): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const prev = parseAppSchemeV1(metadata)
  base[APP_SCHEME_META_KEY] = {
    ...prev,
    ...patch,
    _v: 1 as const,
    custom: patch.custom ? { ...prev.custom, ...patch.custom } : prev.custom,
  }
  return base
}

export function getSchemeDefinition(id: AppSchemeId): AppSchemeDefinition {
  return APP_SCHEME_DEFINITIONS.find((d) => d.id === id) ?? APP_SCHEME_DEFINITIONS[0]
}

/** CSS custom properties applied on `.portal-charcoal[data-app-scheme]`. */
export function customSchemeCssVars(custom: AppSchemeCustomConfig): Record<string, string> {
  return {
    "--scheme-primary": custom.primaryColor,
    "--scheme-primary-soft": `${custom.primaryColor}33`,
    "--scheme-primary-border": `${custom.primaryColor}59`,
    "--scheme-accent": custom.accentColor,
    "--scheme-sidebar-bg": custom.sidebarColor,
    "--scheme-shell-bg": custom.backgroundColor,
    "--scheme-main-bg": custom.backgroundColor,
    "--scheme-card-bg": "#ffffff",
    "--scheme-text": "#111827",
    "--scheme-text-muted": "#6b7280",
    "--scheme-border": "#E5E7EB",
    "--scheme-sidebar-text": custom.primaryColor,
    "--scheme-main-text": "#111827",
    "--scheme-logo-glow": custom.accentColor,
    "--scheme-nav-active-bg": `${custom.primaryColor}2e`,
    "--scheme-card-shadow": "0 8px 24px rgba(15, 23, 42, 0.08)",
    "--scheme-pattern-opacity": "0",
  }
}
