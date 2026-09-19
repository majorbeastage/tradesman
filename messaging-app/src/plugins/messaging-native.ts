import { registerPlugin, type PluginListenerHandle } from "@capacitor/core"

export interface MessagingNativePlugin {
  getFcmAvailability(): Promise<{ available: boolean }>
  consumeLaunchPushData(): Promise<Record<string, string>>
  consumePendingDial(): Promise<{ phone?: string; label?: string }>
  addListener(
    eventName: "pushLaunch" | "pendingDial",
    listenerFunc: (data: Record<string, string>) => void,
  ): Promise<PluginListenerHandle>
  prepareCallAudio(options?: { speaker?: boolean }): Promise<void>
  startCallRingtone(): Promise<void>
  stopCallRingtone(): Promise<void>
  setSpeakerOn(options: { enabled: boolean }): Promise<void>
  resetCallAudio(): Promise<void>
  openExternalUrl(options: { url: string }): Promise<void>
}

export const MessagingNative = registerPlugin<MessagingNativePlugin>("MessagingNative")
