import type { VercelRequest, VercelResponse } from "@vercel/node"

const MAIN_ANDROID_PACKAGE = "com.tradesmanus.com"
const DEFAULT_PLAY_STORE = `https://play.google.com/store/apps/details?id=${MAIN_ANDROID_PACKAGE}`

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Access-Control-Allow-Origin", "*")
  const androidMinVersion = (process.env.MIN_ANDROID_APP_VERSION ?? process.env.VITE_MIN_ANDROID_APP_VERSION ?? "").trim()
  const iosMinVersion = (process.env.MIN_IOS_APP_VERSION ?? process.env.VITE_MIN_IOS_APP_VERSION ?? "").trim()
  const androidStoreUrl = (process.env.ANDROID_PLAY_STORE_URL ?? DEFAULT_PLAY_STORE).trim()
  const iosStoreUrl = (process.env.IOS_APP_STORE_URL ?? process.env.VITE_MAIN_IOS_APP_STORE_URL ?? "").trim()
  const message = (process.env.APP_UPDATE_REQUIRED_MESSAGE ?? "").trim()
  return res.status(200).json({
    androidMinVersion: androidMinVersion || null,
    iosMinVersion: iosMinVersion || null,
    androidStoreUrl,
    iosStoreUrl: iosStoreUrl || null,
    message: message || null,
  })
}
