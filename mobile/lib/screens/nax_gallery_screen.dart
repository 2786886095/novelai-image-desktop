import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../ui/compact_workbench.dart';
import '../ui/global_typography.dart';

const naxSite = 'https://nax.moe/';
const naxModels = ['V5', 'V4.5', 'V4'];
// The desktop and mobile directory must contain the same permanent IDs.
const naxCollections = <(String, String, String)>[
  ('V5', 'Artist Tags · Constrained', 'danbooru-artist-tags-v5'),
  ('V5', 'Artist Tags · Loose', 'danbooru-artist-tags-2-v5'),
  ('V5', 'Artist Tags · Loose (Male)', 'danbooru-artist-tags-male-2-v5'),
  ('V5', 'Character Tags', 'danbooru-character-tags-v5'),
  ('V5', 'Hair Tags', 'danbooru-hair-tags-v5'),
  ('V4.5', 'Artist Tags · Constrained', 'danbooru-artist-tags-v4.5'),
  ('V4.5', 'Artist Tags · Loose', 'danbooru-artist-tags-2-v4.5'),
  ('V4.5', 'Character Tags', 'danbooru-character-tags-v4.5'),
  ('V4.5', 'Copyright Tags', 'danbooru-copyright-tags-v4.5'),
  ('V4.5', 'Curated Artists', 'artists-v4.5'),
  ('V4.5', 'Face Tags', 'danbooru-face-tags-v4.5'),
  ('V4.5', 'Hair Tags', 'danbooru-hair-tags-v4.5'),
  ('V4', 'Artist Tags', 'danbooru-artist-tags-v4'),
  ('V4', 'Character Tags', 'danbooru-character-tags-v4'),
  ('V4', 'Face Tags', 'danbooru-face-tags-v4'),
];

Uri naxCollectionUrl(String id) => Uri.https('nax.moe', '/', {'gallery': id});

class NaxGalleryScreen extends StatelessWidget {
  const NaxGalleryScreen({super.key, required this.language});
  final String language;

  @override
  Widget build(BuildContext context) {
    final hint = switch (language) {
      'zh-CN' => '按模型浏览 Tag 实验合集。点击打开原站。',
      'zh-TW' => '依模型瀏覽 Tag 實驗合集。點擊開啟原站。',
      'ja-JP' => 'モデル別のタグ実験を元のサイトで閲覧します。',
      'ko-KR' => '모델별 태그 실험을 원본 사이트에서 봅니다.',
      _ => 'Browse tag experiments by model on the original site.',
    };
    Future<void> open(Uri link) async {
      try {
        if (await launchUrl(link, mode: LaunchMode.externalApplication)) return;
      } catch (_) {/* Provide the exact URL for a manual retry. */}
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(link.toString())));
      }
    }

    return Scaffold(
      appBar: workbenchAppBar(
          context,
          AppBar(
            title: studioAppBarTitle(context, const Text('NAX')),
            actions: [
              IconButton(
                  tooltip: 'nax.moe',
                  icon: const Icon(Icons.open_in_new),
                  onPressed: () => open(Uri.parse(naxSite)))
            ],
          )),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('NovelAI Tag Experiments',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Text(hint),
        const SizedBox(height: 6),
        TextButton(
            onPressed: () =>
                open(Uri.parse('https://creativecommons.org/licenses/by/4.0/')),
            child: const Text('u/Carlyone · CC BY 4.0')),
        for (final model in naxModels) ...[
          const SizedBox(height: 10),
          Text(model, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Card(
              child: Column(children: [
            for (final (m, title, id) in naxCollections)
              if (m == model)
                ListTile(
                    title: Text(title),
                    trailing: const Icon(Icons.open_in_new),
                    onTap: () => open(naxCollectionUrl(id))),
          ])),
        ],
      ]),
    );
  }
}
