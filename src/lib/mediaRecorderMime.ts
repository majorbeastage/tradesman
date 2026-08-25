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

export async function acquireMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  })
}

/** Video constraints that work on iPhone and iPad; fall back to audio-only if the camera is unavailable. */
export async function acquireCallMedia(video: boolean): Promise<MediaStream> {
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true }
  if (!video) {
    return navigator.mediaDevices.getUserMedia({ audio, video: false })
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: true })
    } catch {
      return navigator.mediaDevices.getUserMedia({ audio, video: false })
    }
  }
}
