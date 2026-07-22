import { Capacitor } from "@capacitor/core"

/** Route softphone / WebRTC audio on native Messaging (earpiece vs loudspeaker). */
export async function prepareCallAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    if (typeof MessagingNative.prepareCallAudio === "function") {
      await MessagingNative.prepareCallAudio()
    }
  } catch {
    /* ignore */
  }
}

export async function setCallSpeakerOn(on: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    if (typeof MessagingNative.setSpeakerOn !== "function") return false
    await MessagingNative.setSpeakerOn({ enabled: on })
    window.setTimeout(() => {
      void MessagingNative.setSpeakerOn({ enabled: on }).catch(() => undefined)
    }, 250)
    return true
  } catch {
    return false
  }
}

export async function resetCallAudioRoute(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    if (typeof MessagingNative.resetCallAudio === "function") {
      await MessagingNative.resetCallAudio()
      return
    }
    if (typeof MessagingNative.setSpeakerOn === "function") {
      await MessagingNative.setSpeakerOn({ enabled: false })
    }
  } catch {
    /* ignore */
  }
}
