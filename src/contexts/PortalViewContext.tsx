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
import { loadOrgManageableUserRows } from "../lib/orgRoster"
import { isOfficeManagerAssignmentRole } from "../lib/profileRoles"
import {
  isSandboxDemoUserId,
  parseSandboxDemoTeam,
  sandboxDemoMemberById,
  sandboxDemoTeamToManageableRows,
  type SandboxDemoTeamMember,
} from "../lib/sandboxDemoTeam"
import { isSandboxProfile } from "../lib/sandboxEnvironment"

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
  /** Team roster for the organization being previewed (no platform account-owner switch list). */
  orgScopedUsers: ManageableUserRow[]
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
  userId: string
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

/** Profile row that owns sandbox demo personas for the current view-as selection. */
function resolveDemoTeamSourceUserId(authUserId: string, targetUserId: string | null): string {
  if (targetUserId && isSandboxDemoUserId(targetUserId)) return authUserId
  if (
    targetUserId &&
    !isPortalViewDefaultTarget(targetUserId) &&
    targetUserId !== authUserId
  ) {
    return targetUserId
  }
  return authUserId
}

async function loadSandboxDemoTeamForProfile(profileUserId: string): Promise<SandboxDemoTeamMember[]> {
  if (!supabase || !profileUserId) return []
  const { data } = await supabase
    .from("profiles")
    .select("portal_config, metadata, role")
    .eq("id", profileUserId)
    .maybeSingle()
  const portalConfig =
    data?.portal_config && typeof data.portal_config === "object" && !Array.isArray(data.portal_config)
      ? (data.portal_config as PortalConfig)
      : null
  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null
  if (!isSandboxProfile(portalConfig, metadata, data?.role)) return []
  return parseSandboxDemoTeam(metadata?.sandbox_demo_team)
}

function appendSandboxDemoRows(
  rows: ManageableUserRow[],
  team: SandboxDemoTeamMember[],
): ManageableUserRow[] {
  if (!team.length) return rows
  const ids = new Set(rows.map((r) => r.userId))
  const demoRows = sandboxDemoTeamToManageableRows(team).filter((r) => !ids.has(r.userId))
  return demoRows.length ? [...rows, ...demoRows] : rows
}

