import { Capacitor } from "@capacitor/core"

/**
 * Route softphone audio to speakerphone vs earpiece on native.
 * No-ops on web (browser/WebView default).
 */
export async function setCallSpeakerOn(on: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { TradesmanNative } = await import("../plugins/tradesman-native")
    if (typeof TradesmanNative.setSpeakerOn !== "function") return false
    await TradesmanNative.setSpeakerOn({ enabled: on })
    return true
  } catch {
    return false
  }
}

export async function resetCallAudioRoute(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { TradesmanNative } = await import("../plugins/tradesman-native")
    if (typeof TradesmanNative.resetCallAudio === "function") {
      await TradesmanNative.resetCallAudio()
      return
    }
    if (typeof TradesmanNative.setSpeakerOn === "function") {
      await TradesmanNative.setSpeakerOn({ enabled: false })
    }
  } catch {
    /* ignore */
  }
}
