import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { resolveOrgRosterOwnerId } from "../lib/accountStructureOwner"
import { isOfficeManagerAssignmentRole } from "../lib/profileRoles"
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
  /** Reload view-as user list after Admin OM assign or Team members change. */
  refreshManageableUsers: () => Promise<void>
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

const ADMIN_ACCOUNT_OWNERS_CACHE_MS = 5 * 60 * 1000
let adminAccountOwnersCache: {
  token: string
  at: number
  rows: ManageableUserRow[]
} | null = null

function invalidateAdminAccountOwnersCache(): void {
  adminAccountOwnersCache = null
}

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

function writeStoredTargetUser(id: string | null): void {
  try {
    if (!id) sessionStorage.removeItem(STORAGE_TARGET_USER)
    else sessionStorage.setItem(STORAGE_TARGET_USER, id)
  } catch {
    /* ignore */
  }
}

async function loadAdminAccountOwners(accessToken: string): Promise<ManageableUserRow[]> {
  const now = Date.now()
  if (
    adminAccountOwnersCache &&
    adminAccountOwnersCache.token === accessToken &&
    now - adminAccountOwnersCache.at < ADMIN_ACCOUNT_OWNERS_CACHE_MS
  ) {
    return adminAccountOwnersCache.rows
  }

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
        let rows = base
        if (supabase && base.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, client_id")
            .in("id", base.map((b) => b.userId))
          const clientById = new Map(
            (profs ?? []).map((p) => [p.id as string, (p.client_id as string | null) ?? null]),
          )
          rows = base.map((b) => ({
            ...b,
            clientId: clientById.get(b.userId) ?? null,
          }))
        }
        adminAccountOwnersCache = { token: accessToken, at: now, rows }
        return rows
      }
    } catch {
      /* fall through */
    }
  }
  return []
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

