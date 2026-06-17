/** Demo trial timing (self-serve request-a-demo flow). */
export const DEMO_ACTIVATION_HOURS = 8
export const DEMO_ACTIVE_HOURS = 24

export function demoActivateByIso(fromMs = Date.now()): string {
  return new Date(fromMs + DEMO_ACTIVATION_HOURS * 3600000).toISOString()
}

export function demoExpiresAfterActivationIso(fromMs = Date.now()): string {
  return new Date(fromMs + DEMO_ACTIVE_HOURS * 3600000).toISOString()
}

export function isDemoProfileRow(row: {
  role?: string | null
  metadata?: Record<string, unknown> | null
  portal_config?: { demo_account?: boolean } | null
} | null): boolean {
  if (!row) return false
  if (row.role === "demo_user") return true
  if (row.portal_config?.demo_account === true) return true
  if (row.metadata?.demo_account === true) return true
  return false
}
