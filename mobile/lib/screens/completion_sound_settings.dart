import 'dart:convert';
import '../ui/settings_section.dart';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../i18n/parity_text.dart';
import '../models/completion_sound.dart';
import '../services/completion_sound.dart';
import '../state/app_state.dart';

class CompletionSoundSettings extends StatefulWidget {
  const CompletionSoundSettings({super.key});
  @override
  State<CompletionSoundSettings> createState() =>
      _CompletionSoundSettingsState();
}

class _CompletionSoundSettingsState extends State<CompletionSoundSettings> {
  bool busy = false;
  String? error;
  double? draftVolume;
  String t(String key) =>
      parityText(context.read<AppState>().settings.language, key);
  Future<void> save(CompletionSound value) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context
          .read<AppState>()
          .setSettings((s) => s.completionSound = value);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
          draftVolume = null;
        });
      }
    }
  }

  Future<void> choose() async {
    final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom, allowedExtensions: ['mp3', 'wav', 'ogg']);
    if (picked == null || !mounted) return;
    try {
      final f = picked.files.single;
      if (f.size > 1048576 || f.size == 0) throw const FormatException('size');
      final bytes = f.bytes ?? await File(f.path!).readAsBytes();
      final ext = f.name.split('.').last.toLowerCase();
      final mime = {'mp3': 'mpeg', 'wav': 'wav', 'ogg': 'ogg'}[ext];
      if (mime == null || bytes.length > 1048576) {
        throw const FormatException('format');
      }
      if (!mounted) return;
      final sound = context.read<AppState>().settings.completionSound.copyWith(
          dataUrl: 'data:audio/$mime;base64,${base64Encode(bytes)}',
          name: f.name);
      await save(sound);
    } catch (_) {
      if (mounted) setState(() => error = t('audioError'));
    }
  }

  @override
  void dispose() {
    CompletionAudio.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final sound = app.settings.completionSound;
    return SettingsSection(
        sectionKey: const ValueKey('completion-sound-section'),
        title: t('sound'),
        children: [
          SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t('enabled')),
              subtitle: Text(t('when')),
              value: sound.enabled,
              onChanged: busy ? null : (v) => save(sound.copyWith(enabled: v))),
          Align(
              alignment: Alignment.centerLeft,
              child: Text(
                  '${t('volume')} ${((draftVolume ?? sound.volume) * 100).round()}%')),
          Slider(
              value: draftVolume ?? sound.volume,
              onChanged: busy ? null : (v) => setState(() => draftVolume = v),
              onChangeEnd: (v) => save(sound.copyWith(volume: v))),
          Align(alignment: Alignment.centerLeft, child: Text(t('custom'))),
          const SizedBox(height: 8),
          Align(
              alignment: Alignment.centerLeft,
              child: Text(sound.name.isEmpty ? t('builtin') : sound.name,
                  maxLines: 2, overflow: TextOverflow.ellipsis)),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(
                onPressed: busy ? null : choose,
                icon: const Icon(Icons.audio_file_outlined),
                label: Text(t('choose'))),
            OutlinedButton(
                onPressed: busy
                    ? null
                    : () async {
                        final ok =
                            await CompletionAudio.play(sound, preview: true);
                        if (!ok && mounted) {
                          setState(() => error = t('audioError'));
                        }
                      },
                child: Text(t('preview'))),
            TextButton(
                onPressed: busy
                    ? null
                    : () => save(sound.copyWith(dataUrl: '', name: '')),
                child: Text(t('reset'))),
          ]),
          if (error != null)
            Text(error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ]);
  }
}
