import 'package:flutter/material.dart';

import 'src/admin_web_view_page.dart';
import 'src/app_config.dart';
import 'src/web_view_platform.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureWebViewPlatform();
  runApp(const CamzyAdminApp());
}

class CamzyAdminApp extends StatelessWidget {
  const CamzyAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appTitle,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
        ),
      ),
      home: const AdminWebViewPage(),
    );
  }
}
