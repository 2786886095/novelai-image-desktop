import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../i18n/ios_update_text.dart';
import '../models/nai_models.dart';
import '../services/ios_update.dart';
import '../services/update_service.dart';
import '../state/app_state.dart';

class IosUpdateCard extends StatefulWidget {
  final IosUpdateCoordinator? coordinator;
  const IosUpdateCard({super.key, this.coordinator});
  @override
  State<IosUpdateCard> createState() => _IosUpdateCardState();
}

class _IosUpdateCardState extends State<IosUpdateCard> {
  IosUpdateSession? _session;
  bool _busy = false, _cancelled = false;
  double _progress = 0;
  String _phase = '', _error = '';
  File? _ready;
  UpdateInfo? _readyInfo;
  int _revision = 0;
  @override
  void dispose() {
    _revision++;
    unawaited(_session?.cancel() ?? Future<void>.value());
    super.dispose();
  }

  bool _same(UpdateInfo? a, UpdateInfo b) =>
      a?.latestVersion == b.latestVersion &&
      a?.currentVersion == b.currentVersion &&
      a?.ipaUrl == b.ipaUrl &&
      a?.ipaSha256 == b.ipaSha256 &&
      a?.ipaSize == b.ipaSize;
  Future<void> _download(AppState app, UpdateInfo info) async {
    if (_busy) return;
    final revision = ++_revision;
    setState(() {
      _busy = true;
      _progress = 0;
      _phase = 'downloading';
      _error = '';
      _ready = null;
      _readyInfo = null;
      _cancelled = false;
    });
    IosUpdateSession? session;
    try {
      session = (widget.coordinator ?? IosUpdate.coordinator)
          .reserve(app.settings, info);
      _session = session;
      final file = await session.download((value) {
        if (mounted && revision == _revision) setState(() => _progress = value);
      }, phase: (value) {
        if (mounted && revision == _revision) setState(() => _phase = value);
      });
      if (mounted &&
          revision == _revision &&
          !_cancelled &&
          _same(app.updateInfo, info)) {
        setState(() {
          _ready = file;
          _readyInfo = info;
          _phase = 'ready';
        });
      } else if (mounted && revision == _revision) {
        setState(() => _phase = '');
      }
    } catch (error) {
      if (mounted && revision == _revision) {
        setState(() {
          _phase = _cancelled ? 'cancelled' : 'failed';
          _error = _cancelled ? '' : error.toString();
        });
      }
    } finally {
      session?.release();
      if (identical(_session, session)) _session = null;
      if (mounted && revision == _revision) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    _cancelled = true;
    await _session?.cancel();
    if (mounted) setState(() => _phase = 'cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>(),
        text = iosUpdateText(app.settings.language),
        info = app.updateInfo;
    final readyCurrent =
        _ready != null && _readyInfo != null && _same(info, _readyInfo!);
    final label = switch (_phase) {
      'downloading' => text[6],
      'verifying' => text[7],
      'ready' => readyCurrent ? text[8] : '',
      'cancelled' => text[9],
      'failed' => text[10],
      _ => ''
    };
    return Card(
        key: const ValueKey('ios-update-card'),
        child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text[0], style: Theme.of(context).textTheme.titleMedium),
              Text(
                  '${text[11]} v$appVersion${info?.hasUpdate == true ? ' → v${info?.latestVersion}' : ''}'),
              Text(text[5], key: const ValueKey('ios-update-unsigned-notice')),
              if (info?.error != null)
                Text(text[10], key: const ValueKey('ios-update-check-error')),
              if (_busy) LinearProgressIndicator(value: _progress),
              if (label.isNotEmpty)
                Text(label, key: const ValueKey('ios-update-phase')),
              if (_error.isNotEmpty)
                Text(_error, key: const ValueKey('ios-update-error')),
              if (readyCurrent && _phase == 'ready')
                Text(text[12], key: const ValueKey('ios-update-files-hint')),
              if (readyCurrent && _phase == 'ready')
                SelectableText(_ready!.path,
                    key: const ValueKey('ios-update-ready-path')),
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton(
                    key: const ValueKey('ios-update-check'),
                    onPressed: _busy || app.updateChecking
                        ? null
                        : () => app.checkUpdate(manual: true),
                    child: Text(text[1])),
                if (info?.hasUpdate == true)
                  FilledButton(
                      key: const ValueKey('ios-update-download'),
                      onPressed: _busy ? null : () => _download(app, info!),
                      child: Text(text[2])),
                if (_busy)
                  OutlinedButton(
                      key: const ValueKey('ios-update-cancel'),
                      onPressed: _cancel,
                      child: Text(text[3])),
                TextButton(
                    key: const ValueKey('ios-update-release-page'),
                    onPressed: () => launchUrl(
                        Uri.parse(
                            'https://github.com/2786886095/novelai-image-desktop/releases/latest'),
                        mode: LaunchMode.externalApplication),
                    child: Text(text[4])),
              ]),
            ])));
  }
}
