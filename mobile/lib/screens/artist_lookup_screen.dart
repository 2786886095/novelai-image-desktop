import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../i18n/issue81_text.dart';
import '../services/artist_tag_service.dart';
import '../state/app_state.dart';
import '../ui/compact_workbench.dart';
import '../ui/global_typography.dart';

class ArtistLookupScreen extends StatefulWidget {
  final VoidCallback onBack;
  final ArtistTagService? service;
  const ArtistLookupScreen({super.key, required this.onBack, this.service});
  @override
  State<ArtistLookupScreen> createState() => _ArtistLookupScreenState();
}

class _ArtistLookupScreenState extends State<ArtistLookupScreen> {
  final _input = TextEditingController();
  late final _service = widget.service ?? ArtistTagService();
  bool _busy = false, _searched = false;
  String _error = '';
  List<ArtistIdentity> _matches = const [];
  String _t(String key) =>
      issue81Text(context.read<AppState>().settings.language, key);
  Future<void> _search() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
      _matches = const [];
      _searched = false;
    });
    try {
      final items =
          await _service.lookup(context.read<AppState>().settings, _input.text);
      if (mounted) {
        setState(() {
          _matches = items;
          _searched = true;
        });
      }
    } on InvalidArtistQuery {
      if (mounted) setState(() => _error = _t('invalid'));
    } catch (_) {
      if (mounted) setState(() => _error = _t('network'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(_t('copied'))));
    }
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AppState>();
    return Scaffold(
        appBar: workbenchAppBar(
            context,
            AppBar(
                leading: BackButton(onPressed: widget.onBack),
                title: studioAppBarTitle(context, Text(_t('lookup'))))),
        body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              Text(_t('lookupHint')),
              const SizedBox(height: 16),
              TextField(
                  key: const ValueKey('artist-lookup-input'),
                  controller: _input,
                  maxLength: 240,
                  minLines: 1,
                  maxLines: 3,
                  enabled: !_busy,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _search(),
                  decoration: InputDecoration(
                      labelText: _t('input'),
                      prefixIcon: const Icon(Icons.person_search_outlined))),
              const SizedBox(height: 8),
              FilledButton.icon(
                  onPressed: _busy ? null : _search,
                  icon: const Icon(Icons.search),
                  label: Text(_t('search'))),
              if (_busy)
                const Padding(
                    padding: EdgeInsets.all(16),
                    child: LinearProgressIndicator()),
              if (_error.isNotEmpty)
                Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(_error,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error))),
              if (_searched && _matches.isEmpty)
                Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_t('noMatch'))),
              if (_matches.isNotEmpty)
                Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(_t('matches'))),
              for (final artist in _matches)
                Card(
                    child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              SelectableText(artist.tag,
                                  style:
                                      Theme.of(context).textTheme.titleMedium),
                              const SizedBox(height: 8),
                              Text('Danbooru #${artist.id}',
                                  style:
                                      Theme.of(context).textTheme.labelMedium),
                              if (artist.aliases.isNotEmpty)
                                Text(artist.aliases.join(' · '),
                                    maxLines: 3,
                                    overflow: TextOverflow.ellipsis),
                              for (final url in artist.urls)
                                Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: SelectableText(url)),
                              const SizedBox(height: 8),
                              SelectableText(artist.naiPrompt),
                              const SizedBox(height: 12),
                              Wrap(spacing: 8, runSpacing: 8, children: [
                                OutlinedButton.icon(
                                    onPressed: () => _copy(artist.tag),
                                    icon: const Icon(Icons.copy, size: 18),
                                    label: Text(_t('copyTag'))),
                                FilledButton.tonalIcon(
                                    onPressed: () => _copy(artist.naiPrompt),
                                    icon: const Icon(Icons.auto_awesome,
                                        size: 18),
                                    label: Text(_t('copyNai'))),
                              ])
                            ]))),
            ]));
  }
}
