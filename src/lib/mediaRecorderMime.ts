import { Capacitor } from "@capacitor/core"

/** iOS WKWebView typically supports mp4/aac, not WebM. Prefer a type the device can actually record. */
const AUDIO_RECORDER_CANDIDATES = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
]

export function pickAudioRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined
  return AUDIO_RECORDER_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

export function audioExtensionForMime(mimeType: string): string {
  const t = mimeType.toLowerCase()
  if (t.includes("mp4") || t.includes("aac") || t.includes("m4a")) return "m4a"
  if (t.includes("ogg")) return "ogg"
  if (t.includes("wav")) return "wav"
  return "webm"
}

export function createAudioMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickAudioRecorderMimeType()
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
}

export function humanizeMediaPermissionError(err: unknown, kind: "microphone" | "camera"): string {
  const raw = err instanceof Error ? err.message : String(err ?? "")
  const lower = raw.toLowerCase()
  if (lower.includes("notallowed") || lower.includes("permission") || lower.includes("denied") || lower.includes("security")) {
    return kind === "microphone"
      ? "Microphone access was not allowed. On iPhone or iPad, open Settings → Tradesman → Microphone and turn it on, then try again."
      : "Camera access was not allowed. On iPhone or iPad, open Settings → Tradesman → Camera and turn it on, then try again."
  }
  if (lower.includes("notfound") || lower.includes("devices not found") || lower.includes("requested device not found")) {
    return kind === "microphone"
      ? "No microphone is available on this device."
      : "No camera is available on this device."
  }
  if (lower.includes("notreadable") || lower.includes("trackstart") || lower.includes("could not start")) {
    return kind === "microphone"
      ? "The microphone is in use by another app. Close that app and try again."
      : "The camera is in use by another app. Close that app and try again."
  }
  return raw || (kind === "microphone" ? "Could not start the microphone." : "Could not start the camera.")
}

async function requestNativeMediaAccess(kind: "microphone" | "camera"): Promise<boolean | null> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return null
  try {
    const { TradesmanNative } = await import("../plugins/tradesman-native")
    const result =
      kind === "microphone" ? await TradesmanNative.requestMicrophoneAccess() : await TradesmanNative.requestCameraAccess()
    return Boolean(result?.granted)
  } catch {
    return null
  }
}

/** Ask the OS for mic access (shows the iOS prompt) and release the stream. */
export async function ensureMicrophonePermission(): Promise<void> {
  const native = await requestNativeMediaAccess("microphone")
  if (native === false) {
    throw new Error(humanizeMediaPermissionError(new Error("permission denied"), "microphone"))
  }
  const stream = await acquireMicrophoneStream()
  stream.getTracks().forEach((track) => track.stop())
}

export async function acquireMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This device cannot record audio.")
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    })
  } catch (err) {
    throw new Error(humanizeMediaPermissionError(err, "microphone"))
  }
}

export async function acquireCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This device cannot open the camera.")
  }
  const native = await requestNativeMediaAccess("camera")
  if (native === false) {
    throw new Error(humanizeMediaPermissionError(new Error("permission denied"), "camera"))
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" } },
      audio: false,
    })
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    } catch (err) {
      throw new Error(humanizeMediaPermissionError(err, "camera"))
    }
  }
}

/** Video constraints that work on iPhone and iPad; fall back to audio-only if the camera is unavailable. */
export async function acquireCallMedia(video: boolean): Promise<MediaStream> {
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true }
  if (!video) {
    return acquireMicrophoneStream()
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: true })
    } catch {
      return acquireMicrophoneStream()
    }
  }
}
