import { createClient, type SupportedStorage } from "@supabase/supabase-js"
import { Preferences } from "@capacitor/preferences"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn("[messaging] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them in .env")
}

/**
 * Capacitor Preferences storage so the session survives app restarts
 * (like staying logged into Facebook) instead of relying on WebView localStorage alone.
 */
const capacitorStorage: SupportedStorage = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key })
    return value
  },
  setItem: async (key, value) => {
    await Preferences.set({ key, value })
  },
  removeItem: async (key) => {
    await Preferences.remove({ key })
  },
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: capacitorStorage,
    storageKey: "tradesman-messaging-auth",
  },
})
