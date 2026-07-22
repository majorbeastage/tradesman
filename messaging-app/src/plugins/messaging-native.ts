import { registerPlugin } from "@capacitor/core"

export interface MessagingNativePlugin {
  getFcmAvailability(): Promise<{ available: boolean }>
  prepareCallAudio(): Promise<void>
  setSpeakerOn(options: { enabled: boolean }): Promise<void>
  resetCallAudio(): Promise<void>
  openExternalUrl(options: { url: string }): Promise<void>
}

export const MessagingNative = registerPlugin<MessagingNativePlugin>("MessagingNative")
