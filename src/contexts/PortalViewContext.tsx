import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useAuth, type UserRole } from "./AuthContext"
import { supabase } from "../lib/supabase"
import type { PortalConfig } from "../types/portal-builder"
import {
  canUsePortalViewBar,
  defaultViewRoleForAuthRole,
  filterUsersForViewRole,
  portalShellForViewRole,
  roleFromProfileRow,
  viewRoleOptionsForAuthRole,
  type ManageableUserRow,
  type PortalShell,
} from "../lib/portalViewRules"

const STORAGE_VIEW_ROLE = "tradesman_portal_view_role"
const STORAGE_TARGET_USER = "tradesman_portal_target_user"

type PortalViewValue = {
  authRole: UserRole | null
  authUserId: string | null
  viewRole: UserRole
  setViewRole: (role: UserRole) => void
  targetUserId: string | null
  setTargetUserId: (id: string) => void
  manageableUsers: ManageableUserRow[]
  usersForCurrentViewRole: ManageableUserRow[]
  viewRoleOptions: UserRole[]
  effectiveShell: PortalShell
  effectivePortalConfig: PortalConfig | null
  loadingUsers: boolean
  loadingPortalConfig: boolean
  refreshScopedPortalConfig: () => Promise<void>
  error: string
  showViewBar: boolean
}

const PortalViewContext = createContext<PortalViewValue | null>(null)

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""

function readStoredViewRole(fallback: UserRole): UserRole {
  try {
    const raw = sessionStorage.getItem(STORAGE_VIEW_ROLE)
    if (raw && raw.trim()) return raw.trim() as UserRole
  } catch {
    /* ignore */
  }
  return fallback
}

function readStoredTargetUser(fallback: string | null): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_TARGET_USER)
    if (raw && raw.trim()) return raw.trim()
  } catch {
    /* ignore */
  }
  return fallback
}

async function loadAllUsersForAdmin(accessToken: string): Promise<ManageableUserRow[]> {
  if (supabaseUrl) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = (await res.json().catch(() => ({}))) as {
        users?: Array<{ id: string; email?: string | null; display_name?: string | null; role?: string }>
      }
      if (res.ok && Array.isArray(data.users)) {
        const base = data.users.map((u) => ({
          userId: u.id,
          label: u.display_name?.trim() || u.email?.trim() || u.id.slice(0, 8) + "…",
          email: u.email ?? null,
          role: roleFromProfileRow(u.role),
          clientId: null as string | null,
        }))
        if (supabase && base.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, client_id")
            .in("id", base.map((b) => b.userId))
          const cidById = new Map((profs ?? []).map((p) => [p.id as string, (p.client_id as string | null) ?? null]))
          return base.map((b) => ({ ...b, clientId: cidById.get(b.userId) ?? null }))
        }
        return base
      }
    } catch {
      /* fall through */
    }
  }
  if (!supabase) return []
  const { data } = await supabase.from("profiles").select("id, display_name, email, role, client_id")
  return (data ?? []).map((p) => ({
    userId: p.id as string,
    label: (p.display_name as string | null)?.trim() || (p.email as string | null)?.trim() || (p.id as string).slice(0, 8) + "…",
    email: (p.email as string | null) ?? null,
    role: roleFromProfileRow(p.role as string),
    clientId: (p.client_id as string | null) ?? null,
  }))
}

