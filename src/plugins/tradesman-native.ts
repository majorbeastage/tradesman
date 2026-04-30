import { registerPlugin } from "@capacitor/core"

export interface TradesmanNativePlugin {
  /** True when Firebase default app exists (FCM / PushNotifications.register safe). */
  getFcmAvailability(): Promise<{ available: boolean }>
}

export const TradesmanNative = registerPlugin<TradesmanNativePlugin>("TradesmanNative")
