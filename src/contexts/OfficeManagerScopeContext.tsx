import { type ReactNode, useEffect, useMemo, useState } from "react"
import {
  usePortalViewOptional,
  useEffectiveUserId,
  useEffectivePortalConfig,
  useEffectiveClientId,
} from "./PortalViewContext"
import type { PortalConfig } from "../types/portal-builder"
import { isPortalViewDefaultTarget, type ManageableUserRow } from "../lib/portalViewRules"
import { supabase } from "../lib/supabase"
import {
  loadOrganizationPeers,
  mergeOrganizationPeersIntoManageableRows,
  type OrganizationPeer,
} from "../lib/organizationPeers"

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
  const [orgPeers, setOrgPeers] = useState<OrganizationPeer[]>([])

  useEffect(() => {
    if (!supabase || !pv?.authUserId) {
      setOrgPeers([])
      return
    }
    let cancelled = false
    void loadOrganizationPeers(supabase, pv.authUserId)
      .then((peers) => {
        if (!cancelled) setOrgPeers(peers)
      })
      .catch(() => {
        if (!cancelled) setOrgPeers([])
      })
    return () => {
      cancelled = true
    }
  }, [pv?.authUserId])

  const rosterSource = useMemo((): ManageableUserRow[] => {
    if (!pv) return []

    let base: ManageableUserRow[]
    let mergePeers = false

    if (pv.authRole === "admin") {
      if (pv.orgScopedUsers.length > 0) {
        base = pv.orgScopedUsers
      } else if (pv.viewingOtherProfile && pv.targetUserId) {
        const target =
          pv.manageableUsers.find((u) => u.userId === pv.targetUserId) ??
          pv.orgScopedUsers.find((u) => u.userId === pv.targetUserId)
        base = target ? [target] : []
      } else {
        base = pv.manageableUsers.filter((u) => u.userId === pv.authUserId)
        mergePeers = true
      }
    } else {
      base = pv.manageableUsers
      mergePeers = true
    }

    if (!mergePeers || orgPeers.length === 0) return base
    return mergeOrganizationPeersIntoManageableRows(base, orgPeers, pv.authUserId)
  }, [pv, orgPeers])

  const clients = useMemo(
    () =>
      rosterSource.map((u) => ({
        userId: u.userId,
        label: u.label,
        email: u.email,
        clientId: u.clientId,
        isSelf: u.isSelf,
      })),
    [rosterSource],
  )
  if (!pv) return null
  return {
    clients,
    selectedUserId: isPortalViewDefaultTarget(pv.targetUserId) ? null : pv.targetUserId,
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