/** Admin view-as: account owners to switch business; org roster merged separately (no full reload loop). */
async function loadAdminOrgScopedUsers(
  authUserId: string,
  targetUserId: string | null,
  accessToken: string,
  selfRow?: ManageableUserRow | null,
): Promise<ManageableUserRow[]> {
  const all = await loadAdminAccountOwners(accessToken)
  const accountOwners = all.filter(
    (u) => isOfficeManagerAssignmentRole(u.role) || u.role === "corporate_management",
  )

  const withSelf = (rows: ManageableUserRow[]): ManageableUserRow[] => {
    const ids = new Set(rows.map((r) => r.userId))
    const out = rows.map((r) => ({ ...r, isSelf: r.userId === authUserId }))
    if (selfRow && !ids.has(selfRow.userId)) {
      out.unshift({ ...selfRow, isSelf: true })
    } else if (!ids.has(authUserId) && selfRow) {
      out.unshift({ ...selfRow, isSelf: true })
    }
    return out
  }

  let orgOwnerId: string | null = null
  if (
    targetUserId &&
    !isPortalViewDefaultTarget(targetUserId) &&
    !isSandboxDemoUserId(targetUserId) &&
    targetUserId !== authUserId &&
    supabase
  ) {
    try {
      orgOwnerId = await resolveOrgRosterOwnerId(supabase, targetUserId)
    } catch {
      orgOwnerId = null
    }
  }

  if (orgOwnerId && supabase) {
    const orgRows = await loadManagedOrgUsers(orgOwnerId)
    const orgIds = new Set(orgRows.map((r) => r.userId))
    const switchTargets = accountOwners.filter((o) => !orgIds.has(o.userId))
    return withSelf([
      ...orgRows.map((r) => ({ ...r, isSelf: r.userId === authUserId })),
      ...switchTargets.map((r) => ({ ...r, isSelf: r.userId === authUserId })),
    ])
  }

  return withSelf(accountOwners)
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
  const targetValidatedRef = useRef<string | null>(null)
  const adminSelfRowRef = useRef<ManageableUserRow | null>(null)
  const lastOrgOwnerRef = useRef<string | null>(null)
  const adminTargetHydratedRef = useRef(false)

  // Platform admin: start as self — do not restore a stale view-as id from sessionStorage.
  useEffect(() => {
    if (!authUserId || authRole !== "admin") return
    if (adminTargetHydratedRef.current) return
    adminTargetHydratedRef.current = true
    setTargetUserIdState((prev) => {
      if (prev === authUserId || isSandboxDemoUserId(prev)) return prev ?? authUserId
      writeStoredTargetUser(authUserId)
      return authUserId
    })
  }, [authUserId, authRole])

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
      adminSelfRowRef.current = null
      lastOrgOwnerRef.current = null
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingUsers(true)
      setError("")
      try {
        const selfRow: ManageableUserRow = {
          userId: authUserId,
          label: user?.email ? resolveInternalMemberLabel({ display_name: null, email: user.email, metadata: null }) : "Me",
          email: user?.email ?? null,
          role: authRole ?? "user",
          clientId: null,
          isSelf: true,
        }
        if (authRole === "admin") adminSelfRowRef.current = selfRow

        let rows: ManageableUserRow[] = []
        if (authRole === "admin" && session?.access_token) {
          rows = await loadAdminOrgScopedUsers(authUserId, authUserId, session.access_token, selfRow)
          lastOrgOwnerRef.current = null
        } else if (authRole === "corporate_management" || authRole === "office_manager") {
          rows = await loadManagedOrgUsers(authUserId)
        } else if (authRole) {
          rows = [selfRow]
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

  // Admin: merge org roster when view-as target changes — without toggling loadingUsers (avoids bar loop).
  useEffect(() => {
    if (authRole !== "admin" || !authUserId || !session?.access_token) return
    if (!targetUserId || isPortalViewDefaultTarget(targetUserId) || isSandboxDemoUserId(targetUserId)) {
      lastOrgOwnerRef.current = null
      return
    }
    if (targetUserId === authUserId) {
      lastOrgOwnerRef.current = null
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        let orgOwnerId: string | null = null
        if (supabase) {
          orgOwnerId = await resolveOrgRosterOwnerId(supabase, targetUserId)
        }
        if (cancelled || orgOwnerId === lastOrgOwnerRef.current) return
        lastOrgOwnerRef.current = orgOwnerId
        const rows = await loadAdminOrgScopedUsers(
          authUserId,
          targetUserId,
          session.access_token,
          adminSelfRowRef.current,
        )
        if (!cancelled) setManageableUsers(rows)
      } catch {
        /* keep prior list */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authRole, authUserId, session?.access_token, targetUserId])

  const refreshManageableUsers = useCallback(async () => {
    if (!authUserId) {
      setManageableUsers([])
      return
    }
    invalidateAdminAccountOwnersCache()
    setLoadingUsers(true)
    setError("")
    try {
      let rows: ManageableUserRow[] = []
      if (authRole === "admin" && session?.access_token) {
        rows = await loadAdminOrgScopedUsers(authUserId, targetUserId, session.access_token, adminSelfRowRef.current)
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
      }
      setManageableUsers(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.")
    } finally {
      setLoadingUsers(false)
    }
  }, [authUserId, authRole, session?.access_token, user?.email, authPortalConfig?.sandbox_account, targetUserId])

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
    if (loadingUsers) return
    const validationKey = `${viewRole}:${targetUserId ?? ""}:${usersForCurrentViewRole.map((u) => u.userId).join(",")}`
    if (targetValidatedRef.current === validationKey) return

    if (isPortalViewDefaultTarget(targetUserId)) {
      targetValidatedRef.current = validationKey
      return
    }
    if (viewRole === authRole && targetUserId === authUserId) {
      targetValidatedRef.current = validationKey
      return
    }
    if (targetUserId && usersForCurrentViewRole.some((u) => u.userId === targetUserId)) {
      targetValidatedRef.current = validationKey
      return
    }
    // Also accept target if present in full manageable list (role filter may lag).
    if (targetUserId && manageableUsers.some((u) => u.userId === targetUserId)) {
      targetValidatedRef.current = validationKey
      return
    }

    targetValidatedRef.current = validationKey
    if (viewRole === authRole && authUserId) {
      setTargetUserIdState(authUserId)
      writeStoredTargetUser(authUserId)
      return
    }
    setTargetUserIdState(PORTAL_VIEW_DEFAULT_USER)
    writeStoredTargetUser(PORTAL_VIEW_DEFAULT_USER)
  }, [usersForCurrentViewRole, manageableUsers, targetUserId, authUserId, viewRole, authRole, loadingUsers])

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
    targetValidatedRef.current = null
    lastOrgOwnerRef.current = null
    setTargetUserIdState(id)
    writeStoredTargetUser(id)
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
      refreshManageableUsers,
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
      refreshManageableUsers,
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
