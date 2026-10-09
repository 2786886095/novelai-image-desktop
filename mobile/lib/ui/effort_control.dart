import 'package:flutter/material.dart';

const _effortTitles = <String, String>{
  'zh-CN': '生成档位（Effort）',
  'zh-TW': '生成檔位（Effort）',
  'en-US': 'Generation Effort',
  'ja-JP': '生成 Effort',
  'ko-KR': '생성 Effort',
};
String effortTitle(Object? language) => _effortTitles[language] ?? _effortTitles['en-US']!;

String effortRemainingTitle(Object? language) => const {'zh-CN':'预计可生成张数','zh-TW':'預計可生成張數','en-US':'Estimated remaining images','ja-JP':'生成可能枚数の目安','ko-KR':'예상 잔여 이미지 수'}[language] ?? 'Estimated remaining images';

class EffortControl extends StatelessWidget {
  final String model, value;
  final Object? language;
  final ValueChanged<String> onChanged;
  const EffortControl({super.key, required this.model, required this.value, required this.language, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    if (model.replaceFirst(RegExp(r'-inpainting$'), '') != 'nai-diffusion-5-full') return const SizedBox.shrink();
    return Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(effortTitle(language)),
      const SizedBox(height: 6),
      SegmentedButton<String>(segments: const [ButtonSegment(value:'medium',label:Text('Medium')), ButtonSegment(value:'high',label:Text('High'))], selected:{value}, onSelectionChanged:(values)=>onChanged(values.single)),
    ]));
  }
}
