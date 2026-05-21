/** Natural-sounding browser TTS for setup wizards and assistant prompts. */

let cachedVoice: SpeechSynthesisVoice | null = null

function pickNaturalEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ranked = [
    /Google.*English.*\(United States\)/i,
    /Microsoft.*Natural.*English.*United States/i,
    /Microsoft (Aria|Jenny|Guy)/i,
    /Samantha/i,
    /Karen/i,
    /Daniel/i,
    /en-US/i,
    /English.*United States/i,
  ]
  for (const pattern of ranked) {
    const hit = voices.find((v) => pattern.test(v.name) && v.lang.toLowerCase().startsWith("en"))
    if (hit) return hit
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null
}

function refreshPreferredVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const voices = window.speechSynthesis.getVoices()
  if (voices.length) cachedVoice = pickNaturalEnglishVoice(voices)
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  refreshPreferredVoice()
  window.speechSynthesis.addEventListener("voiceschanged", refreshPreferredVoice)
}

/** Speak setup / assistant prompts with a less robotic cadence than default synthesis. */
export function speakNaturalPrompt(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const trimmed = text.trim()
  if (!trimmed) return
  window.speechSynthesis.cancel()
  refreshPreferredVoice()
  const u = new SpeechSynthesisUtterance(trimmed)
  u.lang = "en-US"
  u.rate = 0.93
  u.pitch = 1.04
  u.volume = 1
  if (cachedVoice) u.voice = cachedVoice
  window.speechSynthesis.speak(u)
}

export function stopNaturalPrompt(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}
