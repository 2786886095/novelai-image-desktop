import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import '../state/app_state.dart';
import '../models/nai_models.dart';
import 'external_mcp_server.dart';
import 'mobile_mcp_tools.dart';

/// Owned by the app, not a recycled settings ListView child. Scrolling or
/// switching pages cannot silently disable the user's local connection.
class ExternalMcpRuntime extends ChangeNotifier {
  final AppState app;
  ExternalMcpServer? server;
  MobileMcpTools? _host;
  bool changing=false, _disposed=false;
  int budget=0;
  ExternalMcpRuntime(this.app);
  void _changed(){if(!_disposed)notifyListeners();}
  void setBudget(int value){if(server==null && !changing){budget=value.clamp(0,100000);_changed();}}
  Future<void> toggle() async {
    if(changing || _disposed)return;
    changing=true;_changed();
    try {
      if(server!=null){await _stop();}
      else {
        final root=await getApplicationSupportDirectory();
        if(_disposed)return;
        final host=MobileMcpTools(app:app,assets:Directory('${root.path}/external-mcp/assets'),budget:()=>budget);
        _host=host;await host.load();
        if(_disposed){host.dispose();_host=null;return;}
        final next=ExternalMcpServer(journal:Directory('${root.path}/external-mcp/journal'),tools:mobileMcpSchemas(),prepare:host.prepare,version:appVersion);
        server=next;next.addListener(_changed);await next.start();
        if(_disposed)await _stop();
      }
    } catch (_) {await _stop();rethrow;}
    finally {changing=false;_changed();}
  }
  Future<void> _stop() async {
    final previous=server,host=_host;server=null;_host=null;
    previous?.removeListener(_changed);
    // Close the host's session controller first: cancellation fences prevent
    // a pending approval or next queued image from becoming another request.
    host?.controller.tools.sessions.close();
    await previous?.close();host?.dispose();
  }
  @override void dispose(){_disposed=true;unawaited(_stop());super.dispose();}
}
