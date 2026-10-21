import 'package:file_selector/file_selector.dart' as file_selector;
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// Applies the Android WebView settings the Admin panel needs.
///
/// Must run before any [WebViewController] is created, so it is called from
/// `main()` before `runApp()`.
///
/// In `webview_flutter_android` 4.x JavaScript, DOM storage and database
/// storage are already enabled by default on every controller; this only makes
/// sure the Android platform implementation is the active one.
Future<void> configureWebViewPlatform() async {
  if (WebViewPlatform.instance is! AndroidWebViewPlatform) {
    return;
  }
}

/// Opens the system picker for the Admin panel's `<input type="file">`
/// elements (product images, gallery, ...).
Future<List<String>> openAdminFileSelector(FileSelectorParams params) async {
  try {
    final files = await file_selector.openFiles(
      acceptedTypeGroups: const <file_selector.XTypeGroup>[
        file_selector.XTypeGroup(label: 'files'),
      ],
    );
    return <String>[for (final file in files) file.path];
  } catch (_) {
    return const <String>[];
  }
}