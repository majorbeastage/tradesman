import { pickImageFile } from "./nativeImagePick"
import { isIosNativeApp } from "./publicSite"

function isImageFileInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false
  if (el.type !== "file") return false
  const accept = (el.accept || "").toLowerCase()
  if (accept.includes("audio") && !accept.includes("image")) return false
  if (accept.includes("video") && !accept.includes("image") && !accept.includes("heic")) return false
  // Empty accept still shows Take Photo on iOS. PDF-capable pickers stay native (Browse).
  if (accept.includes("pdf") || accept.includes("msword") || accept.includes(".doc")) return false
  if (!accept) return true
  return (
    accept.includes("image") ||
    accept.includes("heic") ||
    accept.includes("heif") ||
    /\.(jpe?g|png|gif|webp|bmp|heic|heif)\b/.test(accept)
  )
}

function fileInputFromEventTarget(target: EventTarget | null): HTMLInputElement | null {
  if (isImageFileInput(target)) return target
  if (!(target instanceof Element)) return null
  const labeled = target.closest("label")
  if (!labeled) return null
  const nested = labeled.querySelector('input[type="file"]')
  if (isImageFileInput(nested)) return nested
  const htmlFor = labeled.getAttribute("for")
  if (!htmlFor) return null
  const byId = document.getElementById(htmlFor)
  return isImageFileInput(byId) ? byId : null
}

/**
 * WKWebView `<input type="file">` shows Take Photo and TCC-kills the app on iPad
 * when NSCameraUsageDescription is missing. Never let that sheet open for images.
 */
export function installIosImageFileInputGuard(): void {
  if (typeof document === "undefined" || !isIosNativeApp()) return
  document.addEventListener(
    "click",
    (event) => {
      const input = fileInputFromEventTarget(event.target)
      if (!input || input.disabled) return
      event.preventDefault()
      event.stopPropagation()
      void (async () => {
        const picked = await pickImageFile("photos")
        if (!picked.ok) return
        const transfer = new DataTransfer()
        transfer.items.add(picked.file)
        input.files = transfer.files
        input.dispatchEvent(new Event("change", { bubbles: true }))
      })()
    },
    true,
  )
}
