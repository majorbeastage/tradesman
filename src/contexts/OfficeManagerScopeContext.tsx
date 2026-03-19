import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "./AuthContext"
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
  /** Managed user's portal_config while in office manager portal */
  scopedPortalConfig: PortalConfig | null
  loadingClients: boolean
  loadingPortalConfig: boolean
  refreshScopedPortalConfig: () => Promise<void>
  error: string
}

const OfficeManagerScopeContext = createContext<OfficeScopeValue | null>(null)

export function OfficeManagerScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [clients, setClients] = useState<ManagedClientRow[]>([])
  const [selectedUserId, setSelectedUserIdState] = useState<string | null>(null)
  const [scopedPortalConfig, setScopedPortalConfig] = useState<PortalConfig | null>(null)
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingPortalConfig, setLoadingPortalConfig] = useState(false)
  const [error, setError] = useState("")

  const setSelectedUserId = useCallback((id: string) => {
    setSelectedUserIdState(id)
  }, [])

  useEffect(() => {
    if (!user?.id || !supabase) {
      setClients([])
      setLoadingClients(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingClients(true)
      setError("")
      const { data: links, error: e1 } = await supabase
        .from("office_manager_clients")
        .select("user_id")
        .eq("office_manager_id", user.id)
      if (cancelled) return
      if (e1) {
        setError(e1.message)
        setClients([])
        setSelectedUserIdState(null)
        setLoadingClients(false)
        return
      }
      const ids = (links ?? []).map((l: { user_id: string }) => l.user_id)
      const profileIds = Array.from(new Set([user.id, ...ids]))
      const { data: profs, error: e2 } = await supabase
        .from("profiles")
        .select("id, display_name, email, client_id")
        .in("id", profileIds)
      if (cancelled) return
      if (e2) {
        setError(e2.message)
        setClients([])
        setLoadingClients(false)
        return
      }
      const profileById = new Map(
        (profs ?? []).map((p: { id: string; display_name: string | null; email?: string | null; client_id: string | null }) => [p.id, p])
      )
      const selfProfile = profileById.get(user.id)
      const rows: ManagedClientRow[] = [
        {
          userId: user.id,
          label: `${selfProfile?.display_name?.trim() || "Office manager"} (me)`,
          email: selfProfile?.email ?? null,
          clientId: selfProfile?.client_id ?? null,
          isSelf: true,
        },
        ...ids.map((managedId) => {
          const p = profileById.get(managedId)
          return {
            userId: managedId,
            label: p?.display_name?.trim() || managedId.slice(0, 8) + "…",
            email: p?.email ?? null,
            clientId: p?.client_id ?? null,
          }
        }),
      ]
      setClients(rows)
      setSelectedUserIdState((prev) => {
        if (prev && rows.some((r) => r.userId === prev)) return prev
        return user.id
      })
      setLoadingClients(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const refreshScopedPortalConfig = useCallback(async () => {
    if (!selectedUserId || !supabase) {
      setScopedPortalConfig(null)
      return
    }
    setLoadingPortalConfig(true)
    const { data, error: err } = await supabase.from("profiles").select("portal_config").eq("id", selectedUserId).single()
    setLoadingPortalConfig(false)
    if (err || !data) {
      setScopedPortalConfig({})
      return
    }
    const raw = data.portal_config
    setScopedPortalConfig(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PortalConfig) : {})
  }, [selectedUserId])

  useEffect(() => {
    void refreshScopedPortalConfig()
  }, [refreshScopedPortalConfig])

  const value = useMemo(
    () => ({
      clients,
      selectedUserId,
      setSelectedUserId,
      scopedPortalConfig,
      loadingClients,
      loadingPortalConfig,
      refreshScopedPortalConfig,
      error,
    }),
    [
      clients,
      selectedUserId,
      setSelectedUserId,
      scopedPortalConfig,
      loadingClients,
      loadingPortalConfig,
      refreshScopedPortalConfig,
      error,
    ]
  )

  return <OfficeManagerScopeContext.Provider value={value}>{children}</OfficeManagerScopeContext.Provider>
}

export function useOfficeManagerScopeOptional(): OfficeScopeValue | null {
  return useContext(OfficeManagerScopeContext)
}

/** Data rows (quotes, calendar, …): managed user when in office manager scope, else signed-in user. */
export function useScopedUserId(): string {
  const { userId } = useAuth()
  const ctx = useContext(OfficeManagerScopeContext)
  if (ctx?.selectedUserId) return ctx.selectedUserId
  return userId
}

/** Settings custom fields: managed user's client_id when scoped. */
export function useScopedClientId(): string {
  const { clientId } = useAuth()
  const ctx = useContext(OfficeManagerScopeContext)
  if (ctx?.selectedUserId) {
    const row = ctx.clients.find((c) => c.userId === ctx.selectedUserId)
    if (row?.clientId) return row.clientId
  }
  return clientId
}

/** Portal builder visibility: managed user's config in office manager portal. */
export function usePortalConfigForPage(): PortalConfig | null {
  const { portalConfig } = useAuth()
  const ctx = useContext(OfficeManagerScopeContext)
  return ctx?.scopedPortalConfig ?? portalConfig
}
