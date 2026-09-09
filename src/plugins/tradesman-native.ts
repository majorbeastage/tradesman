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
  /** iOS: show the system camera prompt so WKWebView camera use does not crash. */
  requestCameraAccess(): Promise<{ granted: boolean }>
  /** iOS: show the system microphone prompt so dictation / recording is not a no-op. */
  requestMicrophoneAccess(): Promise<{ granted: boolean }>
  /**
   * iOS: pick a photo via the system camera or library (iPad-safe).
   * Avoids WKWebView `<input type="file">` → Take Photo, which TCC-kills the app
   * if NSCameraUsageDescription is missing from the shipped Info.plist.
   */
  pickImage(options?: { source?: "prompt" | "camera" | "photos" }): Promise<{
    cancelled?: boolean
    dataUrl?: string
    mimeType?: string
    fileName?: string
    error?: string
  }>
}

export const TradesmanNative = registerPlugin<TradesmanNativePlugin>("TradesmanNative")
