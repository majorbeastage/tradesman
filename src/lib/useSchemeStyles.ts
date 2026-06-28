import type { CSSProperties } from "react"
import { useAppScheme } from "../contexts/AppSchemeContext"
import { resolveSchemeTone } from "../lib/appSchemes"
import { theme } from "../styles/theme"

/** Shared CSS-var tokens for platform-wide scheme styling in inline styles. */
export const schemeTokens = {
  primary: "var(--scheme-primary, #F97316)",
  primaryBorder: "var(--scheme-primary-border, rgba(249, 115, 22, 0.35))",
  accent: "var(--scheme-accent, #FB923C)",
  cardBg: "var(--scheme-card-bg, #ffffff)",
  shellBg: "var(--scheme-shell-bg, #E4E7EC)",
  border: "var(--scheme-border, #E5E7EB)",
  text: "var(--scheme-main-text, #111827)",
  textMuted: "var(--scheme-text-muted, #6b7280)",
  onPrimary: "var(--scheme-on-primary, #ffffff)",
  onLight: "var(--scheme-on-light-surface, #111827)",
  cardShadow: "var(--scheme-card-shadow, 0 8px 24px rgba(15, 23, 42, 0.08))",
  cardRadius: "var(--scheme-card-radius, 12px)",
} as const

/**
 * Portal-aware theme: resolves CSS variables set on `.portal-charcoal`.
 * Prefer this over `theme` inside logged-in portal pages (Growth, Account, etc.).
 */
export function usePortalTheme() {
  const { schemeId, scheme } = useAppScheme()
  const tone = resolveSchemeTone(schemeId, scheme.custom)
  const isDark = tone === "dark"

  return {
    ...theme,
    primary: schemeTokens.primary,
    text: schemeTokens.text,
    textMuted: schemeTokens.textMuted,
    border: schemeTokens.border,
    cardBg: schemeTokens.cardBg,
    onPrimary: schemeTokens.onPrimary,
    onLight: schemeTokens.onLight,
    portalShellBackground: schemeTokens.shellBg,
    tone,
    isDark,
    formInput: {
      ...theme.formInput,
      background: schemeTokens.cardBg,
      color: schemeTokens.text,
      border: `1px solid ${schemeTokens.border}`,
    } satisfies CSSProperties,
  }
}

export function schemeCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: schemeTokens.cardBg,
    border: `1px solid ${schemeTokens.border}`,
    borderRadius: schemeTokens.cardRadius,
    boxShadow: schemeTokens.cardShadow,
    color: schemeTokens.text,
    ...extra,
  }
}

export function schemePrimaryButtonStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: schemeTokens.primary,
    color: schemeTokens.onPrimary,
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
    ...extra,
  }
}

export function schemeSecondaryButtonStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: "var(--scheme-card-bg, #ffffff)",
    color: "var(--scheme-on-light-surface, #111827)",
    border: `1px solid ${schemeTokens.border}`,
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    ...extra,
  }
}

export function schemeFormInputStyle(extra?: CSSProperties): CSSProperties {
  return {
    padding: "8px 10px",
    border: `1px solid ${schemeTokens.border}`,
    borderRadius: 6,
    background: schemeTokens.cardBg,
    color: schemeTokens.text,
    width: "100%",
    boxSizing: "border-box",
    ...extra,
  }
}
