const androidDestinationGroups = <List<int>>[
  [0, 1, 2],
  [10, 14, 8, 5],
  [9, 3, 4],
  [6, 13, 7],
  [12, 11],
];
const androidGroupDefaultDestinations = [0, 10, 9, 6, 12];

int androidGroupForDestination(int index) =>
    androidDestinationGroups.indexWhere((members) => members.contains(index));

List<int> androidOrderedGroupMembers(int group, List<int>? savedOrder) {
  final members = androidDestinationGroups[group];
  if (savedOrder == null) return List<int>.of(members);
  return [
    ...savedOrder.where((i) => members.contains(i)).toSet(),
    ...members.where((i) => !savedOrder.contains(i)),
  ];
}

List<String> androidGroupLabelsFor(String language) => switch (language) {
      'zh-TW' => const ['創作', '圖庫', 'AI', '工具', '我的'],
      'en-US' => const ['Create', 'Gallery', 'AI', 'Tools', 'Me'],
      'ja-JP' => const ['作成', 'ギャラリー', 'AI', 'ツール', 'マイ'],
      'ko-KR' => const ['생성', '갤러리', 'AI', '도구', '마이'],
      _ => const ['创作', '图库', 'AI', '工具', '我的'],
    };

String androidShellText(String language, String key) {
  const words = {
    'zh-CN': {
      'all': '全部功能',
      'order': '管理入口排序',
      'reset': '恢复默认顺序',
      'done': '完成',
      'hint': '拖动调整组内入口；所有原功能和旧排序均保留。'
    },
    'zh-TW': {
      'all': '全部功能',
      'order': '管理入口排序',
      'reset': '恢復預設順序',
      'done': '完成',
      'hint': '拖動調整群組內入口；所有原功能與舊排序均保留。'
    },
    'en-US': {
      'all': 'All features',
      'order': 'Reorder shortcuts',
      'reset': 'Reset order',
      'done': 'Done',
      'hint':
          'Drag to reorder within groups. All features and your saved order are retained.'
    },
    'ja-JP': {
      'all': 'すべての機能',
      'order': '項目の並べ替え',
      'reset': '既定の順序',
      'done': '完了',
      'hint': 'ドラッグでグループ内の順序を変更。すべての機能と保存済みの順序を保持します。'
    },
    'ko-KR': {
      'all': '모든 기능',
      'order': '바로가기 순서',
      'reset': '기본 순서',
      'done': '완료',
      'hint': '드래그하여 그룹 내 순서를 변경합니다. 모든 기능과 저장된 순서를 유지합니다.'
    },
  };
  return (words[language] ?? words['zh-CN']!)[key] ?? key;
}
