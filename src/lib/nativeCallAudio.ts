import { Capacitor } from "@capacitor/core"

/**
 * Route softphone audio to speakerphone vs handset ("Phone") on native.
 * No-ops on web (browser uses default output — no Phone/Speaker toggle).
 */
export async function prepareCallAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { TradesmanNative } = await import("../plugins/tradesman-native")
    if (typeof TradesmanNative.prepareCallAudio === "function") {
      await TradesmanNative.prepareCallAudio()
    }
  } catch {
    /* ignore */
  }
}

export async function setCallSpeakerOn(on: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { TradesmanNative } = await import("../plugins/tradesman-native")
    if (typeof TradesmanNative.setSpeakerOn !== "function") return false
    await TradesmanNative.setSpeakerOn({ enabled: on })
    // WebRTC sometimes steals the route — reinforce after a short delay.
    window.setTimeout(() => {
      void TradesmanNative.setSpeakerOn({ enabled: on }).catch(() => undefined)
    }, 250)
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
