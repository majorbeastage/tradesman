import { registerPlugin } from "@capacitor/core"

export interface TradesmanNativePlugin {
  /** True when Firebase default app exists (FCM / PushNotifications.register safe). */
  getFcmAvailability(): Promise<{ available: boolean }>
  /** Route softphone audio to speaker (true) or earpiece (false). */
  setSpeakerOn(options: { enabled: boolean }): Promise<void>
  /** Restore default audio mode after hangup. */
  resetCallAudio(): Promise<void>
}

export const TradesmanNative = registerPlugin<TradesmanNativePlugin>("TradesmanNative")