async function loadManagedOrgUsers(authUserId: string): Promise<ManageableUserRow[]> {
  if (!supabase) return []
  const { data: links, error: e1 } = await supabase
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", authUserId)
  if (e1) throw new Error(e1.message)
  const managedIds = (links ?? []).map((l: { user_id: string }) => l.user_id)
  const profileIds = Array.from(new Set([authUserId, ...managedIds]))
  const { data: profs, error: e2 } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, client_id")
    .in("id", profileIds)
  if (e2) throw new Error(e2.message)
  const profileById = new Map(
    (profs ?? []).map((p: { id: string; display_name: string | null; email?: string | null; role: string; client_id: string | null }) => [
      p.id,
      p,
    ]),
  )
  const selfProfile = profileById.get(authUserId)
  const selfRole = roleFromProfileRow(selfProfile?.role)
  const rows: ManageableUserRow[] = [
    {
      userId: authUserId,
      label: selfProfile?.display_name?.trim() || "Me",
      email: selfProfile?.email ?? null,
      role: selfRole,
      clientId: selfProfile?.client_id ?? null,
      isSelf: true,
    },
    ...managedIds.map((managedId) => {
      const p = profileById.get(managedId)
      return {
        userId: managedId,
        label: p?.display_name?.trim() || managedId.slice(0, 8) + "…",
        email: p?.email ?? null,
        role: roleFromProfileRow(p?.role),
        clientId: p?.client_id ?? null,
      }
    }),
  ]
  return rows
}

type Props = {
  children: ReactNode
  /** Sync app vs office shell when preview role changes. */
  onShellChange?: (shell: PortalShell) => void
}

