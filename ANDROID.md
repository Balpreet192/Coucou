# Coucou Android app

The website remains in the repository root and continues to be the GitHub Pages source. Capacitor packages a staged copy of its HTML, CSS, and JavaScript into `www/`; do not edit `www/` directly.

## One-time setup

Install Node.js 20 or newer and Android Studio with its Android SDK. In the repository root, run:

```powershell
npm install
npm run android:add
```

The first command installs the Capacitor plugins and build tools. The second generates the branded Android icon/splash resources, stages the website, and creates the native `android/` project. Commit the generated `android/` project and `package-lock.json` so the native project is part of the repository.

In the Supabase dashboard, add this exact URL to **Authentication → URL Configuration → Redirect URLs**:

```text
coucou://auth/callback
```

The Android deep link must also be registered after `android:add`. Add this intent filter inside the `.MainActivity` activity in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="coucou" android:host="auth" android:path="/callback" />
</intent-filter>
```

This routes Supabase email-confirmation and password-recovery links back into the app. Keep the existing website redirect unchanged for browser visitors. For a public Play Store release, move to a verified HTTPS Android App Link on a domain you control and add its `assetlinks.json`; the temporary `coucou://` scheme is intended for setup/testing.

## Build and install a test APK

After one-time setup and the manifest change, connect an Android phone with USB debugging enabled (or start an Android Studio emulator), then run:

```powershell
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

The installable debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected device with `.\gradlew.bat installDebug`, or copy the APK to the phone and open it to install. Android may ask you to allow installation from that file manager.

After changing any website source files, return to the repository root and run `npm run android:sync` before rebuilding. To open the Android project in Android Studio, run `npm run android:open`.

## Permissions and release preparation

The app needs network access for Supabase, the existing APIs, and remote artwork. Capacitor's Android template supplies the standard `INTERNET` permission. No camera, microphone, contacts, or location permission is added because the current website does not use those device features.

The debug APK is for testing only. Before a Play Store release, set a permanent unique `appId`, configure a verified HTTPS app link, review the generated Android SDK/target settings against current Play requirements, create and securely store a release signing key, build a signed Android App Bundle (`.aab`), and complete Play Console privacy/data-safety and store-listing requirements. Never commit signing keys or passwords.

## Device checks

On a real phone, verify navigation, sign-in/sign-out, email confirmation, password recovery, post and collection saving, user profile data, search/API results, and remote cover/artwork images. Supabase auth/database calls and collection persistence continue to use the existing website client and Supabase project; this setup does not migrate or replace either.
