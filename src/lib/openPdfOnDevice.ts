import { isNativeApp } from "./capacitorMobile"

/** Open a PDF blob in browser or via native share sheet (Android/iOS WebView blocks blob popups). */
export async function openPdfBlobOnDevice(bytes: Uint8Array, fileName = "estimate.pdf"): Promise<void> {
  if (!isNativeApp()) {
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const opened = window.open(url, "_blank", "noopener,noreferrer")
    if (!opened) {
      const a = document.createElement("a")
      a.href = url
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem")
  const { Share } = await import("@capacitor/share")
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  const b64 = btoa(binary)
  const safeName = fileName.replace(/[^\w.-]+/g, "_") || "estimate.pdf"
  await Filesystem.writeFile({
    path: safeName,
    data: b64,
    directory: Directory.Cache,
  })
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: safeName })
  await Share.share({
    title: "Estimate PDF",
    url: uri,
    dialogTitle: "Open estimate PDF",
  })
}
