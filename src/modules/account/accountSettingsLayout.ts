import type { CSSProperties } from "react"

export type AccountSettingsCategoryId = "business" | "comms" | "system"

export type AccountSettingsCategory = {
  id: AccountSettingsCategoryId
  label: string
  color: {
    bg: string
    border: string
    accent: string
    text: string
    chip: string
  }
  sectionIds: string[]
}

export const ACCOUNT_SETTINGS_CATEGORIES: AccountSettingsCategory[] = [
  {
    id: "business",
    label: "Business Information",
    color: {
      bg: "#eff6ff",
      border: "#bfdbfe",
      accent: "#3b82f6",
      text: "#1e3a8a",
      chip: "#dbeafe",
    },
    sectionIds: ["profile", "team_members", "business_address", "service_area", "business_hours"],
  },
  {
    id: "comms",
    label: "Email and Phone Settings",
    color: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      accent: "#10b981",
      text: "#065f46",
      chip: "#d1fae5",
    },
    sectionIds: ["tradesman_email", "business_web_profile", "voicemail", "call_forwarding", "call_screening"],
  },
  {
    id: "system",
    label: "System and Mobile Settings",
    color: {
      bg: "#fefce8",
      border: "#fde68a",
      accent: "#ca8a04",
      text: "#854d0e",
      chip: "#fef9c3",
    },
    sectionIds: ["mobile_app", "app_scheme", "ai_automations", "password_reset"],
  },
]

const categoryById = new Map(ACCOUNT_SETTINGS_CATEGORIES.map((c) => [c.id, c]))

export function accountSettingsCategoryForSection(sectionId: string): AccountSettingsCategory | undefined {
  for (const cat of ACCOUNT_SETTINGS_CATEGORIES) {
    if (cat.sectionIds.includes(sectionId)) return cat
  }
  return undefined
}

export function accountSettingsCategoryStyle(category: AccountSettingsCategory | undefined): CSSProperties | undefined {
  if (!category) return undefined
  return {
    background: category.color.bg,
    border: `1px solid ${category.color.border}`,
    borderLeft: `4px solid ${category.color.accent}`,
  }
}

export function accountSettingsFoldButtonStyle(category: AccountSettingsCategory | undefined): CSSProperties {
  if (!category) {
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      width: "100%",
      textAlign: "left",
      padding: "12px 14px",
      border: "none",
      borderRadius: 10,
      background: "#f1f5f9",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 13,
      color: "#0f172a",
    }
  }
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "12px 14px",
    border: `1px solid ${category.color.border}`,
    borderLeft: `4px solid ${category.color.accent}`,
    borderRadius: 10,
    background: category.color.bg,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    color: category.color.text,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  }
}

export function mytSettingsSectionOrder(showSection: (id: string) => boolean): string[] {
  const out: string[] = []
  for (const cat of ACCOUNT_SETTINGS_CATEGORIES) {
    for (const id of cat.sectionIds) {
      if (id === "help_desk") continue
      if (showSection(id)) out.push(id)
    }
  }
  return out
}

export function mytSettingsCategoryLegend(): AccountSettingsCategory[] {
  return ACCOUNT_SETTINGS_CATEGORIES
}

export { categoryById }
