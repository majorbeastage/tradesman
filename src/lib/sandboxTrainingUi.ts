import { useEffect, useMemo, useState } from "react"
import { useEffectivePortalConfig, useEffectiveUserId, useEffectiveViewRole } from "../contexts/PortalViewContext"
import { isSandboxProfile } from "./sandboxEnvironment"
import type { PortalConfig } from "../types/portal-builder"
import { supabase } from "./supabase"

export function isSandboxTrainingMode(
  portalConfig?: PortalConfig | null,
  metadata?: Record<string, unknown> | null,
  role?: string | null,
): boolean {
  return isSandboxProfile(portalConfig, metadata, role)
}

/** True when the previewed workspace is the training sandbox. */
export function useSandboxTrainingMode(): boolean {
  const effectiveUserId = useEffectiveUserId()
  const viewRole = useEffectiveViewRole()
  const portalConfig = useEffectivePortalConfig()
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!supabase || !effectiveUserId) {
      setMetadata(null)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", effectiveUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const meta = data?.metadata
        setMetadata(meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null)
      })
    return () => {
      cancelled = true
    }
  }, [effectiveUserId])

  return useMemo(
    () => isSandboxTrainingMode(portalConfig, metadata, viewRole),
    [portalConfig, metadata, viewRole],
  )
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
