# Android app

The Android app is the same React app as the website, packaged with **Capacitor 7**. The project is already generated in
`apps/web/android`. It shows the login screen, dashboards, class record and reports exactly like the website.

> **Not built or run on a phone yet.** The machine this was developed on has no Android SDK or JDK 17+, so the APK has
> never been assembled. The web build that goes into it is tested (in a phone-sized browser). Expect to fix small things on
> the first device run; the checklist at the bottom says what to look at.

## What the app needs

- Android 6.0 (API 23) or newer.
- The address of the school server (`http://192.168.1.10:3000` or `https://grades.yourschool.edu.ph`). The app asks for
  it on first start and remembers it; *More, My account, Change server address* changes it.
- A connection to that server to load and save grades. The app starts without internet but there is **no offline mode** in this version.
- Report cards and Excel files are opened through Android's share sheet (save to Files, print, open in another app).

## Build the APK yourself

Install once: **Android Studio** (current version, with the Android SDK 35) and **JDK 21** (Android Studio includes one).

```bash
npm install
npm run android:sync     # builds the web app and copies it into the Android project
npm run android:open     # opens Android Studio
```

In Android Studio: wait for Gradle to sync, then **Build, Build Bundle(s) / APK(s), Build APK(s)**. The file is
`apps/web/android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone (USB, Bluetooth, file sharing), open
it, allow *Install unknown apps* for the file manager when Android asks.

Command line instead (with `ANDROID_HOME` and `JAVA_HOME` set):
```bash
cd apps/web/android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
```

### Without installing anything: GitHub Actions

Push the project to a GitHub repository, open the **Actions** tab, choose **Android APK**, *Run workflow*. When it
finishes, download the artifact `bnhs-shs-grades-debug-apk`. (`.github/workflows/android.yml`; not yet run.)

### Release build and signing

A debug APK is fine for a school's own phones. For distribution outside the school (or the Play Store) create a keystore
and a signed release:

```bash
keytool -genkey -v -keystore bnhs-release.jks -alias bnhs -keyalg RSA -keysize 2048 -validity 10000
```
Then in Android Studio: **Build, Generate Signed Bundle / APK**. Keep the `.jks` file and its passwords safe; without
them you cannot publish updates. Never commit them (the `.gitignore` already excludes `*.jks` and `*.keystore`).

## Changing the app name, icon, version

- Name: `apps/web/capacitor.config.json` (`appName`) and `android/app/src/main/res/values/strings.xml`.
- Icon: replace `apps/web/public/favicon.svg`, run `npm run icons -w @bnhs/web`, then `npm run android:sync`.
- Version: `versionCode` / `versionName` in `apps/web/android/app/build.gradle`. Raise `versionCode` for each release.
- Package id: `ph.edu.bnhs.shsgrades`.

## How it connects

The app page runs from `http://localhost` inside the phone and calls the school server with normal web requests. The
server accepts that origin (CORS) and the Android project permits plain-`http` servers (`usesCleartextTraffic`, a network
security config) because school servers are usually on the local network. If you run the server on the internet, use
`https://`; nothing else needs changing. If you want to forbid plain http, set `cleartextTrafficPermitted="false"` in
`android/app/src/main/res/xml/network_security_config.xml` and `"cleartext": false` in `capacitor.config.json`.

## Checklist for the first device run

1. Connect screen accepts the server address and shows the login page (server reachable from the phone's Wi-Fi?).
2. Sign in, then the dashboard is not hidden under the status bar (`adjustMarginsForEdgeToEdge` is set to `force`).
3. Open a class record: *Learner* view is the default on a phone. Typing a score autosaves.
4. Reports: *Excel* / *SF9* open the share sheet.
5. The Android back button goes back one screen and exits from the dashboard.
6. Rotate the phone; sign out and in again; change the server address.

## Updating the app

Every web change needs `npm run android:sync` and a new APK. Because the phone app contains its own copy of the pages,
keep the app and the server at the same version (`Setup, System and backup` shows the server version).
