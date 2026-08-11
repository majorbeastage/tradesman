import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { demoAccessBlockReason } from "../lib/demoAccountLifecycle"
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
  userId: string
  role: UserRole | null
  clientId: string
  portalConfig: PortalConfig | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refetchProfile: () => Promise<ProfileFetchResult>
  accountAccessBlocked: boolean
  accessBlockedMessage: string | null
  clearAccessBlockedReason: () => void
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
  const authSessionUserIdRef = useRef<string | null>(null)

  const clearAccessBlockedReason = useCallback(() => {
    setAccountAccessBlocked(false)
    setAccessBlockedMessage(null)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      const nextUser = nextSession?.user ?? null
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
      // Crisis mode: do NOT call notify/activate-demo on login — those hit Vercel → Supabase and worsen outages.
    })
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      const u = s?.user ?? null
      authSessionUserIdRef.current = u?.id ?? null
      setUser(u)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

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
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setRole((prev) => prev ?? "user")
    }, 4000)

    // Light query only — never pull full metadata JSONB on every auth (was stalling login).
    void Promise.resolve(
      sb.from("profiles").select("role, client_id, portal_config, account_disabled").eq("id", user.id).maybeSingle(),
    ).then(
      ({ data, error }) => {
        if (cancelled) return
        clearTimeout(timeoutId)
        if (data?.account_disabled === true) {
          setAccessBlockedMessage(null)
          setAccountAccessBlocked(true)
          void sb.auth.signOut()
          return
        }
        if (!error && data?.role) {
          setRole(data.role as UserRole)
        } else {
          setRole("user")
        }
        if (data?.client_id) setClientId(data.client_id as string)
        else setClientId(DEFAULT_CLIENT_ID)
        setPortalConfig((data?.portal_config as PortalConfig) ?? null)
      },
      () => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setRole((prev) => prev ?? "user")
        }
      },
    )

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [user?.id])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  const refetchProfile = useCallback(async (): Promise<ProfileFetchResult> => {
    if (!supabase || !user?.id) return { role: null }
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, client_id, portal_config, account_disabled, metadata")
        .eq("id", user.id)
        .maybeSingle()
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
      const portalCfg = shouldMergeSandboxPortalConfig(meta, portalCfgRaw)
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
    } catch (e) {
      const fallback: UserRole = "user"
      setRole(fallback)
      return { role: fallback, error: e instanceof Error ? e.message : String(e) }
    }
  }, [user?.id])

  // Crisis mode: no focus refetch (was re-querying profiles constantly).

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
