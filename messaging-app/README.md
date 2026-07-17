# Tradesman Messaging (standalone app)

A lightweight, standalone mobile app for **internal team instant messaging** — the mobile
counterpart to the desktop messenger widget in the main Tradesman platform. Icon: the
conversation-cloud-with-T mark.

It talks to the **same Supabase project** as the main app and uses the same
`internal_threads` / `internal_thread_members` / `internal_messages` tables
(`supabase/internal-messaging.sql` in the main repo). It never messages customers.

## Status: scaffold (Phase 2 start)

Working in this scaffold:
- Supabase client + auth (email/password login fallback)
- **Shared auto-login** handoff from the full mobile app (deep link, see below)
- Team contact list + 1:1 threads + send/receive with Supabase Realtime
- Ad-hoc groups, customer references, dial-out via `twilio-bridge-call`
- **Internal team calling — audio + video conference** (WebRTC, no Twilio). 📞/🎥
  buttons in the chat header start a call with everyone in the thread; incoming
  calls take over the screen with Accept/Decline. Shares the same signaling
  (`rtc-inbox-<uid>` / `rtc-room-<roomId>` Supabase Realtime channels) as the
  desktop widget, so desktop ⇄ mobile calls interoperate. See
  `src/lib/useConferenceRoom.ts` + `src/screens/ConferenceCallView.tsx`.

Roadmap (parity with desktop widget): presence dots, push notifications,
conference "add participant", external (non-team) invite links.

### Calling requires camera/mic permission (native)

WebRTC uses `getUserMedia`. When you generate the native projects, add:

- **Android** (`android/app/src/main/AndroidManifest.xml`):
  ```xml
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
  <uses-permission android:name="android.permission.INTERNET" />
  ```
  The Capacitor WebView also needs runtime permission grants; `getUserMedia`
  prompts are handled by the system WebView on API 33+.
- **iOS** (`ios/App/App/Info.plist`):
  ```xml
  <key>NSCameraUsageDescription</key><string>Video calls with your team.</string>
  <key>NSMicrophoneUsageDescription</key><string>Voice calls with your team.</string>
  ```

## Shared auto-login (link into the full mobile app)

Goal: if the user is logged into the full Tradesman app, this app logs in as the
same user **without** re-entering credentials.

Approach — **secure deep-link session handoff** (no shared password storage):

1. The full mobile app adds a "Messaging" launch that reads its current Supabase
   session and opens this app via its custom URL scheme with the tokens in the
   URL **fragment** (fragments are not sent to servers / logs):

   ```
   tradesmanmsg://auth#access_token=<JWT>&refresh_token=<RT>
   ```

2. This app listens for `appUrlOpen` (Capacitor App plugin), parses the fragment,
   and calls `supabase.auth.setSession({ access_token, refresh_token })`.
   See `src/lib/sharedAuth.ts`.

3. If no handoff is present and there's no stored session, the user sees the
   email/password login screen (`src/screens/LoginScreen.tsx`).

> The main-app side (generating the deep link on a button tap) is a small change
> in the main repo and is intentionally **not** included yet — this scaffold
> implements the *receiving* side and a login fallback so it runs today.

## Setup

```bash
cd messaging-app
cp .env.example .env      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (same as main app)
npm install
npm run dev               # web preview
```

## Mobile (Capacitor)

```bash
npm run build
npx cap add android
npx cap add ios
npx cap sync
npx cap open android      # / ios
```

`appId`: `com.tradesmanus.messaging` · `appName`: `Tradesman Messaging`
(see `capacitor.config.ts`). Register the `tradesmanmsg` URL scheme on each
platform for the shared-login deep link.
