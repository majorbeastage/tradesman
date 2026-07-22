import { registerPlugin } from "@capacitor/core"

export interface TradesmanNativePlugin {
  /** True when Firebase default app exists (FCM / PushNotifications.register safe). */
  getFcmAvailability(): Promise<{ available: boolean }>
  /** Enter VOICE_CALL / IN_COMMUNICATION mode before softphone audio. */
  prepareCallAudio(): Promise<void>
  /** Route softphone audio to speaker (true) or handset/Phone (false). */
  setSpeakerOn(options: { enabled: boolean }): Promise<void>
  /** Restore default audio mode after hangup. */
  resetCallAudio(): Promise<void>
  /** Open an external URL / intent (deep links to Messaging, etc.). */
  openExternalUrl(options: { url: string }): Promise<void>
}

export const TradesmanNative = registerPlugin<TradesmanNativePlugin>("TradesmanNative")
