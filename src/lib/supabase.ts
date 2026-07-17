import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { authStorageForCurrentPlatform } from './supabaseAuthStorage'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const supabaseKey = supabaseAnonKey
const nativeAuthStorage = authStorageForCurrentPlatform()

export const PORTAL_VIEW_READ_ONLY_MESSAGE =
  "View only — you are previewing another profile. Turn on Edit mode in the Viewing as bar to make changes."

/**
 * Global write block while an admin/manager previews another profile without
 * Edit mode. Set from PortalViewProvider; enforced at the fetch layer so every
 * insert/update/delete/RPC/storage/function write is stopped in one place.
 */
let portalViewWriteBlockActive = false
export function setPortalViewWriteBlock(active: boolean) {
  portalViewWriteBlockActive = active
}
export function isPortalViewWriteBlocked(): boolean {
  return portalViewWriteBlockActive
}

const nativeFetch: typeof fetch = (...args) => globalThis.fetch(...args)

/**
 * Internal team messaging/calling always runs as the *signed-in* user and is
 * intentionally independent of "Viewing as". These writes must pass even while
 * previewing another profile (the messenger never acts as the previewed user).
 */
function isSignedInUserMessengerWrite(url: string): boolean {
  return (
    /\/rest\/v1\/(internal_threads|internal_thread_members|internal_messages)(\?|$|\/)/.test(url) ||
    /\/rest\/v1\/rpc\/create_internal_thread(\?|$)/.test(url)
  )
}

const guardedFetch: typeof fetch = (input, init) => {
  if (portalViewWriteBlockActive) {
    const method = (
      init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
    ).toUpperCase()
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
    const isWrite = method !== "GET" && method !== "HEAD"
    // Auth traffic (token refresh, sign-out) must always pass.
    const isAuthEndpoint = url.includes("/auth/v1/")
    if (isWrite && !isAuthEndpoint && !isSignedInUserMessengerWrite(url)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ message: PORTAL_VIEW_READ_ONLY_MESSAGE, code: "portal_view_read_only" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      )
    }
  }
  return nativeFetch(input, init)
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
          ...(nativeAuthStorage ? { storage: nativeAuthStorage } : {}),
        },
        global: { fetch: guardedFetch },
      })
    : null
