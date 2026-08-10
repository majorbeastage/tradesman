import { Capacitor } from "@capacitor/core"
import { APP_VERSION } from "../constants/appVersion"
import { MAIN_PLAY_STORE_URL, MAIN_PLAY_STORE_MARKET_URL } from "./messagingHandoff"

export type AppVersionRequirements = {
  androidMinVersion: string | null
  iosMinVersion: string | null
  androidStoreUrl: string
  iosStoreUrl: string | null
  message: string | null
}

export const MAIN_IOS_APP_STORE_URL =
  (typeof import.meta !== "undefined" &&
    typeof import.meta.env?.VITE_MAIN_IOS_APP_STORE_URL === "string" &&
    import.meta.env.VITE_MAIN_IOS_APP_STORE_URL.trim()) ||
  ""

function parseSemver(v: string): [number, number, number] {
  const parts = v
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

export function isVersionLessThan(current: string, minimum: string): boolean {
  const a = parseSemver(current)
  const b = parseSemver(minimum)
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return true
    if (a[i] > b[i]) return false
  }
  return false
}

export async function fetchAppVersionRequirements(): Promise<AppVersionRequirements> {
  const fallback: AppVersionRequirements = {
    androidMinVersion: null,
    iosMinVersion: null,
    androidStoreUrl: MAIN_PLAY_STORE_URL,
    iosStoreUrl: MAIN_IOS_APP_STORE_URL || null,
    message: null,
  }
  try {
    const origin =
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_PUBLIC_APP_ORIGIN?.trim()) ||
      (typeof window !== "undefined" ? window.location.origin : "")
    const url = Capacitor.isNativePlatform() && origin
      ? `${origin.replace(/\/+$/, "")}/api/app-version-requirements`
      : "/api/app-version-requirements"
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return fallback
    const j = (await res.json()) as Partial<AppVersionRequirements>
    return {
      androidMinVersion: typeof j.androidMinVersion === "string" ? j.androidMinVersion.trim() : null,
      iosMinVersion: typeof j.iosMinVersion === "string" ? j.iosMinVersion.trim() : null,
      androidStoreUrl: typeof j.androidStoreUrl === "string" && j.androidStoreUrl.trim() ? j.androidStoreUrl.trim() : MAIN_PLAY_STORE_URL,
      iosStoreUrl:
        typeof j.iosStoreUrl === "string" && j.iosStoreUrl.trim()
          ? j.iosStoreUrl.trim()
          : MAIN_IOS_APP_STORE_URL || null,
      message: typeof j.message === "string" ? j.message.trim() : null,
    }
  } catch {
    return fallback
  }
}

export function nativeUpdateRequired(req: AppVersionRequirements): {
  required: boolean
  storeUrl: string | null
  minVersion: string | null
} {
  if (!Capacitor.isNativePlatform()) return { required: false, storeUrl: null, minVersion: null }
  const platform = Capacitor.getPlatform()
  if (platform === "android") {
    const min = req.androidMinVersion
    if (!min) return { required: false, storeUrl: null, minVersion: null }
    return {
      required: isVersionLessThan(APP_VERSION, min),
      storeUrl: req.androidStoreUrl,
      minVersion: min,
    }
  }
  if (platform === "ios") {
    const min = req.iosMinVersion
    if (!min) return { required: false, storeUrl: null, minVersion: null }
    return {
      required: isVersionLessThan(APP_VERSION, min),
      storeUrl: req.iosStoreUrl,
      minVersion: min,
    }
  }
  return { required: false, storeUrl: null, minVersion: null }
}

export function openNativeAppStore(storeUrl: string | null): void {
  if (typeof window === "undefined") return
  const platform = Capacitor.getPlatform()
  if (platform === "android") {
    try {
      window.location.href = MAIN_PLAY_STORE_MARKET_URL
      return
    } catch {
      /* fall through */
    }
  }
  const url = storeUrl?.trim() || MAIN_PLAY_STORE_URL
  window.open(url, "_blank", "noopener,noreferrer")
}
