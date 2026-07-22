import { registerPlugin } from "@capacitor/core"

export interface MessagingNativePlugin {
  getFcmAvailability(): Promise<{ available: boolean }>
  setSpeakerOn(options: { enabled: boolean }): Promise<void>
  resetCallAudio(): Promise<void>
}

export const MessagingNative = registerPlugin<MessagingNativePlugin>("MessagingNative")
