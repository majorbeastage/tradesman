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
import { supabase, setPortalViewWriteBlock } from "../lib/supabase"
import type { PortalConfig } from "../types/portal-builder"
import {
  canUsePortalViewBar,
  defaultPortalConfigForViewRole,
  defaultViewRoleForAuthRole,
  filterUsersForViewRole,
  isPortalViewDefaultTarget,
  portalShellForViewRole,
  PORTAL_VIEW_DEFAULT_USER,
  roleFromProfileRow,
  viewRoleOptionsForAuthRole,
  type ManageableUserRow,
  type PortalShell,
} from "../lib/portalViewRules"
import { resolveInternalMemberLabel } from "../lib/profileContactMeta"
import {
  isSandboxDemoUserId,
  parseSandboxDemoTeam,
  sandboxDemoMemberById,
  sandboxDemoTeamToManageableRows,
} from "../lib/sandboxDemoTeam"

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
  /** True when previewing a real profile other than your own (not the role default or a sandbox persona). */
  viewingOtherProfile: boolean
  /** While viewing another profile: false = view only (default), true = writes allowed. */
  editMode: boolean
  setEditMode: (on: boolean) => void
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
          label: resolveInternalMemberLabel({
            display_name: u.display_name,
            email: u.email,
            metadata: null,
          }),
          email: u.email ?? null,
          role: roleFromProfileRow(u.role),
          clientId: null as string | null,
        }))
        if (supabase && base.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, client_id, display_name, email, metadata")
            .in("id", base.map((b) => b.userId))
          const profById = new Map(
            (profs ?? []).map((p) => [
              p.id as string,
              p as { id: string; client_id: string | null; display_name?: string | null; email?: string | null; metadata?: unknown },
            ]),
          )
          return base.map((b) => {
            const prof = profById.get(b.userId)
            return {
              ...b,
              clientId: (prof?.client_id as string | null) ?? null,
              label: prof ? resolveInternalMemberLabel(prof) : b.label,
            }
          })
        }
        return base
      }
    } catch {
      /* fall through */
    }
  }
  if (!supabase) return []
  const { data } = await supabase.from("profiles").select("id, display_name, email, role, client_id, metadata")
  return (data ?? []).map((p) => ({
    userId: p.id as string,
    label: resolveInternalMemberLabel(p as { display_name?: string | null; email?: string | null; metadata?: unknown }),
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
    .select("id, display_name, email, role, client_id, metadata")
    .in("id", profileIds)
  if (e2) throw new Error(e2.message)
  const profileById = new Map(
    (profs ?? []).map((p: { id: string; display_name: string | null; email?: string | null; role: string; client_id: string | null; metadata?: unknown }) => [
      p.id,
      p,
    ]),
  )
  const selfProfile = profileById.get(authUserId)
  const selfRole = roleFromProfileRow(selfProfile?.role)
  const rows: ManageableUserRow[] = [
    {
      userId: authUserId,
      label: selfProfile ? resolveInternalMemberLabel(selfProfile) : "Me",
      email: selfProfile?.email ?? null,
      role: selfRole,
      clientId: selfProfile?.client_id ?? null,
      isSelf: true,
    },
    ...managedIds.map((managedId) => {
      const p = profileById.get(managedId)
      return {
        userId: managedId,
        label: p ? resolveInternalMemberLabel(p) : managedId.slice(0, 8) + "…",
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
  const [sandboxDemoTeam, setSandboxDemoTeam] = useState(() => parseSandboxDemoTeam(null))
  const [scopedPortalConfig, setScopedPortalConfig] = useState<PortalConfig | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingPortalConfig, setLoadingPortalConfig] = useState(false)
  const [error, setError] = useState("")
  const [editMode, setEditMode] = useState(false)

  const viewingOtherProfile = Boolean(
    showViewBar &&
      targetUserId &&
      !isPortalViewDefaultTarget(targetUserId) &&
      !isSandboxDemoUserId(targetUserId) &&
      targetUserId !== authUserId,
  )

  // View-only is the default every time a different profile is selected.
  useEffect(() => {
    setEditMode(false)
  }, [targetUserId])

  // Enforce at the Supabase fetch layer: block writes while previewing another
  // profile without Edit mode.
  useEffect(() => {
    setPortalViewWriteBlock(viewingOtherProfile && !editMode)
    return () => setPortalViewWriteBlock(false)
  }, [viewingOtherProfile, editMode])

  const viewRoleOptions = useMemo(() => viewRoleOptionsForAuthRole(authRole), [authRole])

  useEffect(() => {
    if (!authRole) return
    const nextDefault = defaultViewRoleForAuthRole(authRole)
    setViewRoleState((prev) => (viewRoleOptions.includes(prev) ? prev : nextDefault))
  }, [authRole, viewRoleOptions])

  useEffect(() => {
    if (!authUserId || authPortalConfig?.sandbox_account !== true) return
    setTargetUserIdState((prev) => {
      if (isSandboxDemoUserId(prev)) return prev
      if (prev === authUserId) return prev
      if (isPortalViewDefaultTarget(prev)) return authUserId
      return prev
    })
    try {
      sessionStorage.setItem(STORAGE_TARGET_USER, authUserId)
    } catch {
      /* ignore */
    }
  }, [authUserId, authPortalConfig?.sandbox_account])

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
        if (authPortalConfig?.sandbox_account === true && supabase) {
          const { data: metaRow } = await supabase
            .from("profiles")
            .select("metadata")
            .eq("id", authUserId)
            .maybeSingle()
          const meta =
            metaRow?.metadata && typeof metaRow.metadata === "object" && !Array.isArray(metaRow.metadata)
              ? (metaRow.metadata as Record<string, unknown>)
              : {}
          const team = parseSandboxDemoTeam(meta.sandbox_demo_team)
          setSandboxDemoTeam(team)
          rows = [...rows, ...sandboxDemoTeamToManageableRows(team)]
        } else {
          setSandboxDemoTeam(parseSandboxDemoTeam(null))
        }
        if (cancelled) return
        setManageableUsers(rows)
        setTargetUserIdState((prev) => {
          if (isPortalViewDefaultTarget(prev)) return PORTAL_VIEW_DEFAULT_USER
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
  }, [authUserId, authRole, session?.access_token, user?.email, authPortalConfig?.sandbox_account])

  useEffect(() => {
    if (!isSandboxDemoUserId(targetUserId)) return
    const member = sandboxDemoMemberById(sandboxDemoTeam, targetUserId)
    if (!member || !viewRoleOptions.includes(member.role)) return
    if (viewRole === member.role) return
    setViewRoleState(member.role)
    try {
      sessionStorage.setItem(STORAGE_VIEW_ROLE, member.role)
    } catch {
      /* ignore */
    }
  }, [targetUserId, sandboxDemoTeam, viewRole, viewRoleOptions])

  const usersForCurrentViewRole = useMemo(
    () => filterUsersForViewRole(manageableUsers, viewRole),
    [manageableUsers, viewRole],
  )

  useEffect(() => {
    if (isPortalViewDefaultTarget(targetUserId)) return
    if (viewRole === authRole && targetUserId === authUserId) return
    if (targetUserId && usersForCurrentViewRole.some((u) => u.userId === targetUserId)) return
    if (viewRole === authRole) {
      setTargetUserIdState(authUserId)
      return
    }
    setTargetUserIdState(PORTAL_VIEW_DEFAULT_USER)
  }, [usersForCurrentViewRole, targetUserId, authUserId, viewRole, authRole])

  const setViewRole = useCallback(
    (role: UserRole) => {
      if (!viewRoleOptions.includes(role)) return
      setViewRoleState(role)
      const nextTarget =
        role === authRole && authUserId ? authUserId : PORTAL_VIEW_DEFAULT_USER
      setTargetUserIdState(nextTarget)
      try {
        sessionStorage.setItem(STORAGE_VIEW_ROLE, role)
        sessionStorage.setItem(STORAGE_TARGET_USER, nextTarget)
      } catch {
        /* ignore */
      }
    },
    [viewRoleOptions, authRole, authUserId],
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
    if (!uid || !supabase || isPortalViewDefaultTarget(uid)) {
      setScopedPortalConfig(null)
      return
    }
    if (isSandboxDemoUserId(uid)) {
      const member = sandboxDemoMemberById(sandboxDemoTeam, uid)
      setScopedPortalConfig(defaultPortalConfigForViewRole(member?.role ?? "user"))
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
  }, [targetUserId, authUserId, showViewBar, authPortalConfig, sandboxDemoTeam])

  useEffect(() => {
    void refreshScopedPortalConfig()
  }, [refreshScopedPortalConfig])

  const effectivePortalConfig = useMemo(() => {
    if (!showViewBar) return authPortalConfig
    if (targetUserId === authUserId && viewRole === authRole) return authPortalConfig
    if (isPortalViewDefaultTarget(targetUserId) && viewRole === authRole && authPortalConfig) {
      return authPortalConfig
    }
    if (isPortalViewDefaultTarget(targetUserId)) return defaultPortalConfigForViewRole(viewRole)
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
      viewingOtherProfile,
      editMode,
      setEditMode,
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
      viewingOtherProfile,
      editMode,
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
  if (ctx?.showViewBar && ctx.targetUserId && !isPortalViewDefaultTarget(ctx.targetUserId)) {
    if (isSandboxDemoUserId(ctx.targetUserId)) return userId
    return ctx.targetUserId
  }
  return userId
}

export function useEffectivePortalConfig(): PortalConfig | null {
  const { portalConfig } = useAuth()
  const ctx = useContext(PortalViewContext)
  if (ctx?.showViewBar) return ctx.effectivePortalConfig ?? portalConfig
  return portalConfig
}

/** True when an admin/manager is previewing a real profile other than their own. */
export function useViewingOtherProfile(): boolean {
  const ctx = useContext(PortalViewContext)
  return ctx?.viewingOtherProfile ?? false
}

/**
 * True while previewing another profile with Edit mode off. Use to hide/disable
 * write actions in the UI; the Supabase fetch guard is the hard backstop.
 */
export function usePortalViewReadOnly(): boolean {
  const ctx = useContext(PortalViewContext)
  if (!ctx) return false
  return ctx.viewingOtherProfile && !ctx.editMode
}

export function useEffectiveClientId(): string {
  const { clientId } = useAuth()
  const ctx = useContext(PortalViewContext)
  if (ctx?.showViewBar && ctx.targetUserId && !isPortalViewDefaultTarget(ctx.targetUserId)) {
    const row = ctx.manageableUsers.find((u) => u.userId === ctx.targetUserId)
    if (row?.clientId) return row.clientId
  }
  return clientId
}
