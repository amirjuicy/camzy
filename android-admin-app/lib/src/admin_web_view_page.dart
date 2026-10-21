import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'app_config.dart';
import 'web_view_platform.dart';

/// Hosts the existing Admin panel. The Admin UI itself is not modified or
/// rebuilt here, it is only displayed inside a WebView.
class AdminWebViewPage extends StatefulWidget {
  const AdminWebViewPage({super.key});

  @override
  State<AdminWebViewPage> createState() => _AdminWebViewPageState();
}

class _AdminWebViewPageState extends State<AdminWebViewPage> {
  late final WebViewController _controller;
  int _progress = 100;
  bool _mainFrameFailed = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            if (mounted) {
              setState(() => _progress = progress);
            }
          },
          onPageStarted: (String _) {
            if (mounted) {
              setState(() => _mainFrameFailed = false);
            }
          },
          onWebResourceError: (WebResourceError error) {
            if (error.isForMainFrame == true && mounted) {
              setState(() => _mainFrameFailed = true);
            }
          },
        ),
      );

    // Route `<input type="file">` requests to the system file picker.
    if (WebViewPlatform.instance is AndroidWebViewPlatform) {
      final AndroidWebViewController android =
          _controller.platform as AndroidWebViewController;
      unawaited(android.setOnShowFileSelector(openAdminFileSelector));
    }

    _controller.loadRequest(Uri.parse(AppConfig.adminUrl));
  }

  /// Android back button: walk the Admin panel's history first, leave the app
  /// only when there is nothing left to go back to.
  Future<void> _onSystemBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return;
    }
    await SystemNavigator.pop();
  }

  Future<void> _retry() async {
    setState(() {
      _mainFrameFailed = false;
      _progress = 0;
    });
    await _controller.loadRequest(Uri.parse(AppConfig.adminUrl));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (didPop) {
          return;
        }
        _onSystemBack();
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: <Widget>[
              WebViewWidget(controller: _controller),
              if (_mainFrameFailed)
                Positioned.fill(child: _LoadError(onRetry: _retry)),
              if (_progress > 0 && _progress < 100)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(value: _progress / 100),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                Icons.cloud_off_outlined,
                size: 48,
                color: Theme.of(context).colorScheme.outline,
              ),
              const SizedBox(height: 16),
              Text(
                'اتصال به پنل مدیریت برقرار نشد.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 8),
              Text(
                AppConfig.adminUrl,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('تلاش دوباره'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
