# Streamdeck on Firestick (Android APK)

The app is a full-stack web app: the Xtream API calls and the stream proxy run on
the server. The Android build is therefore a native shell that loads the published
site (`capacitor.config.ts` → `server.url`). Change that URL if you publish elsewhere.

## One-time setup on your Mac

1. Export the project to GitHub (Lovable → GitHub → Export), then `git clone` it.
2. Install dependencies and add the Android platform:

   ```bash
   npm install
   npx cap add android
   npx cap sync android
   ```

3. Install Android Studio (with the Android SDK + JDK 17).

## Build the APK

```bash
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Or in Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

## Install on the Firestick

1. On the Firestick: *Settings → My Fire TV → Developer Options* → enable
   **ADB debugging** and **Apps from Unknown Sources**. Note the device IP under
   *Settings → My Fire TV → About → Network*.
2. From the Mac:

   ```bash
   adb connect <firestick-ip>:5555
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

   (Alternative without a Mac: use the *Downloader* app on the Firestick and host
   the APK somewhere reachable.)

## After code changes

Because the shell loads the published site, you only need to hit **Publish** in
Lovable — the Firestick app picks up the new version on next launch. Rebuild the
APK only when the app id, name, icon or `server.url` changes.

## Signing a release APK

```bash
keytool -genkey -v -keystore streamdeck.keystore -alias streamdeck -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease
```

Add the keystore details to `android/app/build.gradle` (`signingConfigs`) before
running the release build.

## Notes

- Sign in with your account inside the app so the same playlists, favourites,
  hidden categories and ordering appear on the Firestick and on the Mac.
- Remote control: navigate with the D-pad; focused elements show a highlight ring.
- If a channel keeps loading only on the published site (and works in the Lovable
  preview), your IPTV provider is blocking the server's IP (HTTP 458). That is a
  provider-side block; a self-hosted relay (e.g. Dispatcharr on your own network)
  is the fix.