async function loadAdminAccountOwners(accessToken: string, cacheUserId: string): Promise<ManageableUserRow[]> {
  const now = Date.now()
  if (
    adminAccountOwnersCache &&
    adminAccountOwnersCache.userId === cacheUserId &&
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
        adminAccountOwnersCache = { userId: cacheUserId, at: now, rows }
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
  return loadOrgManageableUserRows(supabase, authUserId, { markSelfUserId: authUserId })
}

/** Field users / invite shells: load the account owner's org roster when linked to an OM. */
async function loadEndUserManageableRows(
  authUserId: string,
  selfRow: ManageableUserRow,
): Promise<ManageableUserRow[]> {
  if (!supabase) return [selfRow]
  try {
    const ownerId = await resolveOrgRosterOwnerId(supabase, authUserId)
    if (ownerId !== authUserId) {
      return loadOrgManageableUserRows(supabase, ownerId, { markSelfUserId: authUserId })
    }
  } catch {
    /* keep self-only roster */
  }
  return [selfRow]
}

/** Admin view-as: account owners to switch business; org roster merged separately (no full reload loop). */
async function loadAdminOrgScopedUsers(
  authUserId: string,
  targetUserId: string | null,
  accessToken: string,
  selfRow?: ManageableUserRow | null,
  preResolvedOrgOwnerId?: string | null,
): Promise<{ rows: ManageableUserRow[]; orgRows: ManageableUserRow[] }> {
  const all = await loadAdminAccountOwners(accessToken, authUserId)
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

  let orgOwnerId: string | null = preResolvedOrgOwnerId ?? null
  if (
    orgOwnerId == null &&
    targetUserId &&
    !isPortalViewDefaultTarget(targetUserId) &&
    !isSandboxDemoUserId(targetUserId) &&
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
    return { rows: withSelf([
      ...orgRows.map((r) => ({ ...r, isSelf: r.userId === authUserId })),
      ...switchTargets.map((r) => ({ ...r, isSelf: r.userId === authUserId })),
    ]), orgRows }
  }

  return { rows: withSelf(accountOwners), orgRows: [] as ManageableUserRow[] }
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
  const [orgScopedUsers, setOrgScopedUsers] = useState<ManageableUserRow[]>([])
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
  const accessTokenRef = useRef<string | null>(null)
  const usersLoadSeqRef = useRef(0)
  const usersLoadedOnceRef = useRef(false)
  const usersLoadKeyRef = useRef("")

  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null
  }, [session?.access_token])

  /** Boolean only — avoids reloading the whole roster on every JWT refresh. */
  const hasAccessToken = Boolean(session?.access_token)

  // Platform admin: restore last view-as target from session when valid; otherwise default to self.
  useEffect(() => {
    if (!authUserId || authRole !== "admin") return
    if (adminTargetHydratedRef.current) return
    adminTargetHydratedRef.current = true
    setTargetUserIdState((prev) => {
      if (prev && !isPortalViewDefaultTarget(prev) && !isSandboxDemoUserId(prev) && prev !== authUserId) {
        return prev
      }
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
      usersLoadedOnceRef.current = false
      usersLoadKeyRef.current = ""
      setLoadingUsers(false)
      return
    }
    if (authRole === "admin" && !hasAccessToken) return

    const loadKey = `${authUserId}:${authRole ?? ""}:${targetUserId ?? ""}`
    if (usersLoadKeyRef.current !== loadKey) {
      usersLoadedOnceRef.current = false
      usersLoadKeyRef.current = loadKey
    }

    const loadSeq = ++usersLoadSeqRef.current
    const showSpinner = !usersLoadedOnceRef.current
    if (showSpinner) setLoadingUsers(true)
    setError("")
    ;(async () => {
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

        const token = accessTokenRef.current
        let rows: ManageableUserRow[] = []
        let orgRows: ManageableUserRow[] = []
        if (authRole === "admin" && token) {
          const loaded = await loadAdminOrgScopedUsers(authUserId, targetUserId, token, selfRow)
          rows = loaded.rows
          orgRows = loaded.orgRows
        } else if (authRole === "corporate_management" || authRole === "office_manager") {
          rows = await loadManagedOrgUsers(authUserId)
          orgRows = rows
        } else if (authRole) {
          rows = await loadEndUserManageableRows(authUserId, selfRow)
          orgRows = rows
        }
        const demoSourceId = resolveDemoTeamSourceUserId(authUserId, targetUserId)
        const team = await loadSandboxDemoTeamForProfile(demoSourceId)
        setSandboxDemoTeam(team)
        rows = appendSandboxDemoRows(rows, team)
        orgRows = appendSandboxDemoRows(orgRows, team)
        if (loadSeq !== usersLoadSeqRef.current) return
        setManageableUsers(rows)
        setOrgScopedUsers(orgRows)
        usersLoadedOnceRef.current = true
      } catch (e) {
        if (loadSeq !== usersLoadSeqRef.current) return
        setError(e instanceof Error ? e.message : "Could not load users.")
        setManageableUsers([])
        setOrgScopedUsers([])
      } finally {
        if (loadSeq === usersLoadSeqRef.current) setLoadingUsers(false)
      }
    })()
  }, [authUserId, authRole, hasAccessToken, targetUserId])

  // Admin: merge org roster when view-as target changes — without toggling loadingUsers (avoids bar loop).
  useEffect(() => {
    if (authRole !== "admin" || !authUserId || !hasAccessToken) return
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
        const loaded = await loadAdminOrgScopedUsers(
          authUserId,
          targetUserId,
          accessTokenRef.current ?? "",
          adminSelfRowRef.current,
          orgOwnerId,
        )
        const demoSourceId = resolveDemoTeamSourceUserId(authUserId, targetUserId)
        const team = await loadSandboxDemoTeamForProfile(demoSourceId)
        if (!cancelled) {
          setSandboxDemoTeam(team)
          setManageableUsers(appendSandboxDemoRows(loaded.rows, team))
          setOrgScopedUsers(appendSandboxDemoRows(loaded.orgRows, team))
        }
      } catch {
        /* keep prior list */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authRole, authUserId, hasAccessToken, targetUserId])

  const refreshManageableUsers = useCallback(async () => {
    if (!authUserId) {
      setManageableUsers([])
      return
    }
    invalidateAdminAccountOwnersCache()
    const loadSeq = ++usersLoadSeqRef.current
    setLoadingUsers(true)
    setError("")
    try {
      const token = accessTokenRef.current
      let rows: ManageableUserRow[] = []
      let orgRows: ManageableUserRow[] = []
      if (authRole === "admin" && token) {
        const loaded = await loadAdminOrgScopedUsers(authUserId, targetUserId, token, adminSelfRowRef.current)
        rows = loaded.rows
        orgRows = loaded.orgRows
      } else if (authRole === "corporate_management" || authRole === "office_manager") {
        rows = await loadManagedOrgUsers(authUserId)
        orgRows = rows
      } else if (authRole) {
        const selfRow: ManageableUserRow = {
          userId: authUserId,
          label: "Me",
          email: user?.email ?? null,
          role: authRole,
          clientId: null,
          isSelf: true,
        }
        rows = await loadEndUserManageableRows(authUserId, selfRow)
        orgRows = rows
      }
      const demoSourceId = resolveDemoTeamSourceUserId(authUserId, targetUserId)
      const team = await loadSandboxDemoTeamForProfile(demoSourceId)
      setSandboxDemoTeam(team)
      rows = appendSandboxDemoRows(rows, team)
      orgRows = appendSandboxDemoRows(orgRows, team)
      setManageableUsers(rows)
      setOrgScopedUsers(orgRows)
      usersLoadedOnceRef.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.")
    } finally {
      if (loadSeq === usersLoadSeqRef.current) setLoadingUsers(false)
    }
  }, [authUserId, authRole, targetUserId, user?.email])

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

  // Match preview role to the selected profile so tabs and roster align with what they see.
  useEffect(() => {
    if (!targetUserId || isPortalViewDefaultTarget(targetUserId) || isSandboxDemoUserId(targetUserId)) return
    const row = manageableUsers.find((u) => u.userId === targetUserId)
    const role = row?.role
    if (!role || !viewRoleOptions.includes(role)) return
    if (viewRole === role) return
    setViewRoleState(role)
    try {
      sessionStorage.setItem(STORAGE_VIEW_ROLE, role)
    } catch {
      /* ignore */
    }
  }, [targetUserId, manageableUsers, viewRole, viewRoleOptions])

  const usersForCurrentViewRole = useMemo(() => {
    if (authRole === "admin" && viewingOtherProfile && orgScopedUsers.length > 0) {
      const switchOwners = manageableUsers.filter(
        (u) =>
          (isOfficeManagerAssignmentRole(u.role) || u.role === "corporate_management") &&
          !orgScopedUsers.some((o) => o.userId === u.userId),
      )
      return [...orgScopedUsers, ...switchOwners]
    }
    return filterUsersForViewRole(manageableUsers, viewRole)
  }, [authRole, viewingOtherProfile, orgScopedUsers, manageableUsers, viewRole])

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
      orgScopedUsers,
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
      orgScopedUsers,
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

/** Role used for tab visibility and permission UI while the view-as bar is active. */
export function useEffectiveViewRole(): UserRole {
  const { role } = useAuth()
  const ctx = useContext(PortalViewContext)
  if (ctx?.showViewBar) return ctx.viewRole
  return role ?? "user"
}
