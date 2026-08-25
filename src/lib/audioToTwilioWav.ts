/** Convert in-browser recordings to 16 kHz mono PCM WAV so Twilio <Play> is clear (WebM/M4A often sounds like static). */

const TARGET_SAMPLE_RATE = 16_000
const MAX_SECONDS = 90

export function isTwilioPlaySafeAudioUrl(url: string): boolean {
  const raw = url.trim()
  if (!raw) return false
  const path = raw.split("?")[0].toLowerCase()
  if (path.includes("/api/voice-prompt-audio")) return true
  if (path.includes("api.twilio.com") && path.includes("/recordings/")) return true
  return /\.(mp3|wav|wave|gsm)$/.test(path)
}

export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  try {
    return decodeURIComponent(url.slice(i + marker.length).split("?")[0])
  } catch {
    return url.slice(i + marker.length).split("?")[0]
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length
  const out = new Float32Array(length)
  const channels = Math.max(1, buffer.numberOfChannels)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) out[i] += data[i] / channels
  }
  return out
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  const last = input.length - 1
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.min(last, Math.floor(src))
    const i1 = Math.min(last, i0 + 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  writeAscii(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, "WAVE")
  writeAscii(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, "data")
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: "audio/wav" })
}

export async function blobToTwilioWav(blob: Blob): Promise<Blob> {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error("This browser cannot convert audio for phone playback.")
  const ctx = new Ctor()
  try {
    const source = await blob.arrayBuffer()
    const decoded = await ctx.decodeAudioData(source.slice(0))
    if (decoded.duration > MAX_SECONDS) {
      throw new Error(`Keep each recording under ${MAX_SECONDS} seconds.`)
    }
    const mono = mixToMono(decoded)
    const samples = resampleLinear(mono, decoded.sampleRate, TARGET_SAMPLE_RATE)
    return encodeWavPcm16(samples, TARGET_SAMPLE_RATE)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Keep each")) throw e
    throw new Error("Could not convert this recording for phone playback. Try Chrome or Safari, or upload an MP3/WAV file.")
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

export async function prepareTwilioPlayableAudio(blob: Blob, mimeType: string): Promise<{ blob: Blob; contentType: string; ext: string }> {
  const mime = mimeType.toLowerCase()
  if (mime.includes("wav") || mime.includes("wave")) {
    return { blob, contentType: "audio/wav", ext: "wav" }
  }
  if (mime.includes("mpeg") || mime.includes("mp3")) {
    return { blob, contentType: "audio/mpeg", ext: "mp3" }
  }
  const wav = await blobToTwilioWav(blob)
  return { blob: wav, contentType: "audio/wav", ext: "wav" }
}
