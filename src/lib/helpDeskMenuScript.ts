/** Mirrors api/_helpDeskVoiceHandler.ts — preview text callers hear for the keypad menu. */

export type HelpDeskMenuPreviewOption = {
  digit: string
  label: string
  enabled?: boolean
  depends_on_digit?: string
}

export function buildHelpDeskMenuSay(
  options: HelpDeskMenuPreviewOption[],
  includeVoicemailHint: boolean,
  includePersonalGreetingHint: boolean,
): string {
  const parts = options
    .filter((o) => o.enabled !== false && o.digit && o.label && !o.depends_on_digit?.trim())
    .map((o) => `Press ${o.digit} for ${o.label}.`)
  if (includeVoicemailHint) parts.push("Press 0 to leave a voicemail for our team.")
  if (includePersonalGreetingHint) parts.push("Press 9 to update your mailbox greeting using your PIN.")
  return parts.join(" ")
}

export function helpDeskMenuPreviewWarnings(input: {
  menu_enabled: boolean
  options: HelpDeskMenuPreviewOption[]
  greeting_mode: string
  voicemail_notify_user_ids: string
}): string[] {
  const roots = input.options.filter((o) => o.enabled !== false && o.digit?.trim() && o.label?.trim() && !o.depends_on_digit?.trim())
  const warnings: string[] = []
  if (roots.length === 0) {
    warnings.push("Add at least one enabled main-menu row (leave “Show after key” empty) with a digit and label.")
  }
  if (!input.menu_enabled && roots.length > 0) {
    warnings.push("“Enable keypad menu” is unchecked — callers will only hear the greeting, not these options.")
  }
  if (input.greeting_mode === "recorded") {
    warnings.push(
      "Recorded opening audio is only the welcome clip. The keypad options below are spoken automatically right after it (you do not need to record them into the greeting file).",
    )
  }
  const hasSubmenuOnly =
    input.options.some((o) => o.enabled !== false && o.digit?.trim() && o.label?.trim()) && roots.length === 0
  if (hasSubmenuOnly) {
    warnings.push("All rows use “Show after key” — those are submenus only. Add at least one main-menu row with “Show after key” left empty.")
  }
  const hasPinRow = input.options.some(
    (o) => o.enabled !== false && !o.depends_on_digit?.trim() && (o as { on_select?: string }).on_select === "pin_greeting",
  )
  if (hasPinRow) {
    warnings.push("A main-menu row uses “Personal mailbox greeting” — the extra “press 9” shortcut is hidden to avoid duplicate paths.")
  }
  return warnings
}
