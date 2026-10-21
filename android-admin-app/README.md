# Camzy Admin — Android app

A thin, production-ready Flutter wrapper that opens the **existing** Camzy
Admin panel (`server/app.js` → `/admin/`) inside a WebView.

The Admin UI, frontend, backend, database and API are **not** modified or
rebuilt. This project only displays the panel and provides correct native
back navigation, a persistent session, JavaScript and local storage.

## Changing the Admin URL

The address is defined in **one** place:

`lib/src/app_config.dart`

```dart
static const String adminUrl = String.fromEnvironment(
  'ADMIN_URL',
  defaultValue: 'http://10.0.2.2:3000/admin/',
);
```

You can either edit the `defaultValue`, or override it per build with
`--dart-define` (no code change):

```bash
flutter run       --dart-define=ADMIN_URL=https://your-host/admin/
flutter build apk --release --dart-define=ADMIN_URL=https://your-host/admin/
```

Default values that map to the local Node server:

| Target              | URL                              |
| ------------------- | -------------------------------- |
| Android emulator    | `http://10.0.2.2:3000/admin/`    |
| Physical device     | `http://<your-LAN-IP>:3000/admin/` |
| Production (https)  | `https://<your-domain>/admin/`   |

## Prerequisites

- Flutter SDK (3.24+)
- Android SDK + a device/emulator (API 23+)
- JDK 17 (Android Gradle Plugin requirement)

## First-time setup (once, after cloning)

The Gradle wrapper and launcher icons are binary/generated files and are not
stored in Git. Generate them once:

```bash
# Windows
.\bootstrap.ps1
```

The script runs `flutter create` into a temporary folder and copies only the
missing files (gradle wrapper jar + scripts, launcher icons, `.metadata`) into
this project. It never overwrites any committed file.

## Run and build

```bash
flutter pub get

# Debug (default URL = emulator -> local server)
flutter run

# Release APK (set your real URL)
flutter build apk --release --dart-define=ADMIN_URL=https://your-host/admin/

# Output
#   build/app/outputs/flutter-apk/app-release.apk
```

To point a physical device at your LAN server during development:

```bash
flutter run --dart-define=ADMIN_URL=http://192.168.x.x:3000/admin/
```

> `http://` (cleartext) is only permitted for `localhost`, `127.0.0.1` and the
> emulator host `10.0.2.2` in **release** builds. Debug builds additionally
> allow any cleartext host, so you can use a LAN IP while developing. Use `https://`
> for production.

## Session / login

The Admin panel stores its token in `localStorage` (`as_admin_session`) and
authenticates with `Authorization: Bearer`. DOM storage and the WebView cookie
jar are both enabled and persist across app restarts, so the Admin login works
normally and the user stays logged in.

## Back navigation

The Android back button walks the WebView's own history first and only closes
the app when there is nothing left to go back to.

## Project layout

```
android-admin-app/
  lib/main.dart                        # app entry
  lib/src/app_config.dart              # THE Admin URL constant
  lib/src/web_view_platform.dart        # Android WebView settings + file upload
  lib/src/admin_web_view_page.dart     # WebView page, back nav, error state
  android/                             # native Android host
  bootstrap.ps1                        # one-time generated files (gradle wrapper, icons)
```
