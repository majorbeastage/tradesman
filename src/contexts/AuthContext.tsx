import { createContext, useContext, useEffect, useState, useCallback } from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { DEV_USER_ID } from "../core/dev"
import type { PortalConfig } from "../types/portal-builder"

export type UserRole = "user" | "office_manager" | "admin"

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
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [clientId, setClientId] = useState<string>(DEFAULT_CLIENT_ID)
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setRole(null)
      setLoading(false)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !user?.id) {
      setRole(null)
      setClientId(DEFAULT_CLIENT_ID)
      setPortalConfig(null)
      return
    }
    let cancelled = false
    supabase
      .from("profiles")
      .select("role, client_id, portal_config")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!cancelled && !error && data?.role) setRole(data.role as UserRole)
        else if (!cancelled) setRole("user")
        if (!cancelled && data?.client_id) setClientId(data.client_id as string)
        else if (!cancelled) setClientId(DEFAULT_CLIENT_ID)
        if (!cancelled) setPortalConfig((data?.portal_config as PortalConfig) ?? null)
      })
    return () => { cancelled = true }
  }, [user?.id])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ?? null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ?? null }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  const refetchProfile = useCallback(async (): Promise<ProfileFetchResult> => {
    if (!supabase || !user?.id) return { role: null }
    const { data, error } = await supabase
      .from("profiles")
      .select("role, client_id, portal_config")
      .eq("id", user.id)
      .single()
    if (error) {
      const fallback: UserRole = "user"
      setRole(fallback)
      return { role: fallback, error: error.message }
    }
    const roleFromDb = (data?.role as UserRole) ?? "user"
    setRole(roleFromDb)
    if (data?.client_id) setClientId(data.client_id as string)
    else setClientId(DEFAULT_CLIENT_ID)
    setPortalConfig((data?.portal_config as PortalConfig) ?? null)
    return { role: roleFromDb }
  }, [user?.id])

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
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
