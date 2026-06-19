import { type ReactNode, useMemo } from "react"
import {
  usePortalViewOptional,
  useEffectiveUserId,
  useEffectivePortalConfig,
  useEffectiveClientId,
} from "./PortalViewContext"
import type { PortalConfig } from "../types/portal-builder"

export type ManagedClientRow = {
  userId: string
  label: string
  email?: string | null
  clientId: string | null
  isSelf?: boolean
}

type OfficeScopeValue = {
  clients: ManagedClientRow[]
  selectedUserId: string | null
  setSelectedUserId: (id: string) => void
  scopedPortalConfig: PortalConfig | null
  loadingClients: boolean
  loadingPortalConfig: boolean
  refreshScopedPortalConfig: () => Promise<void>
  error: string
}

/** @deprecated Use PortalViewProvider — kept for backward-compatible hooks. */
export function OfficeManagerScopeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function useOfficeManagerScopeOptional(): OfficeScopeValue | null {
  const pv = usePortalViewOptional()
  if (!pv) return null
  const clients = useMemo(
    () =>
      pv.manageableUsers.map((u) => ({
        userId: u.userId,
        label: u.label,
        email: u.email,
        clientId: u.clientId,
        isSelf: u.isSelf,
      })),
    [pv.manageableUsers],
  )
  return {
    clients,
    selectedUserId: pv.targetUserId,
    setSelectedUserId: pv.setTargetUserId,
    scopedPortalConfig: pv.effectivePortalConfig,
    loadingClients: pv.loadingUsers,
    loadingPortalConfig: pv.loadingPortalConfig,
    refreshScopedPortalConfig: pv.refreshScopedPortalConfig,
    error: pv.error,
  }
}

export function useScopedUserId(): string {
  return useEffectiveUserId()
}

export function useScopedClientId(): string {
  return useEffectiveClientId()
}

export function usePortalConfigForPage(): PortalConfig | null {
  return useEffectivePortalConfig()
}
