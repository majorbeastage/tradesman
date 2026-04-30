import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Shared Capacitor shell: **one** Vite build (`webDir: dist`) ships inside **both** Android (`npx cap sync`) and iOS.
 * UI/TS/CSS changes apply to both stores after `npm run mobile:sync` (or per-platform open in Studio/Xcode).
 * Native-only pieces (Info.plist, AndroidManifest, entitlements, CocoaPods plugins) must be updated on **each** platform when adding permissions or native APIs.
 */
const config: CapacitorConfig = {
  appId: 'com.tradesmanus.com',
  appName: 'Tradesman',
  webDir: 'dist',
  // Android: without `alert`, FCM delivers in foreground but the plugin never calls
  // NotificationManager.notify — so "test push sent" can succeed with nothing visible.
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
