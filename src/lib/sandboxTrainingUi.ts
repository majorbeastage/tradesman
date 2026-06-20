import { useMemo } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useEffectivePortalConfig } from "../contexts/PortalViewContext"
import { isSandboxProfile } from "./sandboxEnvironment"
import type { PortalConfig } from "../types/portal-builder"

export function isSandboxTrainingMode(
  portalConfig?: PortalConfig | null,
  metadata?: Record<string, unknown> | null,
  role?: string | null,
): boolean {
  return isSandboxProfile(portalConfig, metadata, role)
}

/** True when the signed-in workspace is the training sandbox. */
export function useSandboxTrainingMode(): boolean {
  const { role } = useAuth()
  const portalConfig = useEffectivePortalConfig()
  return useMemo(() => isSandboxTrainingMode(portalConfig, null, role), [portalConfig, role])
}

export function isDemoUuidDbError(message: string | null | undefined): boolean {
  const m = String(message ?? "")
  return /invalid input syntax for type uuid/i.test(m) && /sandbox-demo-/i.test(m)
}

/** Hide training-noise errors (demo UUID leaks, simulated comm failures). */
export function shouldSuppressSandboxTrainingError(
  sandboxActive: boolean,
  message: string | null | undefined,
  kind: "calendar_load" | "communication" | "demo_uuid" = "calendar_load",
): boolean {
  if (!sandboxActive) return false
  if (isDemoUuidDbError(message)) return true
  if (kind === "calendar_load" || kind === "communication") return true
  if (kind === "demo_uuid") return true
  return false
}

/** User-facing alert — skipped in sandbox for comm/calendar load noise. */
export function sandboxTrainingAlert(
  sandboxActive: boolean,
  message: string,
  kind: "calendar_load" | "communication" | "demo_uuid" = "calendar_load",
): void {
  if (shouldSuppressSandboxTrainingError(sandboxActive, message, kind)) {
    console.info("[sandbox-training]", message)
    return
  }
  alert(message)
}
