import { Capacitor } from "@capacitor/core"
import { isIosNativeApp } from "./publicSite"

export type NativeImagePickResult =
  | { ok: true; file: File }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string }

function dataUrlToFile(dataUrl: string, fileName: string, mimeType: string): File {
  const comma = dataUrl.indexOf(",")
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], fileName, { type: mimeType || "image/jpeg" })
}

/** True when we should bypass `<input type="file">` (WKWebView “Take Photo” crashed App Review without a camera usage string). */
export function shouldUseNativeImagePick(): boolean {
  return isIosNativeApp()
}

/**
 * iOS: native camera / photo library (iPad-safe presentation + permission).
 * Other platforms: caller should fall back to a file input.
 */
export async function pickImageFile(source: "prompt" | "camera" | "photos" = "prompt"): Promise<NativeImagePickResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, cancelled: false, message: "Use the file picker on this device." }
  }
  try {
    const { TradesmanNative } = await import("../plugins/tradesman-native")
    const result = await TradesmanNative.pickImage({ source })
    if (result.cancelled) return { ok: false, cancelled: true }
    if (!result.dataUrl) {
      return { ok: false, cancelled: false, message: result.error || "Could not read that photo." }
    }
    const mime = result.mimeType?.trim() || "image/jpeg"
    const name = result.fileName?.trim() || "photo.jpg"
    return { ok: true, file: dataUrlToFile(result.dataUrl, name, mime) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, cancelled: false, message: message || "Could not open the camera or photo library." }
  }
}
