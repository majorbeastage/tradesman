# Android app — beginner guide (Tradesman + Capacitor)

You are not doing anything wrong if this feels confusing. Android Studio is a big tool, and this project is a **web app** (React) **inside** a thin **native Android shell** (Capacitor). You only touch Android Studio to **build**, **run on a device/emulator**, and sometimes **fix native config**.

---

## What you actually have (mental model)

| Piece | What it is |
|--------|------------|
| `tradesman/` (repo root) | Your **source code**. You edit React/TS here. |
| `npm run build` | Produces **`dist/`** — the built website. |
| `npm run mobile:sync` | Copies **`dist/`** into the Android project and updates native plugins. |
| `tradesman/android/` | The **Android Studio project**. Gradle, manifest, icons, etc. |
| Android Studio | Opens **`android/`**, compiles Java/Kotlin bits, packages **`dist/`** into an APK. |

**Rule of thumb:** Change the website → run **`npm run mobile:sync`** → then **Run** again in Android Studio.

---

## Google Play (first release)

1. Put production **`VITE_*`** values in place, then **`npm run mobile:sync`** (the shipped `dist` is what users get until you upload a new build).
2. Add **`android/keystore.properties`** + your **`.jks`** (see **`keystore.properties.example`**), then **`npm run mobile:build:android`** — output **`app/build/outputs/bundle/release/app-release.aab`** for Play Console.
3. Before each new Play upload, bump **`versionCode`** in **`app/build.gradle`** (Play rejects repeats). **`versionName`** tracks **`package.json`** automatically.

Full checklist: **`google-play-app-todos.txt`** at repo root.

---

## App icon (same as browser tab)

The favicon / PWA icon is **`public/icon.png`** (see root **`index.html`**). Native launcher assets are generated from that file so the **home-screen icon matches the tab logo**.

1. Replace **`public/icon.png`** with your updated square artwork (keep roughly **512×512** or larger, PNG).
2. From repo root, run:

   ```powershell
   npm run icons:generate
   ```

   This overwrites Android **`mipmap-*/ic_launcher*.png`** and iOS **`AppIcon.appiconset/AppIcon-512@2x.png`** (1024×1024). Adaptive icon **background** is **`#000000`** in **`android/app/src/main/res/values/ic_launcher_background.xml`** to match the black canvas on **`icon.png`**.
3. Then **`npm run mobile:sync`** (or your usual release build) and rebuild the APK / AAB in Android Studio.

---

## One-time setup

