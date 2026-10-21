/// Single source of truth for the app configuration.
///
/// The only value that normally changes between environments is [adminUrl].
class AppConfig {
  const AppConfig._();

  static const String appTitle = 'Camzy Admin';

  /// Address of the existing Camzy Admin panel.
  ///
  /// Default value targets the local Node server (`server/app.js`) from the
  /// Android emulator, where the host machine is reachable at `10.0.2.2`.
  ///
  /// Override it at build time without editing any file:
  ///
  /// ```
  /// flutter run --dart-define=ADMIN_URL=https://example.com/admin/
  /// flutter build apk --release --dart-define=ADMIN_URL=https://example.com/admin/
  /// ```
  static const String adminUrl = String.fromEnvironment(
    'ADMIN_URL',
    defaultValue: 'http://80.210.31.214:3000/admin/',
  );
}
