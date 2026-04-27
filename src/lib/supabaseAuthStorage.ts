import { Capacitor } from "@capacitor/core"
import { Preferences } from "@capacitor/preferences"

type AuthSessionStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

/** Native WebView: localStorage can be cleared or unreliable — use Preferences for auth session. */
export function createNativeAuthStorage(): AuthSessionStorage {
  return {
    getItem: (key: string) => Preferences.get({ key }).then(({ value }) => value ?? null),
    setItem: (key: string, value: string) => Preferences.set({ key, value }),
    removeItem: (key: string) => Preferences.remove({ key }),
  }
}

export function authStorageForCurrentPlatform(): AuthSessionStorage | undefined {
  if (typeof window === "undefined") return undefined
  if (!Capacitor.isNativePlatform()) return undefined
  return createNativeAuthStorage()
}