1. **Install [Android Studio](https://developer.android.com/studio)** (includes Android SDK and a bundled JDK).

2. **First launch:** complete the setup wizard and let it install **Android SDK** and at least one **system image** (e.g. a recent **Pixel** + **API 34+**) if you want an emulator.

3. **Open the correct folder (important)**  
   - In Android Studio: **File → Open**  
   - Choose: **`C:\Users\snyde\tradesman\android`** (the **`android`** folder, **not** the whole `tradesman` repo).  
   - Wait for **Gradle sync** (progress bar bottom). First time can take several minutes.

4. **`local.properties`** (SDK path)  
   - If Gradle complains about the SDK: Android Studio usually creates **`android\local.properties`** automatically.  
   - If not, copy **`local.properties.example`** to **`local.properties`** and set `sdk.dir` to your SDK, typically:  
     `C:\Users\YOUR_USER\AppData\Local\Android\Sdk`  
     (use forward slashes `/` in the file, as in the example).

5. **JDK**  
   - Prefer **Android Studio’s bundled JDK**: **File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** → pick **Embedded JDK** or **jbr** from Studio.  
   - Command-line builds: the repo script **`npm run mobile:build:android`** tries to find Java (including Studio’s **jbr**).

---

## JAVA_HOME for PowerShell

Android Studio has its **own** Java install (**jbr**). PowerShell does **not** see it until you point **`JAVA_HOME`** at that folder.

**1. Find the folder (must contain `bin\java.exe`):**  
Common locations:

- `C:\Program Files\Android\Android Studio\jbr`
- `C:\Program Files\Android\Android Studio\jbr\bin` ← **wrong**; use the parent **`jbr`**, not `bin`.

Check in PowerShell:

```powershell
Test-Path "C:\Program Files\Android\Android Studio\jbr\bin\java.exe"
```

If that is `False`, try:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Programs\Android" -Recurse -Filter "java.exe" -ErrorAction SilentlyContinue | Select-Object -First 3 FullName
```

Pick the folder **above** `bin` (e.g. …`\jbr`).

**2. This PowerShell window only** (good for a quick test):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

Then run **`gradlew`** from **`android`** again.

**3. Permanent (recommended)** — set a **User** environment variable so every new terminal works:

```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
```

Close **all** PowerShell windows, open a **new** one, then:

```powershell
java -version
```

If `java` is still not found, add **`%JAVA_HOME%\bin`** to your **User** `Path` (Windows **Settings → System → About → Advanced system settings → Environment Variables** → edit **Path** under your user → **New** → `%JAVA_HOME%\bin`).

**Easiest path without touching JAVA_HOME:** from repo root run **`npm run mobile:build:android`** — that script locates Studio’s JDK for that run.

---

## Every time you want to run the app on a phone or emulator

Do these **in order**:

1. **From repo root** (`tradesman`):

   ```powershell
   npm run mobile:sync
   ```

   That rebuilds the web app and copies it into Android.

2. **In Android Studio** (project `android` already open):

   - Pick a **device** at the top (emulator or USB phone with **USB debugging** on).
   - Click the green **Run** ▶ (or **Shift+F10**).

You should see your Tradesman web UI inside the native app.

---

## If you only use the terminal (optional)

From repo root:

```powershell
npm run mobile:build:android
```

That runs **`mobile:sync`**, then **`gradlew assembleDebug`**, and prints where **`app-debug.apk`** was written. You can install that APK on a device for testing.

---

## When something breaks (short checklist)

1. **Gradle / “Sync failed”**  
   - **File → Invalidate Caches → Invalidate and Restart** (use sparingly; it’s slow).  
   - Then **File → Sync Project with Gradle Files**.

2. **Build failed after weird resource / AAPT2 errors**  
   - In Android Studio: **Build → Clean Project**, then **Build → Rebuild Project**.  
   - If it still fails, close Studio, delete folder:  
     `%USERPROFILE%\.gradle\caches\8.14.3\transforms`  
     then open the project again and rebuild.

3. **“JAVA_HOME” / Java errors in PowerShell**  
   - See **[JAVA_HOME for PowerShell](#java_home-for-powershell)** above.

4. **Old web changes not showing**  
   - You forgot **`npm run mobile:sync`** after editing the site. Run it, then Run ▶ again.

---

## Project-specific fixes already in this repo

- **Android Gradle Plugin** is pinned to **8.10.0** (with **Gradle 8.11.1**). **AGP 8.13** bundles **AAPT2 8.13.x**, which can crash on some **Windows** machines while compiling resources from **androidx.core**. Slightly older AGP avoids that toolchain. (Use a version that exists on Google Maven — **8.10.2** is not published.)
- **`npm install`** runs **`scripts/align-android-agp.cjs`**, which rewrites the AGP version inside **`node_modules/@capacitor/android/.../build.gradle`** so it matches **`android/build.gradle`** (Capacitor otherwise hard-codes **8.13.x**).
- **`androidx.core`** is forced to a single version in **`android/build.gradle`** (see **`variables.gradle`**) so all modules agree; it must stay **≥1.13** for **Capacitor 8** / **AppCompat** (`OnUserLeaveHintProvider`, etc.).
- **`gradle.properties`** uses more heap and UTF-8 for Gradle.

Details live in **`variables.gradle`** and the root **`android/build.gradle`** if you need them later.

---

## Where to get help next

- **Capacitor:** [https://capacitorjs.com/docs](https://capacitorjs.com/docs)  
- **Android Studio basics:** [https://developer.android.com/studio/intro](https://developer.android.com/studio/intro)

You can ignore most Android Studio features until you need them; **Open `android`**, **sync**, **Run**, and **`npm run mobile:sync`** when the website changes is enough to get started.
