import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Shared Capacitor shell: **one** Vite build (`webDir: dist`) ships inside **both** Android (`npx cap sync`) and iOS.
 * UI/TS/CSS changes apply to both stores after `npm run mobile:sync` (or per-platform open in Studio/Xcode).
 * Native-only pieces (Info.plist, AndroidManifest, entitlements, CocoaPods plugins) must be updated on **each** platform when adding permissions or native APIs.
 */
const config: CapacitorConfig = {
  appId: 'com.tradesman.app',
  appName: 'Tradesman',
  webDir: 'dist'
};

export default config;