export function PortalViewProvider({ children, onShellChange }: Props) {
  const { user, role: authRole, session, portalConfig: authPortalConfig } = useAuth()
  const authUserId = user?.id ?? null
  const showViewBar = canUsePortalViewBar(authRole)

  const defaultRole = defaultViewRoleForAuthRole(authRole)
  const [viewRole, setViewRoleState] = useState<UserRole>(() => readStoredViewRole(defaultRole))
  const [targetUserId, setTargetUserIdState] = useState<string | null>(() =>
    readStoredTargetUser(authUserId),
  )
  const [manageableUsers, setManageableUsers] = useState<ManageableUserRow[]>([])
  const [scopedPortalConfig, setScopedPortalConfig] = useState<PortalConfig | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingPortalConfig, setLoadingPortalConfig] = useState(false)
  const [error, setError] = useState("")

  const viewRoleOptions = useMemo(() => viewRoleOptionsForAuthRole(authRole), [authRole])

  useEffect(() => {
    if (!authRole) return
    const nextDefault = defaultViewRoleForAuthRole(authRole)
    setViewRoleState((prev) => (viewRoleOptions.includes(prev) ? prev : nextDefault))
  }, [authRole, viewRoleOptions])

  useEffect(() => {
    if (!authUserId) {
      setManageableUsers([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingUsers(true)
      setError("")
      try {
        let rows: ManageableUserRow[] = []
        if (authRole === "admin" && session?.access_token) {
          rows = await loadAllUsersForAdmin(session.access_token)
          rows = rows.map((r) => ({ ...r, isSelf: r.userId === authUserId }))
        } else if (authRole === "corporate_management" || authRole === "office_manager") {
          rows = await loadManagedOrgUsers(authUserId)
        } else if (authRole) {
          rows = [
            {
              userId: authUserId,
              label: "Me",
              email: user?.email ?? null,
              role: authRole,
              clientId: null,
              isSelf: true,
            },
          ]
        }
        if (cancelled) return
        setManageableUsers(rows)
        setTargetUserIdState((prev) => {
          if (prev && rows.some((r) => r.userId === prev)) return prev
          return authUserId
        })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load users.")
          setManageableUsers([])
        }
      } finally {
        if (!cancelled) setLoadingUsers(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authUserId, authRole, session?.access_token, user?.email])

  const usersForCurrentViewRole = useMemo(
    () => filterUsersForViewRole(manageableUsers, viewRole),
    [manageableUsers, viewRole],
  )

  useEffect(() => {
    if (usersForCurrentViewRole.length === 0) return
    if (!targetUserId || !usersForCurrentViewRole.some((u) => u.userId === targetUserId)) {
      const self = usersForCurrentViewRole.find((u) => u.isSelf)
      setTargetUserIdState(self?.userId ?? usersForCurrentViewRole[0]?.userId ?? authUserId)
    }
  }, [usersForCurrentViewRole, targetUserId, authUserId])

  const setViewRole = useCallback(
    (role: UserRole) => {
      if (!viewRoleOptions.includes(role)) return
      setViewRoleState(role)
      try {
        sessionStorage.setItem(STORAGE_VIEW_ROLE, role)
      } catch {
        /* ignore */
      }
    },
    [viewRoleOptions],
  )

  const setTargetUserId = useCallback((id: string) => {
    setTargetUserIdState(id)
    try {
      sessionStorage.setItem(STORAGE_TARGET_USER, id)
    } catch {
      /* ignore */
    }
  }, [])

  const effectiveShell = portalShellForViewRole(viewRole)

  useEffect(() => {
    onShellChange?.(effectiveShell)
  }, [effectiveShell, onShellChange])

  const refreshScopedPortalConfig = useCallback(async () => {
    const uid = targetUserId
    if (!uid || !supabase) {
      setScopedPortalConfig(null)
      return
    }
    if (uid === authUserId && !showViewBar) {
      setScopedPortalConfig(authPortalConfig)
      return
    }
    setLoadingPortalConfig(true)
    const { data, error: err } = await supabase.from("profiles").select("portal_config").eq("id", uid).maybeSingle()
    setLoadingPortalConfig(false)
    if (err || !data) {
      setScopedPortalConfig({})
      return
    }
    const raw = data.portal_config
    setScopedPortalConfig(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PortalConfig) : {})
  }, [targetUserId, authUserId, showViewBar, authPortalConfig])

  useEffect(() => {
    void refreshScopedPortalConfig()
  }, [refreshScopedPortalConfig])

  const effectivePortalConfig = useMemo(() => {
    if (!showViewBar) return authPortalConfig
    if (targetUserId === authUserId && viewRole === authRole) return authPortalConfig
    return scopedPortalConfig ?? authPortalConfig
  }, [showViewBar, targetUserId, authUserId, viewRole, authRole, scopedPortalConfig, authPortalConfig])

  const value = useMemo<PortalViewValue>(
    () => ({
      authRole,
      authUserId,
      viewRole,
      setViewRole,
      targetUserId,
      setTargetUserId,
      manageableUsers,
      usersForCurrentViewRole,
      viewRoleOptions,
      effectiveShell,
      effectivePortalConfig,
      loadingUsers,
      loadingPortalConfig,
      refreshScopedPortalConfig,
      error,
      showViewBar,
    }),
    [
      authRole,
      authUserId,
      viewRole,
      setViewRole,
      targetUserId,
      setTargetUserId,
      manageableUsers,
      usersForCurrentViewRole,
      viewRoleOptions,
      effectiveShell,
      effectivePortalConfig,
      loadingUsers,
      loadingPortalConfig,
      refreshScopedPortalConfig,
      error,
      showViewBar,
    ],
  )

  return <PortalViewContext.Provider value={value}>{children}</PortalViewContext.Provider>
}

export function usePortalViewOptional(): PortalViewValue | null {
  return useContext(PortalViewContext)
}

export function usePortalView(): PortalViewValue {
  const ctx = useContext(PortalViewContext)
  if (!ctx) throw new Error("usePortalView requires PortalViewProvider")
  return ctx
}

/** Data scope: preview target when view bar active, else signed-in user. */
export function useEffectiveUserId(): string {
  const { userId } = useAuth()
  const ctx = useContext(PortalViewContext)
  if (ctx?.showViewBar && ctx.targetUserId) return ctx.targetUserId
  return userId
}

export function useEffectivePortalConfig(): PortalConfig | null {
  const { portalConfig } = useAuth()
  const ctx = useContext(PortalViewContext)
  if (ctx?.showViewBar) return ctx.effectivePortalConfig ?? portalConfig
  return portalConfig
}

export function useEffectiveClientId(): string {
  const { clientId } = useAuth()
  const ctx = useContext(PortalViewContext)
  if (ctx?.showViewBar && ctx.targetUserId) {
    const row = ctx.manageableUsers.find((u) => u.userId === ctx.targetUserId)
    if (row?.clientId) return row.clientId
  }
  return clientId
}
