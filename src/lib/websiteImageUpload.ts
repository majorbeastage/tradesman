/** Client-side resize/compress for Website Builder photo uploads. */

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i
const MAX_EDGE_PX = 1920
const MAX_OUTPUT_BYTES = 1_200_000
const JPEG_QUALITY_START = 0.84
const JPEG_QUALITY_FLOOR = 0.55

export function isWebsiteImageFile(file: File): boolean {
  const type = (file.type || "").toLowerCase()
  if (type === "image/svg+xml") return false
  if (type.startsWith("image/")) return true
  return IMAGE_EXT_RE.test(file.name)
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not process that image."))
        else resolve(blob)
      },
      type,
      quality,
    )
  })
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
    } catch {
      /* fall through to HTMLImageElement */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Could not read that image."))
      el.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function imageSize(img: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ("naturalWidth" in img && img.naturalWidth) {
    return { width: img.naturalWidth, height: img.naturalHeight }
  }
  return { width: img.width, height: img.height }
}

/**
 * Decode, downscale, and re-encode as JPEG so phone PNGs / high-res camera shots
 * do not stall the builder or fail storage uploads.
 */
export async function prepareWebsiteImageFile(file: File): Promise<File> {
  if (!isWebsiteImageFile(file)) {
    throw new Error("Choose an image file (JPEG, PNG, or WebP).")
  }
  const type = (file.type || "").toLowerCase()
  const name = file.name.toLowerCase()
  if (type.includes("heic") || type.includes("heif") || /\.hei[cf]$/i.test(name)) {
    /* Try decode anyway — Safari can often read HEIC. */
  }

  let decoded: ImageBitmap | HTMLImageElement
  try {
    decoded = await decodeImage(file)
  } catch {
    if (type.includes("heic") || type.includes("heif") || /\.hei[cf]$/i.test(name)) {
      throw new Error("This photo format (HEIC) isn’t supported here. Save it as JPEG or PNG and try again.")
    }
    throw new Error("Could not read that image. Try a JPEG or PNG.")
  }

  const { width, height } = imageSize(decoded)
  if (!width || !height) {
    throw new Error("Could not read that image. Try a JPEG or PNG.")
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    if ("close" in decoded && typeof decoded.close === "function") decoded.close()
    if (file.size <= MAX_OUTPUT_BYTES && (type === "image/jpeg" || type === "image/webp")) return file
    throw new Error("Could not process that image in this browser.")
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(decoded, 0, 0, w, h)
  if ("close" in decoded && typeof decoded.close === "function") decoded.close()

  let quality = JPEG_QUALITY_START
  let blob = await canvasToBlob(canvas, "image/jpeg", quality)
  while (blob.size > MAX_OUTPUT_BYTES && quality > JPEG_QUALITY_FLOOR) {
    quality = Math.max(JPEG_QUALITY_FLOOR, quality - 0.08)
    blob = await canvasToBlob(canvas, "image/jpeg", quality)
  }
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 40) || "photo"
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() })
}

export function websiteImageUploadErrorMessage(file: File, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (/heic|heif/.test(lower) || /\.hei[cf]$/i.test(file.name) || /heic|heif/.test(file.type)) {
    return `${file.name}: save as JPEG or PNG and try again.`
  }
  if (/payload too large|maximum size|file size|413|too large/.test(lower)) {
    return `${file.name}: photo is too large. Try a smaller JPEG.`
  }
  if (/mime|not allowed|content type/.test(lower)) {
    return `${file.name}: use JPEG, PNG, or WebP.`
  }
  return `${file.name}: ${raw || "upload failed"}`
}
