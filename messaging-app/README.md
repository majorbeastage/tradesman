# Tradesman Messaging (standalone app)

A lightweight, standalone mobile app for **internal team instant messaging** — the mobile
counterpart to the desktop messenger widget in the main Tradesman platform. Icon: the
conversation-cloud-with-T mark.

It talks to the **same Supabase project** as the main app and uses the same
`internal_threads` / `internal_thread_members` / `internal_messages` tables
(`supabase/internal-messaging.sql` in the main repo). It never messages customers.

## Status

Working:
- Supabase client + auth (email/password login fallback)
- **Shared auto-login** handoff from the full mobile app (deep link, see below)
- Team contact list + 1:1 threads + send/receive with Supabase Realtime
- Ad-hoc groups, customer references, attachments, edit/delete, mute, and push notifications
- In-app PSTN softphone through Twilio Voice, plus a device-dialer option
- **Internal team calling — audio + video conference** (WebRTC, no Twilio). 📞/🎥
  buttons in the chat header start a call with everyone in the thread; incoming
  calls take over the screen with Accept/Decline. Shares the same signaling
  (`rtc-inbox-<uid>` / `rtc-room-<roomId>` Supabase Realtime channels) as the
  desktop widget, so desktop ⇄ mobile calls interoperate. See
  `src/lib/useConferenceRoom.ts` + `src/screens/ConferenceCallView.tsx`.
- Teammates can be invited into an active team call.
- Calendar, activity, missed-call handling, availability, and Android native
  call-audio routing.

### External numbers and team calls

An external phone number is **not** added to the WebRTC team conference. The
current Twilio Voice API starts a separate PSTN softphone call and has no media
gateway into the Supabase-signaled peer-to-peer room. The in-call UI therefore
labels this action as separate, confirms it, leaves the team call, and then
starts the business-line phone call.

A true shared PSTN/team conference requires an architectural decision and
server-side implementation (for example, moving the room to Twilio Conference
or adding an SFU/PSTN gateway), including participant lifecycle, auth, billing,
recording/consent, and failure handling. Do not simulate this with two local
audio sessions.

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

The main app can launch this app with the auth handoff and can hand off a phone
number or thread target.

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
npx cap sync android
cd android
./gradlew assembleDebug        # test APK
./gradlew bundleRelease        # Play Console AAB
./gradlew assembleRelease      # optional release APK
```

Windows PowerShell uses `.\gradlew.bat` in place of `./gradlew`.

Artifacts:
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Release APK: `android/app/build/outputs/apk/release/app-release.apk`

Release signing reads `android/keystore.properties` from the main app first,
then `messaging-app/android/keystore.properties`. A release artifact is only
uploadable when a valid keystore and passwords are available. Keep signing
files out of source control.

`appId`: `com.tradesmanus.messaging` · `appName`: `Tradesman Messaging`
(see `capacitor.config.ts`). Register the `tradesmanmsg` URL scheme on each
platform for the shared-login deep link.
