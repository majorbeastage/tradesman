import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { activateDemoSession, demoAccessBlockReason } from "../lib/demoAccountLifecycle"
import { revokeOtherAuthSessions } from "../lib/authSingleSession"
import { DEV_USER_ID } from "../core/dev"
import type { PortalConfig } from "../types/portal-builder"
import { mergeSandboxPortalConfig } from "../lib/sandboxPortalConfig"
import { parseSandboxMeta, SANDBOX_META_KEY } from "../lib/sandboxEnvironment"

function shouldMergeSandboxPortalConfig(
  meta: Record<string, unknown>,
  portalCfgRaw: PortalConfig | null,
): boolean {
  if (meta.sandbox_account === true || portalCfgRaw?.sandbox_account === true) return true
  if (typeof meta.sandbox_expires_at === "string" && meta.sandbox_expires_at.trim()) return true
  return parseSandboxMeta(meta[SANDBOX_META_KEY]) != null
}

export type UserRole =
  | "user"
  | "new_user"
  | "demo_user"
  | "office_manager"
  | "admin"
  | "corporate_management"
  | "corporate_external"
  | "corporate_internal"

export type ProfileFetchResult = { role: UserRole | null; error?: string }

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001"

type AuthState = {
  user: User | null
  /** When not signed in, falls back to DEV_USER_ID so the app works without login. */
  userId: string
  /** From profiles table; null until loaded or no profile. */
  role: UserRole | null
  /** From profiles.client_id; used for portal config. Defaults to DEFAULT_CLIENT_ID if null. */
  clientId: string
  /** From profiles.portal_config; per-user tabs/settings/dropdowns visibility. {} = all visible. */
  portalConfig: PortalConfig | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  /** Refetch profile from DB and return role (e.g. to retry after login). */
  refetchProfile: () => Promise<ProfileFetchResult>
  /** True after sign-in when profiles.account_disabled is true or demo expired; user is signed out. */
  accountAccessBlocked: boolean
  /** Specific message when accountAccessBlocked (deactivated vs demo expired). */
  accessBlockedMessage: string | null
  clearAccessBlockedReason: () => void
  /** Public URL from profiles.metadata.profile_photo_url when set. */
  profilePhotoUrl: string | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [clientId, setClientId] = useState<string>(DEFAULT_CLIENT_ID)
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [accountAccessBlocked, setAccountAccessBlocked] = useState(false)
  const [accessBlockedMessage, setAccessBlockedMessage] = useState<string | null>(null)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  /** Last user id from auth session; used to avoid clearing `role` on TOKEN_REFRESHED (same user). */
  const authSessionUserIdRef = useRef<string | null>(null)
  /** Dedupe notify POST when both INITIAL_SESSION and getSession() run back-to-back. */
  const verifiedNotifyDedupeRef = useRef<{ userId: string; at: number } | null>(null)

  const clearAccessBlockedReason = useCallback(() => {
    setAccountAccessBlocked(false)
    setAccessBlockedMessage(null)
  }, [])

  const postVerifiedSignupNotify = useCallback((session: Session | null) => {
    if (!session?.user?.email_confirmed_at || !session.access_token) return
    const uid = session.user.id
    const now = Date.now()
    const prev = verifiedNotifyDedupeRef.current
    if (prev && prev.userId === uid && now - prev.at < 4000) return
    verifiedNotifyDedupeRef.current = { userId: uid, at: now }
    const authHeaders = { Authorization: `Bearer ${session.access_token}` }
    void fetch("/api/notify-admin-verified-signup", { method: "POST", headers: authHeaders }).catch(() => {
      /* best-effort; server is idempotent */
    })
    void fetch("/api/notify-client-sms-disclosure", { method: "POST", headers: authHeaders }).catch(() => {
      /* best-effort; server is idempotent */
    })
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      const nextUser = session?.user ?? null
      const nextId = nextUser?.id ?? null
      const prevId = authSessionUserIdRef.current
      if (nextId == null) {
        setRole(null)
        authSessionUserIdRef.current = null
      } else if (prevId != null && prevId !== nextId) {
        setRole(null)
        authSessionUserIdRef.current = nextId
      } else {
        authSessionUserIdRef.current = nextId
      }
      setUser(nextUser)
      setLoading(false)
      /** USER_UPDATED: e.g. admin confirmed email in Dashboard while session is open — still ping ops once. */
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
        postVerifiedSignupNotify(session)
        if (session?.access_token) void activateDemoSession(session.access_token)
      }
    })
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      const u = session?.user ?? null
      authSessionUserIdRef.current = u?.id ?? null
      setUser(u)
      setLoading(false)
      /** Same notify as onAuthStateChange — covers loads where INITIAL_SESSION does not fire before hydration. */
      postVerifiedSignupNotify(session)
      if (session?.access_token) void activateDemoSession(session.access_token)
    })
    return () => subscription.unsubscribe()
  }, [postVerifiedSignupNotify])

  useEffect(() => {
    if (!supabase || !user?.id) {
      setRole(null)
      setClientId(DEFAULT_CLIENT_ID)
      setPortalConfig(null)
      setProfilePhotoUrl(null)
      return
    }
    const sb = supabase
    let cancelled = false
    const timeoutMs = 8000
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setRole("user")
    }, timeoutMs)
    sb
      .from("profiles")
      .select("role, client_id, portal_config, account_disabled, metadata")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!cancelled && data?.account_disabled === true) {
          clearTimeout(timeoutId)
          setAccessBlockedMessage(null)
          setAccountAccessBlocked(true)
          void sb.auth.signOut()
          return
        }
        if (!cancelled) {
          clearTimeout(timeoutId)
          const meta =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? (data.metadata as Record<string, unknown>)
              : {}
          const portalCfgRaw = (data?.portal_config as PortalConfig) ?? null
          const portalCfg =
            shouldMergeSandboxPortalConfig(meta, portalCfgRaw)
              ? mergeSandboxPortalConfig(portalCfgRaw)
              : portalCfgRaw
          const demoBlock = demoAccessBlockReason(meta, portalCfg, data?.role as string | undefined)
          if (demoBlock) {
            setAccessBlockedMessage(demoBlock)
            setAccountAccessBlocked(true)
            void sb.auth.signOut()
            return
          }
          if (!error && data?.role) {
            const roleRaw = data.role as UserRole
            setRole(
              shouldMergeSandboxPortalConfig(meta, portalCfg) && roleRaw === "new_user"
                ? "corporate_management"
                : roleRaw,
            )
          } else setRole("user")
        }
        if (!cancelled && data?.client_id) setClientId(data.client_id as string)
        else if (!cancelled) setClientId(DEFAULT_CLIENT_ID)
        if (!cancelled) {
          const meta2 =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? (data.metadata as Record<string, unknown>)
              : {}
          const portalCfgRaw = (data?.portal_config as PortalConfig) ?? null
          const portalCfg =
            shouldMergeSandboxPortalConfig(meta2, portalCfgRaw)
              ? mergeSandboxPortalConfig(portalCfgRaw)
              : portalCfgRaw
          setPortalConfig(portalCfg)
        }
        if (!cancelled) {
          const meta = (data as { metadata?: unknown })?.metadata
          const m = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
          const url = m.profile_photo_url
          setProfilePhotoUrl(typeof url === "string" && url.trim().startsWith("http") ? url.trim() : null)
        }
      })
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [user?.id])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    await revokeOtherAuthSessions()
    return { error: null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error }
    if (data.session) await revokeOtherAuthSessions()
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  const refetchProfile = useCallback(async (): Promise<ProfileFetchResult> => {
    if (!supabase || !user?.id) return { role: null }
    const { data, error } = await supabase
      .from("profiles")
      .select("role, client_id, portal_config, account_disabled, metadata")
      .eq("id", user.id)
      .single()
    if (data?.account_disabled === true) {
      setAccessBlockedMessage(null)
      setAccountAccessBlocked(true)
      await supabase.auth.signOut()
      return { role: null, error: "Account deactivated" }
    }
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    const portalCfgRaw = (data?.portal_config as PortalConfig) ?? null
    const portalCfg =
      shouldMergeSandboxPortalConfig(meta, portalCfgRaw)
        ? mergeSandboxPortalConfig(portalCfgRaw)
        : portalCfgRaw
    const demoBlock = demoAccessBlockReason(meta, portalCfg, data?.role as string | undefined)
    if (demoBlock) {
      setAccessBlockedMessage(demoBlock)
      setAccountAccessBlocked(true)
      await supabase.auth.signOut()
      return { role: null, error: demoBlock }
    }
    if (error) {
      const fallback: UserRole = "user"
      setRole(fallback)
      return { role: fallback, error: error.message }
    }
    const roleRaw = (data?.role as UserRole) ?? "user"
    const roleFromDb =
      shouldMergeSandboxPortalConfig(meta, portalCfg) && roleRaw === "new_user"
        ? "corporate_management"
        : roleRaw
    setRole(roleFromDb)
    if (data?.client_id) setClientId(data.client_id as string)
    else setClientId(DEFAULT_CLIENT_ID)
    setPortalConfig(portalCfg)
    const url = meta.profile_photo_url
    setProfilePhotoUrl(typeof url === "string" && url.trim().startsWith("http") ? url.trim() : null)
    return { role: roleFromDb }
  }, [user?.id])

  // When user returns to the tab, refetch profile so portal_config updates from admin appear without full refresh.
  useEffect(() => {
    const onFocus = () => { if (user?.id && refetchProfile) void refetchProfile() }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [user?.id, refetchProfile])

  const value: AuthState = {
    user,
    userId: user?.id ?? DEV_USER_ID,
    role,
    clientId,
    portalConfig,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refetchProfile,
    accountAccessBlocked,
    accessBlockedMessage,
    clearAccessBlockedReason,
    profilePhotoUrl,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
