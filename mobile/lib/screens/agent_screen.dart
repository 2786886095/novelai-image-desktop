import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../agent/agent_controller.dart';
import '../agent/agent_models.dart';
import '../agent/agent_provider_catalog.dart';
import '../agent/tavern_builtins.dart';
import '../agent/tavern_prompt.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';

enum _ComposerMenu { commands, mode, reasoning }

class _TavernSlashCommand {
  final String id;
  final String command;
  final String title;
  final String description;
  final IconData icon;

  const _TavernSlashCommand({
    required this.id,
    required this.command,
    required this.title,
    required this.description,
    required this.icon,
  });
}

Map<String, String> _tavernText(Object? language) {
  final code = normalizeAppLocaleCode(language);
  const zh = <String, String>{
    'title': '酒馆AI生图',
    'characters': '角色',
    'chats': '对话',
    'newCharacter': '新建角色',
    'newChat': '新建对话',
    'import': '导入角色卡',
    'search': '搜索角色或对话',
    'context': '模型与生图',
    'character': '角色设定',
    'world': '世界书',
    'persona': '我的身份',
    'model': '模型',
    'image': '场景生图',
    'confirm': '确认后生图',
    'auto': '全自动生图',
    'composer': '以你的身份说点什么…',
    'empty': '选择角色开始一段故事',
    'emptyHint': '选择内置角色或导入自己的角色卡开始创作。',
    'edit': '编辑',
    'save': '保存',
    'cancel': '取消',
    'delete': '删除',
    'export': '导出',
    'avatar': '头像',
    'background': '背景',
    'group': '群聊成员',
    'generate': '确认生图',
    'dismiss': '暂不生成',
    'editParams': '修改参数',
    'generating': '正在生成场景图…',
    'generated': '场景图已保存到历史记录',
    'failed': '生成失败',
    'attach': '添加图片或文件',
    'stop': '停止',
    'send': '发送',
    'settings': '模型设置',
    'loreEnabled': '在当前对话启用',
    'addLore': '新建世界书',
    'addPersona': '新建身份',
    'visualPrompt': 'NovelAI 角色视觉预设',
    'providerReady': '模型已配置',
    'providerMissing': '请先配置对话模型',
    'cardMerged': '已合并导入，不会覆盖已有角色',
    'working': '正在整理回复与生图方案',
    'builtIn': '内置受保护',
    'builtInHint': '名称、角色说明与核心提示词模板由软件维护，不可修改或删除。运行参数仍可调整。',
    'deleteLorebook': '删除世界书',
    'deleteLorebookHint': '删除后会立即从所有对话与角色关联中移除，且无法撤销。',
    'view': '查看',
    'commands': '生图快捷命令',
    'commandHint': '输入 / 随时调用生图工作流',
    'commandEmpty': '没有匹配的生图命令',
    'drawPlan': '创建生图方案',
    'drawPlanDesc': '把当前想法整理为可确认的 NovelAI 方案',
    'drawTemplate': '请把下面的画面想法整理为 NovelAI V5 提示词，并创建可确认的生图方案：',
    'refinePrompt': '整理提示词',
    'refinePromptDesc': '优化提示词并检查 Tag 冲突',
    'promptTemplate': '请整理下面的内容，输出结构清晰的 NovelAI V5 提示词并检查冲突：',
    'referenceDesc': '添加视觉参考图',
    'imageParams': '生图参数',
    'imageParamsDesc': '尺寸、步数、CFG 与采样器',
    'chatModelDesc': '理解画面并组织提示词的模型',
    'confirmDesc': '先检查提示词与参数，再决定是否执行',
    'autoDesc': '方案完成后直接调用 NovelAI 生成',
    'newImageChat': '新建生图对话',
    'newImageChatDesc': '保留角色设定并开始新任务',
    'reasoning': '推理强度',
    'reasoningAuto': '自动',
    'reasoningLow': '快速',
    'reasoningMedium': '标准',
    'reasoningHigh': '深入',
    'workbenchReady': '生图工作台就绪',
    'steps': '步',
    'images': '张',
    'contextUsage': '上下文',
  };
  const values = <String, Map<String, String>>{
    'en-US': {
      'title': 'Tavern AI Image',
      'characters': 'Characters',
      'chats': 'Chats',
      'newCharacter': 'New character',
      'newChat': 'New chat',
      'import': 'Import card',
      'search': 'Search characters or chats',
      'context': 'Model & image',
      'character': 'Character',
      'world': 'Lorebooks',
      'persona': 'Persona',
      'model': 'Model',
      'image': 'Scene image',
      'confirm': 'Confirm images',
      'auto': 'Full auto',
      'composer': 'Speak as your persona…',
      'empty': 'Choose a character and start a story',
      'emptyHint':
          'Choose the built-in character or import your own card to begin.',
      'edit': 'Edit',
      'save': 'Save',
      'cancel': 'Cancel',
      'delete': 'Delete',
      'export': 'Export',
      'avatar': 'Avatar',
      'background': 'Background',
      'group': 'Group members',
      'generate': 'Generate image',
      'dismiss': 'Not now',
      'editParams': 'Edit parameters',
      'generating': 'Generating scene…',
      'generated': 'Scene saved to history',
      'failed': 'Generation failed',
      'attach': 'Add images or files',
      'stop': 'Stop',
      'send': 'Send',
      'settings': 'Model settings',
      'loreEnabled': 'Enable in this chat',
      'addLore': 'New lorebook',
      'addPersona': 'New persona',
      'visualPrompt': 'NovelAI visual preset',
      'providerReady': 'Model configured',
      'providerMissing': 'Configure a chat model first',
      'cardMerged': 'Imported by merging; existing characters were kept',
      'working': 'Preparing the reply and image plan',
      'builtIn': 'Built-in protected',
      'builtInHint':
          'The name, role definition, and core prompt template are maintained by the app. Runtime parameters remain adjustable.',
      'deleteLorebook': 'Delete lorebook',
      'deleteLorebookHint':
          'It will be removed from every chat and linked character immediately. This cannot be undone.',
      'view': 'View',
      'commands': 'Image commands',
      'commandHint': 'Type / to open the image workflow',
      'commandEmpty': 'No matching image command',
      'drawPlan': 'Create image plan',
      'drawPlanDesc': 'Turn the idea into a confirmable NovelAI plan',
      'drawTemplate':
          'Turn the following scene idea into a NovelAI V5 prompt and create a confirmable image plan:',
      'refinePrompt': 'Refine prompt',
      'refinePromptDesc': 'Improve prompts and check tag conflicts',
      'promptTemplate':
          'Refine the following into a structured NovelAI V5 prompt and check conflicts:',
      'referenceDesc': 'Add visual reference images',
      'imageParams': 'Image parameters',
      'imageParamsDesc': 'Size, steps, CFG, and sampler',
      'chatModelDesc': 'Model used to understand scenes and prepare prompts',
      'confirmDesc': 'Review prompts and parameters before generation',
      'autoDesc': 'Generate with NovelAI as soon as the plan is ready',
      'newImageChat': 'New image chat',
      'newImageChatDesc': 'Keep the character setup and start a new task',
      'reasoning': 'Planning effort',
      'reasoningAuto': 'Auto',
      'reasoningLow': 'Fast',
      'reasoningMedium': 'Standard',
      'reasoningHigh': 'Deep',
      'workbenchReady': 'Image workbench ready',
      'steps': 'steps',
      'images': 'images',
      'contextUsage': 'Context',
    },
    'zh-TW': {
      'title': '酒館 AI 生圖',
      'characters': '角色',
      'chats': '對話',
      'newCharacter': '新增角色',
      'newChat': '新增對話',
      'import': '匯入角色卡',
      'search': '搜尋角色或對話',
      'context': '模型與生圖',
      'character': '角色設定',
      'world': '世界書',
      'persona': '我的身分',
      'model': '模型',
      'image': '場景生圖',
      'confirm': '確認後生圖',
      'auto': '全自動生圖',
      'composer': '以你的身分說點什麼…',
      'empty': '選擇角色開始一段故事',
      'emptyHint': '選擇內置角色或匯入自己的角色卡開始創作。',
      'edit': '編輯',
      'save': '儲存',
      'cancel': '取消',
      'delete': '刪除',
      'export': '匯出',
      'avatar': '頭像',
      'background': '背景',
      'group': '群聊成員',
      'generate': '確認生圖',
      'dismiss': '暫不生成',
      'editParams': '修改參數',
      'generating': '正在生成場景圖…',
      'generated': '場景圖已儲存至歷史記錄',
      'failed': '生成失敗',
      'attach': '加入圖片或檔案',
      'stop': '停止',
      'send': '傳送',
      'settings': '模型設定',
      'loreEnabled': '在目前對話啟用',
      'addLore': '新增世界書',
      'addPersona': '新增身分',
      'visualPrompt': 'NovelAI 角色視覺預設',
      'providerReady': '模型已設定',
      'providerMissing': '請先設定對話模型',
      'cardMerged': '已合併匯入，不會覆蓋既有角色',
      'working': '正在整理回覆與生圖方案',
      'commands': '生圖快捷命令',
      'commandHint': '輸入 / 隨時呼叫生圖工作流',
      'drawPlan': '建立生圖方案',
      'refinePrompt': '整理提示詞',
      'referenceDesc': '加入視覺參考圖',
      'imageParams': '生圖參數',
      'reasoning': '推理強度',
      'reasoningAuto': '自動',
      'reasoningLow': '快速',
      'reasoningMedium': '標準',
      'reasoningHigh': '深入',
      'workbenchReady': '生圖工作台就緒',
      'images': '張',
      'contextUsage': '上下文',
    },
    'ja-JP': {
      'title': 'Tavern AI 画像生成',
      'characters': 'キャラクター',
      'chats': 'チャット',
      'newCharacter': '新規キャラクター',
      'newChat': '新規チャット',
      'import': 'カードを読み込む',
      'search': '検索',
      'context': 'モデルと画像生成',
      'character': 'キャラクター',
      'world': 'ワールド情報',
      'persona': 'ペルソナ',
      'model': 'モデル',
      'image': 'シーン画像',
      'confirm': '確認して生成',
      'auto': '全自動',
      'composer': 'メッセージを入力…',
      'empty': 'キャラクターを選んで物語を始める',
      'emptyHint': '内蔵キャラクターまたは読み込んだカードで開始します。',
      'edit': '編集',
      'save': '保存',
      'cancel': 'キャンセル',
      'export': '書き出し',
      'generate': '画像を生成',
      'dismiss': '後で',
      'send': '送信',
      'stop': '停止',
      'settings': 'モデル設定',
      'providerReady': 'モデル設定済み',
      'providerMissing': 'モデルを設定してください',
      'cardMerged': '既存データを上書きせず統合しました',
      'working': '返答と画像プランを整理しています',
      'commands': '画像コマンド',
      'commandHint': '/ を入力して画像ワークフローを開く',
      'drawPlan': '画像プランを作成',
      'refinePrompt': 'プロンプト整理',
      'referenceDesc': '参照画像を追加',
      'imageParams': '画像パラメータ',
      'reasoning': '推論強度',
      'reasoningAuto': '自動',
      'reasoningLow': '高速',
      'reasoningMedium': '標準',
      'reasoningHigh': '詳細',
      'workbenchReady': '画像ワークベンチ準備完了',
      'steps': 'Steps',
      'images': '枚',
      'contextUsage': 'コンテキスト',
    },
    'ko-KR': {
      'title': 'Tavern AI 이미지',
      'characters': '캐릭터',
      'chats': '대화',
      'newCharacter': '새 캐릭터',
      'newChat': '새 대화',
      'import': '카드 가져오기',
      'search': '검색',
      'context': '모델과 이미지',
      'character': '캐릭터',
      'world': '로어북',
      'persona': '페르소나',
      'model': '모델',
      'image': '장면 이미지',
      'confirm': '확인 후 생성',
      'auto': '완전 자동',
      'composer': '메시지를 입력하세요…',
      'empty': '캐릭터를 선택해 이야기를 시작하세요',
      'emptyHint': '내장 캐릭터나 가져온 카드로 시작하세요.',
      'edit': '편집',
      'save': '저장',
      'cancel': '취소',
      'export': '내보내기',
      'generate': '이미지 생성',
      'dismiss': '나중에',
      'send': '전송',
      'stop': '중지',
      'settings': '모델 설정',
      'providerReady': '모델 설정됨',
      'providerMissing': '모델을 먼저 설정하세요',
      'cardMerged': '기존 데이터를 덮어쓰지 않고 병합했습니다',
      'working': '답변과 이미지 계획을 정리하는 중',
      'commands': '이미지 명령',
      'commandHint': '/ 를 입력해 이미지 워크플로 열기',
      'drawPlan': '이미지 계획 만들기',
      'refinePrompt': '프롬프트 정리',
      'referenceDesc': '참고 이미지 추가',
      'imageParams': '이미지 매개변수',
      'reasoning': '추론 강도',
      'reasoningAuto': '자동',
      'reasoningLow': '빠름',
      'reasoningMedium': '표준',
      'reasoningHigh': '심층',
      'workbenchReady': '이미지 워크벤치 준비 완료',
      'steps': 'Steps',
      'images': '장',
      'contextUsage': '컨텍스트',
    },
  };
  return {...zh, ...?values[code]};
}

class AgentScreen extends StatefulWidget {
  const AgentScreen({super.key});

  @override
  State<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends State<AgentScreen> {
  AgentController? _controller;
  final _composer = TextEditingController();
  final _composerFocus = FocusNode();
  final _search = TextEditingController();
  final _scroll = ScrollController();
  double _composerHeight = 54;
  bool _showCharacters = true;
  int _contextTab = 0;
  _ComposerMenu? _composerMenu;
  int _commandIndex = 0;
  String? _seenConversationId;
  final Set<String> _seenMessageIds = <String>{};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    _controller = AgentController(app: context.read<AppState>());
    _controller!.addListener(_onControllerChanged);
    _controller!.load();
  }

  void _onControllerChanged() {
    if (!mounted) return;
    setState(() {});
    if (_controller?.sending == true) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(
            _scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_onControllerChanged);
    _controller?.dispose();
    _composer.dispose();
    _composerFocus.dispose();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? Theme.of(context).colorScheme.error : null,
    ));
  }

  Future<void> _send() async {
    final value = _composer.text;
    if (value.trim().isEmpty &&
        (_controller?.selectedConversation?.draftAttachments.isEmpty ?? true)) {
      return;
    }
    if (_composerMenu != null) setState(() => _composerMenu = null);
    _composer.clear();
    await _controller?.send(value);
  }

  void _useStarter(String value) {
    if (_composerMenu != null) setState(() => _composerMenu = null);
    _composer
      ..text = value
      ..selection = TextSelection.collapsed(offset: value.length);
    _composerFocus.requestFocus();
  }

  List<_TavernSlashCommand> _slashCommands(Map<String, String> text) => [
        _TavernSlashCommand(
          id: 'draw',
          command: '/draw',
          title: text['drawPlan']!,
          description: text['drawPlanDesc']!,
          icon: Icons.auto_fix_high_rounded,
        ),
        _TavernSlashCommand(
          id: 'prompt',
          command: '/prompt',
          title: text['refinePrompt']!,
          description: text['refinePromptDesc']!,
          icon: Icons.auto_awesome_outlined,
        ),
        _TavernSlashCommand(
          id: 'reference',
          command: '/reference',
          title: text['attach']!,
          description: text['referenceDesc']!,
          icon: Icons.add_photo_alternate_outlined,
        ),
        _TavernSlashCommand(
          id: 'parameters',
          command: '/params',
          title: text['imageParams']!,
          description: text['imageParamsDesc']!,
          icon: Icons.tune_rounded,
        ),
        _TavernSlashCommand(
          id: 'model',
          command: '/model',
          title: text['model']!,
          description: text['chatModelDesc']!,
          icon: Icons.smart_toy_outlined,
        ),
        _TavernSlashCommand(
          id: 'confirm',
          command: '/confirm',
          title: text['confirm']!,
          description: text['confirmDesc']!,
          icon: Icons.fact_check_outlined,
        ),
        _TavernSlashCommand(
          id: 'auto',
          command: '/auto',
          title: text['auto']!,
          description: text['autoDesc']!,
          icon: Icons.bolt_rounded,
        ),
        _TavernSlashCommand(
          id: 'new',
          command: '/new',
          title: text['newImageChat']!,
          description: text['newImageChatDesc']!,
          icon: Icons.add_comment_outlined,
        ),
      ];

  List<_TavernSlashCommand> _filteredSlashCommands(Map<String, String> text) {
    final match = RegExp(r'^/([^\s]*)$').firstMatch(_composer.text.trim());
    final query = (match?.group(1) ?? '').toLowerCase();
    return _slashCommands(text).where((item) {
      if (query.isEmpty) return true;
      return '${item.command} ${item.title} ${item.description}'
          .toLowerCase()
          .contains(query);
    }).toList();
  }

  Future<void> _openContextTab(
      AgentController controller, Map<String, String> text, int index) async {
    if (RegExp(r'^/[^\s]*$').hasMatch(_composer.text.trim())) {
      _composer.clear();
    }
    setState(() {
      _contextTab = index;
      _composerMenu = null;
    });
    if (MediaQuery.sizeOf(context).width < 1080) {
      await _showContextSheet(controller, text);
    }
  }

  Future<void> _applySlashCommand(_TavernSlashCommand command,
      AgentController controller, Map<String, String> text) async {
    final raw = _composer.text.trim();
    final existing = RegExp(r'^/[^\s]*$').hasMatch(raw) ? '' : raw;
    setState(() {
      _composerMenu = null;
      _commandIndex = 0;
    });
    if (command.id == 'draw' || command.id == 'prompt') {
      final prefix = command.id == 'draw'
          ? text['drawTemplate']!
          : text['promptTemplate']!;
      final value = '$prefix\n$existing';
      _composer
        ..text = value
        ..selection = TextSelection.collapsed(offset: value.length);
      _composerFocus.requestFocus();
      return;
    }
    if (RegExp(r'^/[^\s]*$').hasMatch(raw)) _composer.clear();
    switch (command.id) {
      case 'reference':
        await controller.pickAttachments();
        break;
      case 'parameters':
        await _openContextTab(controller, text, 1);
        break;
      case 'model':
        await _openContextTab(controller, text, 0);
        break;
      case 'confirm':
        await controller.setGenerationMode('confirm');
        break;
      case 'auto':
        await controller.setGenerationMode('auto');
        break;
      case 'new':
        controller.createConversation(text['newImageChat']!);
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final text = _tavernText(context.watch<AppState>().settings.language);
    if (controller == null || !controller.loaded) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return LayoutBuilder(builder: (context, constraints) {
      final desktop = constraints.maxWidth >= 1080;
      final tablet = constraints.maxWidth >= 760;
      final center = _chatPane(controller, text, compact: !tablet);
      return Scaffold(
        backgroundColor: Theme.of(context).colorScheme.surface,
        appBar: desktop
            ? null
            : AppBar(
                titleSpacing: 8,
                title: _chatTitle(controller, text),
                leading: IconButton(
                  tooltip: text['characters'],
                  onPressed: () => _showLibrarySheet(controller, text),
                  icon: const Icon(Icons.people_alt_outlined),
                ),
                actions: [
                  IconButton(
                    tooltip: text['context'],
                    onPressed: () => _showContextSheet(controller, text),
                    icon: const Icon(Icons.tune_rounded),
                  ),
                ],
              ),
        body: SafeArea(
          top: desktop,
          child: ColoredBox(
            color: Theme.of(context).colorScheme.surface,
            child: desktop
                ? Row(children: [
                    SizedBox(width: 256, child: _libraryPane(controller, text)),
                    const VerticalDivider(width: 1),
                    Expanded(child: center),
                    const VerticalDivider(width: 1),
                    SizedBox(width: 336, child: _contextPane(controller, text)),
                  ])
                : center,
          ),
        ),
      );
    });
  }

  Widget _chatTitle(AgentController controller, Map<String, String> text) {
    final character = controller.activeCharacter;
    return Row(children: [
      _avatar(character?.avatarDataUrl, character?.name ?? text['title']!, 34),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            if (character?.id == softwareImageCharacterId) ...[
              Icon(Icons.auto_awesome_rounded,
                  size: 18, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 5),
            ],
            Expanded(
              child: Text(character?.name ?? text['title']!,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (character?.id == softwareImageCharacterId)
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(Icons.lock_outline_rounded, size: 15),
              ),
          ]),
          Text(
            controller.selectedConversation?.title ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ]),
      ),
    ]);
  }

  Widget _libraryPane(AgentController controller, Map<String, String> text) {
    final query = _search.text.trim().toLowerCase();
    final characters = controller.workspace.characters
        .where((item) =>
            query.isEmpty ||
            item.name.toLowerCase().contains(query) ||
            item.tags.any((tag) => tag.toLowerCase().contains(query)))
        .toList();
    final chats = controller.workspace.conversations
        .where(
            (item) => query.isEmpty || item.title.toLowerCase().contains(query))
        .toList();
    return Material(
      color: Theme.of(context).colorScheme.surface.withOpacity(.82),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: Row(children: [
            Icon(Icons.auto_awesome_rounded,
                color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(text['title']!,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: text['search'],
              prefixIcon: const Icon(Icons.search_rounded),
              isDense: true,
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed: () async {
                  final character = await controller.createCharacter();
                  await _editCharacter(controller, character, text);
                },
                icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                label: Text(text['newCharacter']!),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: text['import'],
              onPressed: () async {
                try {
                  final result = await controller.importTavernCard();
                  if (result != null) _snack(text['cardMerged']!);
                } catch (error) {
                  _snack('$error', error: true);
                }
              },
              icon: const Icon(Icons.file_download_outlined),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: SegmentedButton<bool>(
            segments: [
              ButtonSegment(
                  value: true,
                  icon: const Icon(Icons.people_alt_outlined, size: 17),
                  label: Text(text['characters']!)),
              ButtonSegment(
                  value: false,
                  icon: const Icon(Icons.forum_outlined, size: 17),
                  label: Text(text['chats']!)),
            ],
            selected: {_showCharacters},
            onSelectionChanged: (value) =>
                setState(() => _showCharacters = value.first),
            showSelectedIcon: false,
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 16),
            itemCount: _showCharacters ? characters.length : chats.length,
            itemBuilder: (context, index) => _showCharacters
                ? _characterTile(controller, characters[index], text)
                : _chatTile(controller, chats[index], text),
          ),
        ),
      ]),
    );
  }

  Widget _characterTile(AgentController controller, TavernCharacter character,
      Map<String, String> text) {
    final selected = controller.activeCharacter?.id == character.id;
    final builtIn = character.id == softwareImageCharacterId;
    return Card(
      elevation: 0,
      color: selected
          ? Theme.of(context).colorScheme.primaryContainer.withOpacity(.75)
          : Colors.transparent,
      child: ListTile(
        dense: true,
        selected: selected,
        leading: _avatar(character.avatarDataUrl, character.name, 42),
        title: Text(character.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              character.tags.isEmpty
                  ? character.personality
                  : character.tags.take(3).join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (builtIn)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.lock_outline_rounded, size: 13),
                  const SizedBox(width: 3),
                  Text(text['builtIn']!,
                      style: Theme.of(context).textTheme.labelSmall),
                ]),
              ),
          ],
        ),
        trailing: character.favorite
            ? Icon(Icons.favorite_rounded,
                size: 17, color: Theme.of(context).colorScheme.primary)
            : null,
        onTap: () => controller.selectCharacter(character.id),
        onLongPress: builtIn
            ? () => _showProtectedCharacterInfo(text)
            : () => _editCharacter(controller, character, text),
      ),
    );
  }

  Widget _chatTile(AgentController controller, AgentConversation chat,
      Map<String, String> text) {
    final selected = controller.selectedConversation?.id == chat.id;
    final last = chat.messages.isEmpty
        ? ''
        : visibleTavernMessageContent(chat.messages.last);
    return Card(
      elevation: 0,
      color: selected
          ? Theme.of(context).colorScheme.primaryContainer.withOpacity(.75)
          : Colors.transparent,
      child: ListTile(
        dense: true,
        leading:
            const CircleAvatar(child: Icon(Icons.forum_outlined, size: 19)),
        title: Text(chat.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(last, maxLines: 2, overflow: TextOverflow.ellipsis),
        onTap: () => controller.selectConversation(chat.id),
        trailing: PopupMenuButton<String>(
          onSelected: (value) async {
            if (value == 'delete') await controller.deleteConversation(chat.id);
          },
          itemBuilder: (_) => [
            PopupMenuItem(value: 'delete', child: Text(text['delete']!)),
          ],
        ),
      ),
    );
  }

  Widget _chatPane(AgentController controller, Map<String, String> text,
      {required bool compact}) {
    final conversation = controller.selectedConversation;
    final character = controller.activeCharacter;
    final background =
        conversation?.backgroundDataUrl ?? character?.backgroundDataUrl;
    if (_seenConversationId != conversation?.id) {
      _seenConversationId = conversation?.id;
      _seenMessageIds
        ..clear()
        ..addAll(conversation?.messages.map((message) => message.id) ??
            const Iterable<String>.empty());
    }
    return Stack(children: [
      if (background != null)
        Positioned.fill(
          child: Opacity(
            opacity: .12,
            child: _dataImage(background,
                fit: BoxFit.cover, fallback: const SizedBox.shrink()),
          ),
        ),
      Column(children: [
        if (!compact && controller.activeCharacters.length > 1)
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface.withOpacity(.8),
              border: Border(
                bottom: BorderSide(
                    color: Theme.of(context).dividerColor.withOpacity(.35)),
              ),
            ),
            child: Align(
              alignment: Alignment.centerRight,
              child: _groupSpeakerMenu(controller),
            ),
          ),
        Expanded(
          child: conversation == null || conversation.messages.isEmpty
              ? _emptyChat(controller, text)
              : ListView.builder(
                  controller: _scroll,
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: EdgeInsets.fromLTRB(
                      compact ? 12 : 28, 24, compact ? 12 : 28, 20),
                  itemCount: conversation.messages.length,
                  itemBuilder: (context, index) {
                    final message = conversation.messages[index];
                    final animate = _seenMessageIds.add(message.id);
                    return _message(
                      controller,
                      message,
                      text,
                      compact: compact,
                      animate: animate,
                    );
                  },
                ),
        ),
        if (controller.error != null)
          Container(
            width: double.infinity,
            color: Theme.of(context).colorScheme.errorContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(controller.error!,
                style: TextStyle(
                    color: Theme.of(context).colorScheme.onErrorContainer)),
          ),
        _composerBox(controller, text, compact: compact),
      ]),
    ]);
  }

  Widget _emptyChat(AgentController controller, Map<String, String> text) {
    final conversation = controller.selectedConversation;
    final starters = [
      (
        Icons.image_outlined,
        '输入描述生成图片',
        '把中文想法整理成可确认的生图方案',
        '请把我接下来输入的中文画面描述整理为可确认的 NovelAI 生图方案。'
      ),
      (
        Icons.image_search_rounded,
        '反推图片提示词',
        '需要接入支持视觉能力的对话模型',
        '请读取我接下来通过回形针上传的图片，调用图片反推能力，输出可用于 NovelAI 的提示词；如果当前模型不支持视觉，请明确提醒我切换视觉模型。'
      ),
      (
        Icons.manage_search_rounded,
        '搜索 Tag',
        '检索并解释 Danbooru 标签',
        '请使用本地 Danbooru Tag 搜索能力，帮我查找并解释接下来输入的概念或关键词。'
      ),
      (
        Icons.palette_outlined,
        '识别画风并寻找画师串',
        '分析目标图并迭代相近画师 Tag 组合',
        '请读取我接下来上传的目标图，先分析画风特征，再检索相近 Danbooru 画师 Tag 组合，并按候选、生成、对比、收敛的方式迭代。'
      ),
      (
        Icons.casino_outlined,
        '随机抽取画师串生图',
        '随机组合画师 Tag 与权重后生成',
        '请从画师库随机抽取画师 Tag 与权重，组合成可直接用于 NovelAI 的画师串并生成图片。'
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(14, 16, 14, 20),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minHeight:
                constraints.maxHeight > 32 ? constraints.maxHeight - 32 : 0,
          ),
          child: Align(
            alignment: Alignment.center,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  border: Border.all(
                    color:
                        Theme.of(context).colorScheme.primary.withOpacity(.25),
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          Icons.auto_awesome_rounded,
                          size: 22,
                          color: Theme.of(context).colorScheme.onPrimary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '你想画什么？',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '选择一种开始方式，或直接在下方输入画面描述',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          conversation?.generationMode == 'auto'
                              ? '全自动'
                              : '确认模式',
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(
                                color: Theme.of(context).colorScheme.primary,
                                fontWeight: FontWeight.w800,
                              ),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 14),
                    LayoutBuilder(builder: (context, inner) {
                      final columns = inner.maxWidth >= 520 ? 2 : 1;
                      final cardWidth = columns == 2
                          ? (inner.maxWidth - 10) / 2
                          : inner.maxWidth;
                      return Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: starters
                            .map(
                              (starter) => SizedBox(
                                width: cardWidth,
                                child: _starterOption(
                                  icon: starter.$1,
                                  title: starter.$2,
                                  description: starter.$3,
                                  onTap: () => _useStarter(starter.$4),
                                ),
                              ),
                            )
                            .toList(),
                      );
                    }),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _starterOption({
    required IconData icon,
    required String title,
    required String description,
    required VoidCallback onTap,
  }) =>
      Material(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(11),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(11),
          child: Container(
            constraints: const BoxConstraints(minHeight: 62),
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              border: Border.all(
                  color: Theme.of(context).dividerColor.withOpacity(.55)),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Row(children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(icon,
                    size: 19, color: Theme.of(context).colorScheme.primary),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .labelLarge
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    Text(description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, size: 20),
            ]),
          ),
        ),
      );

  Widget _runtimeChip(IconData icon, String label) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: Theme.of(context).dividerColor.withOpacity(.45)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 5),
          Text(label, style: Theme.of(context).textTheme.labelMedium),
        ]),
      );

  Widget _message(AgentController controller, AgentMessage message,
      Map<String, String> text,
      {required bool compact, required bool animate}) {
    final user = message.role == 'user';
    final character = controller.workspace.characters
            .where((item) => item.id == message.characterId)
            .firstOrNull ??
        controller.activeCharacter;
    final persona = controller.activePersona;
    final visible = visibleTavernMessageContent(message);
    return _MessageEntrance(
      key: ValueKey(message.id),
      animate: animate,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment:
              user ? MainAxisAlignment.end : MainAxisAlignment.start,
          children: [
            if (!user) ...[
              _avatar(character?.avatarDataUrl,
                  character?.name ?? text['title']!, compact ? 34 : 40),
              const SizedBox(width: 10),
            ],
            Flexible(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: compact ? 620 : 760),
                child: Column(
                  crossAxisAlignment:
                      user ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding:
                          const EdgeInsets.only(left: 4, right: 4, bottom: 5),
                      child: Text(
                        user
                            ? (persona?.name ?? 'User')
                            : (character?.name ?? text['title']!),
                        style: Theme.of(context)
                            .textTheme
                            .labelMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Container(
                      padding: user
                          ? const EdgeInsets.fromLTRB(15, 11, 15, 11)
                          : const EdgeInsets.fromLTRB(2, 2, 4, 3),
                      decoration: user
                          ? BoxDecoration(
                              color: Theme.of(context)
                                  .colorScheme
                                  .primaryContainer,
                              borderRadius: const BorderRadius.only(
                                topLeft: Radius.circular(16),
                                topRight: Radius.circular(16),
                                bottomLeft: Radius.circular(16),
                                bottomRight: Radius.circular(6),
                              ),
                              border: Border.all(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .primary
                                      .withOpacity(.12)),
                            )
                          : null,
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (visible.trim().isNotEmpty)
                              MarkdownBody(
                                data: visible,
                                selectable: true,
                                styleSheet: MarkdownStyleSheet.fromTheme(
                                        Theme.of(context))
                                    .copyWith(
                                  p: Theme.of(context)
                                      .textTheme
                                      .bodyLarge
                                      ?.copyWith(height: 1.55),
                                  code: TextStyle(
                                    fontFamily: 'monospace',
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .surfaceContainerLow,
                                  ),
                                  codeblockDecoration: BoxDecoration(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .surfaceContainerLow,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                            if (message.status == 'streaming')
                              const _TypingIndicator(),
                            if (message.attachments.isNotEmpty)
                              _attachmentStrip(message.attachments),
                            if (message.tools
                                .any((item) => item.generatedImages.isNotEmpty))
                              _generatedImages(message),
                          ]),
                    ),
                    if (message.swipes.length > 1)
                      _swipeControls(controller, message),
                    if (message.imageProposal != null)
                      _imageProposalCard(controller, message, text),
                    if (message.status == 'error')
                      Padding(
                        padding: const EdgeInsets.only(top: 5),
                        child: Text(message.error ?? text['failed']!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error)),
                      ),
                  ],
                ),
              ),
            ),
            if (user) ...[
              const SizedBox(width: 10),
              _avatar(persona?.avatarDataUrl, persona?.name ?? 'User',
                  compact ? 34 : 40),
            ],
          ],
        ),
      ),
    );
  }

  Widget _swipeControls(AgentController controller, AgentMessage message) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      IconButton(
        visualDensity: VisualDensity.compact,
        onPressed: message.swipeIndex <= 0
            ? null
            : () {
                message.swipeIndex--;
                controller.saveWorkspace();
              },
        icon: const Icon(Icons.chevron_left_rounded, size: 20),
      ),
      Text('${message.swipeIndex + 1}/${message.swipes.length}',
          style: Theme.of(context).textTheme.labelSmall),
      IconButton(
        visualDensity: VisualDensity.compact,
        onPressed: message.swipeIndex >= message.swipes.length - 1
            ? null
            : () {
                message.swipeIndex++;
                controller.saveWorkspace();
              },
        icon: const Icon(Icons.chevron_right_rounded, size: 20),
      ),
    ]);
  }

  Widget _attachmentStrip(List<AgentAttachment> attachments) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: attachments.map((item) {
          if (item.kind == 'image' && File(item.filePath).existsSync()) {
            return ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(File(item.filePath),
                  width: 148, height: 110, fit: BoxFit.cover),
            );
          }
          return Chip(
            avatar: const Icon(Icons.attach_file_rounded, size: 16),
            label:
                Text(item.name, maxLines: 1, overflow: TextOverflow.ellipsis),
          );
        }).toList(),
      ),
    );
  }

  Widget _generatedImages(AgentMessage message) {
    final images = message.tools
        .expand((tool) => tool.generatedImages)
        .where((item) => File(item.filePath).existsSync())
        .toList();
    if (images.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: images
            .map((item) => GestureDetector(
                  onTap: () => _openGeneratedImage(item),
                  onDoubleTap: () => _openGeneratedImage(item),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                        minWidth: 140, maxWidth: 280, maxHeight: 360),
                    child: AspectRatio(
                      aspectRatio: (item.width ?? 1) / (item.height ?? 1),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.file(File(item.filePath),
                            fit: BoxFit.contain),
                      ),
                    ),
                  ),
                ))
            .toList(),
      ),
    );
  }

  Future<void> _openGeneratedImage(AgentAttachment item) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: Stack(children: [
          Positioned.fill(
            child: ColoredBox(
              color: Colors.black,
              child: InteractiveViewer(
                minScale: .5,
                maxScale: 6,
                child: Center(
                  child: Image.file(File(item.filePath), fit: BoxFit.contain),
                ),
              ),
            ),
          ),
          Positioned(
            top: 12,
            right: 12,
            child: Row(children: [
              IconButton.filled(
                tooltip: '保存或分享本地图片',
                onPressed: () => Share.shareXFiles(
                  [XFile(item.filePath)],
                  text: item.name,
                ),
                icon: const Icon(Icons.download_rounded),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: () => Navigator.pop(dialogContext),
                icon: const Icon(Icons.close_rounded),
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _imageProposalCard(AgentController controller, AgentMessage message,
      Map<String, String> text) {
    final proposal = message.imageProposal!;
    final generating = proposal.status == 'generating';
    final complete = proposal.status == 'complete';
    final cancelled = proposal.status == 'cancelled';
    if (cancelled) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.tertiaryContainer.withOpacity(.55),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: Theme.of(context).colorScheme.tertiary.withOpacity(.22)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(complete ? Icons.check_circle_rounded : Icons.image_outlined,
              size: 20, color: Theme.of(context).colorScheme.tertiary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              generating
                  ? text['generating']!
                  : complete
                      ? text['generated']!
                      : text['image']!,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          if (generating)
            const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2)),
        ]),
        const SizedBox(height: 8),
        Text(proposal.positivePrompt,
            maxLines: 3, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 6),
        Text(
          '${proposal.width ?? 1024}×${proposal.height ?? 1024} · ${proposal.steps ?? 28} steps · CFG ${proposal.scale ?? 5} · ×${proposal.count}',
          style: Theme.of(context).textTheme.labelMedium,
        ),
        if (proposal.error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(proposal.error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        if (!generating && !complete)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton.icon(
                onPressed: () => controller.generateTavernImage(message.id),
                icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                label: Text(text['generate']!),
              ),
              OutlinedButton(
                onPressed: () => _editImageProposal(controller, message, text),
                child: Text(text['editParams']!),
              ),
              TextButton(
                onPressed: () => controller.dismissTavernImage(message.id),
                child: Text(text['dismiss']!),
              ),
            ]),
          ),
      ]),
    );
  }

  String _reasoningLabel(
      AgentConversation? conversation, Map<String, String> text) {
    return switch (conversation?.reasoningEffort) {
      'low' => text['reasoningLow']!,
      'medium' => text['reasoningMedium']!,
      'high' => text['reasoningHigh']!,
      _ => text['reasoningAuto']!,
    };
  }

  Widget _composerMenuPanel(
      AgentController controller, Map<String, String> text) {
    final menu = _composerMenu;
    if (menu == null) return const SizedBox.shrink();
    final colorScheme = Theme.of(context).colorScheme;
    Widget option({
      IconData? icon,
      required String title,
      String? subtitle,
      required bool selected,
      required VoidCallback onTap,
    }) =>
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: BoxConstraints(minHeight: subtitle == null ? 44 : 54),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: selected
                  ? colorScheme.primaryContainer.withOpacity(.56)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? colorScheme.primary.withOpacity(.22)
                    : Colors.transparent,
              ),
            ),
            child: Row(children: [
              if (icon != null) ...[
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: colorScheme.surface,
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: colorScheme.outlineVariant),
                  ),
                  child: Icon(icon, size: 19, color: colorScheme.primary),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: colorScheme.onSurfaceVariant)),
                    ],
                  ],
                ),
              ),
              if (selected)
                Icon(Icons.check_rounded, size: 18, color: colorScheme.primary),
            ]),
          ),
        );

    final Widget body;
    if (menu == _ComposerMenu.commands) {
      final commands = _filteredSlashCommands(text);
      body = Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 7),
          child: Row(children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colorScheme.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('/',
                  style: TextStyle(
                      color: colorScheme.onPrimary,
                      fontWeight: FontWeight.w900,
                      fontSize: 18)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(text['commands']!,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(text['commandHint']!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
            IconButton(
              tooltip: text['cancel'],
              onPressed: () => setState(() => _composerMenu = null),
              icon: const Icon(Icons.close_rounded, size: 19),
            ),
          ]),
        ),
        const Divider(height: 1),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 310),
          child: commands.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(text['commandEmpty']!,
                      style: TextStyle(color: colorScheme.onSurfaceVariant)),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.all(5),
                  itemCount: commands.length,
                  itemBuilder: (context, index) {
                    final command = commands[index];
                    return MouseRegion(
                      onEnter: (_) => setState(() => _commandIndex = index),
                      child: option(
                        icon: command.icon,
                        title: command.title,
                        subtitle: '${command.description}  ${command.command}',
                        selected: index == _commandIndex,
                        onTap: () =>
                            _applySlashCommand(command, controller, text),
                      ),
                    );
                  },
                ),
        ),
      ]);
    } else if (menu == _ComposerMenu.mode) {
      final auto = controller.selectedConversation?.generationMode == 'auto';
      body = Padding(
        padding: const EdgeInsets.all(5),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          option(
            icon: Icons.fact_check_outlined,
            title: text['confirm']!,
            subtitle: text['confirmDesc']!,
            selected: !auto,
            onTap: () {
              setState(() => _composerMenu = null);
              controller.setGenerationMode('confirm');
            },
          ),
          option(
            icon: Icons.bolt_rounded,
            title: text['auto']!,
            subtitle: text['autoDesc']!,
            selected: auto,
            onTap: () {
              setState(() => _composerMenu = null);
              controller.setGenerationMode('auto');
            },
          ),
        ]),
      );
    } else {
      final current =
          controller.selectedConversation?.reasoningEffort ?? 'auto';
      final choices = [
        ('auto', text['reasoningAuto']!),
        ('low', text['reasoningLow']!),
        ('medium', text['reasoningMedium']!),
        ('high', text['reasoningHigh']!),
      ];
      body = Padding(
        padding: const EdgeInsets.fromLTRB(5, 8, 5, 5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 5),
              child: Text(text['reasoning']!,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 14)),
            ),
            ...choices.map((choice) => option(
                  title: choice.$2,
                  selected: current == choice.$1,
                  onTap: () {
                    setState(() => _composerMenu = null);
                    controller.setReasoningEffort(choice.$1);
                  },
                )),
          ],
        ),
      );
    }

    return Align(
      alignment: Alignment.bottomLeft,
      child: AnimatedSize(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        child: Container(
          key: ValueKey(menu),
          width: menu == _ComposerMenu.reasoning ? 278 : double.infinity,
          margin: const EdgeInsets.only(bottom: 7),
          decoration: BoxDecoration(
            color: colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colorScheme.primary.withOpacity(.22)),
            boxShadow: [
              BoxShadow(
                color: colorScheme.shadow.withOpacity(.12),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: body,
          ),
        ),
      ),
    );
  }

  Widget _composerBox(AgentController controller, Map<String, String> text,
      {required bool compact}) {
    final attachments =
        controller.selectedConversation?.draftAttachments ?? const [];
    final conversation = controller.selectedConversation;
    final visual = controller.activeCharacter?.visual;
    final params = controller.app.params;
    final imageModel = visual?.model ?? params.model;
    final width = visual?.width ?? params.width;
    final height = visual?.height ?? params.height;
    final steps = visual?.steps ?? params.steps;
    final scale = visual?.scale ?? params.cfgScale;
    final count = visual?.count ?? 1;
    final colorScheme = Theme.of(context).colorScheme;

    Widget toolChip({
      required IconData icon,
      required String label,
      required VoidCallback? onTap,
      bool active = false,
      bool chevron = false,
    }) =>
        Padding(
          padding: const EdgeInsets.only(right: 5),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(9),
            child: Container(
              height: 32,
              constraints: const BoxConstraints(maxWidth: 164),
              padding: const EdgeInsets.symmetric(horizontal: 9),
              decoration: BoxDecoration(
                color: active
                    ? colorScheme.primaryContainer.withOpacity(.62)
                    : colorScheme.surface,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(
                  color: active
                      ? colorScheme.primary.withOpacity(.28)
                      : colorScheme.outlineVariant,
                ),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon,
                    size: 17,
                    color: active
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: active
                              ? colorScheme.primary
                              : colorScheme.onSurfaceVariant,
                          fontWeight: FontWeight.w700)),
                ),
                if (chevron) ...[
                  const SizedBox(width: 2),
                  Icon(Icons.expand_more_rounded,
                      size: 16, color: colorScheme.onSurfaceVariant),
                ],
              ]),
            ),
          ),
        );

    Widget divider() => Container(
          width: 1,
          height: 14,
          margin: const EdgeInsets.symmetric(horizontal: 8),
          color: colorScheme.outlineVariant,
        );

    return Material(
      color: colorScheme.surface,
      elevation: 0,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(
                  color: Theme.of(context).dividerColor.withOpacity(.45)),
            ),
          ),
          padding:
              EdgeInsets.fromLTRB(compact ? 8 : 24, 7, compact ? 8 : 24, 0),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 900),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                if (controller.sending)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 7),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color:
                              Theme.of(context).dividerColor.withOpacity(.45)),
                    ),
                    child: Row(children: [
                      const _RunIndicator(),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          '${controller.activeCharacter?.name ?? text['title']} · ${text['working']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        controller.selectedConversation?.generationMode ==
                                'auto'
                            ? text['auto']!
                            : text['confirm']!,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: Theme.of(context).colorScheme.primary,
                            fontWeight: FontWeight.w700),
                      ),
                    ]),
                  ),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 160),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  transitionBuilder: (child, animation) => SizeTransition(
                    sizeFactor: animation,
                    axisAlignment: 1,
                    child: FadeTransition(opacity: animation, child: child),
                  ),
                  child: _composerMenuPanel(controller, text),
                ),
                if (attachments.isNotEmpty)
                  SizedBox(
                    height: 42,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: attachments.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (_, index) {
                        final item = attachments[index];
                        return InputChip(
                          avatar: Icon(item.kind == 'image'
                              ? Icons.image_outlined
                              : Icons.description_outlined),
                          label: Text(item.name,
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          onDeleted: () =>
                              controller.removeDraftAttachment(item.id),
                        );
                      },
                    ),
                  ),
                Container(
                  decoration: BoxDecoration(
                    color: colorScheme.surface,
                    borderRadius: BorderRadius.circular(16),
                    border:
                        Border.all(color: colorScheme.primary.withOpacity(.24)),
                    boxShadow: [
                      BoxShadow(
                        color: colorScheme.shadow.withOpacity(.08),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onDoubleTap: () => setState(() => _composerHeight = 54),
                        onVerticalDragUpdate: (details) {
                          final maxHeight = MediaQuery.sizeOf(context).height *
                              (compact ? .34 : .44);
                          setState(() {
                            _composerHeight =
                                (_composerHeight - details.delta.dy)
                                    .clamp(48.0, maxHeight)
                                    .toDouble();
                          });
                        },
                        child: MouseRegion(
                          cursor: SystemMouseCursors.resizeUpDown,
                          child: SizedBox(
                            height: 16,
                            child: Center(
                              child: Container(
                                width: 42,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: colorScheme.onSurfaceVariant
                                      .withOpacity(.28),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      SizedBox(
                        height: _composerHeight,
                        child: TextField(
                          controller: _composer,
                          focusNode: _composerFocus,
                          enabled: !controller.compacting,
                          expands: true,
                          minLines: null,
                          maxLines: null,
                          textAlignVertical: TextAlignVertical.top,
                          textInputAction: TextInputAction.newline,
                          decoration: InputDecoration(
                            hintText: text['composer'],
                            filled: false,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 10),
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                      Divider(height: 1, color: colorScheme.outlineVariant),
                      SizedBox(
                        height: 44,
                        child: Row(children: [
                          IconButton(
                            tooltip: text['attach'],
                            onPressed: controller.sending
                                ? null
                                : () => controller.pickAttachments(),
                            icon:
                                const Icon(Icons.attach_file_rounded, size: 20),
                          ),
                          Expanded(
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              physics: const BouncingScrollPhysics(),
                              child: Row(children: [
                                toolChip(
                                  icon: conversation?.generationMode == 'auto'
                                      ? Icons.bolt_rounded
                                      : Icons.fact_check_outlined,
                                  label: conversation?.generationMode == 'auto'
                                      ? text['auto']!
                                      : text['confirm']!,
                                  active: _composerMenu == _ComposerMenu.mode,
                                  chevron: true,
                                  onTap: conversation == null
                                      ? null
                                      : () {
                                          if (RegExp(r'^/[^\s]*$').hasMatch(
                                              _composer.text.trim())) {
                                            _composer.clear();
                                          }
                                          setState(() {
                                            _composerMenu = _composerMenu ==
                                                    _ComposerMenu.mode
                                                ? null
                                                : _ComposerMenu.mode;
                                          });
                                        },
                                ),
                                toolChip(
                                  icon: Icons.psychology_outlined,
                                  label:
                                      '${text['reasoning']} · ${_reasoningLabel(conversation, text)}',
                                  active:
                                      _composerMenu == _ComposerMenu.reasoning,
                                  chevron: true,
                                  onTap: conversation == null
                                      ? null
                                      : () {
                                          if (RegExp(r'^/[^\s]*$').hasMatch(
                                              _composer.text.trim())) {
                                            _composer.clear();
                                          }
                                          setState(() {
                                            _composerMenu = _composerMenu ==
                                                    _ComposerMenu.reasoning
                                                ? null
                                                : _ComposerMenu.reasoning;
                                          });
                                        },
                                ),
                              ]),
                            ),
                          ),
                          const SizedBox(width: 5),
                          IconButton.filled(
                            tooltip: controller.sending
                                ? text['stop']
                                : text['send'],
                            onPressed:
                                controller.sending ? controller.abort : _send,
                            icon: Icon(controller.sending
                                ? Icons.stop_rounded
                                : Icons.arrow_upward_rounded),
                          ),
                          const SizedBox(width: 5),
                        ]),
                      ),
                    ]),
                  ),
                ),
                SizedBox(
                  height: 28,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: InkWell(
                      onTap: conversation == null
                          ? null
                          : () => _openContextTab(controller, text, 4),
                      child: Row(children: [
                        Icon(
                          controller.sending
                              ? Icons.motion_photos_on_outlined
                              : Icons.check_circle_outline_rounded,
                          size: 14,
                          color: controller.sending
                              ? colorScheme.primary
                              : Colors.green.shade600,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          controller.sending
                              ? text['working']!
                              : text['workbenchReady']!,
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                  fontWeight: FontWeight.w700),
                        ),
                        divider(),
                        Icon(Icons.image_outlined,
                            size: 14, color: colorScheme.primary),
                        const SizedBox(width: 4),
                        Text(imageModel,
                            style: Theme.of(context).textTheme.labelSmall),
                        divider(),
                        Text('$width×$height',
                            style: Theme.of(context).textTheme.labelSmall),
                        divider(),
                        Text('$steps ${text['steps']}',
                            style: Theme.of(context).textTheme.labelSmall),
                        divider(),
                        Text('CFG $scale',
                            style: Theme.of(context).textTheme.labelSmall),
                        divider(),
                        Text('$count ${text['images']}',
                            style: Theme.of(context).textTheme.labelSmall),
                        divider(),
                        Icon(Icons.data_usage_rounded,
                            size: 13, color: colorScheme.primary),
                        const SizedBox(width: 4),
                        Text(
                          '${text['contextUsage']} ${conversation?.context.percent.round() ?? 0}%',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        if (controller.app.account.anlasBalance != null) ...[
                          divider(),
                          Text(
                            'Anlas ${controller.app.account.anlasBalance}',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(
                                    color: Colors.green.shade700,
                                    fontWeight: FontWeight.w800),
                          ),
                        ],
                      ]),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _groupSpeakerMenu(AgentController controller) {
    final conversation = controller.selectedConversation;
    if (conversation == null || controller.activeCharacters.length < 2) {
      return const SizedBox.shrink();
    }
    return PopupMenuButton<String>(
      tooltip: '切换发言角色',
      onSelected: (id) {
        conversation.activeCharacterId = id;
        controller.saveWorkspace();
      },
      itemBuilder: (_) => controller.activeCharacters
          .map((character) => PopupMenuItem(
                value: character.id,
                child: Row(children: [
                  _avatar(character.avatarDataUrl, character.name, 30),
                  const SizedBox(width: 8),
                  Text(character.name),
                ]),
              ))
          .toList(),
      child: const Chip(
          avatar: Icon(Icons.groups_rounded, size: 17), label: Text('群聊')),
    );
  }

  Widget _contextPane(
    AgentController controller,
    Map<String, String> text, {
    StateSetter? sheetSetState,
  }) {
    final tabs = [
      (Icons.hub_outlined, text['model']!),
      (Icons.image_outlined, text['image']!),
    ];
    return Material(
      color: Theme.of(context).colorScheme.surface.withOpacity(.84),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: Row(children: [
            Expanded(
              child: Text(text['context']!,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ),
          ]),
        ),
        NavigationBar(
          height: 64,
          selectedIndex: _contextTab,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (index) {
            void update() => _contextTab = index;
            if (sheetSetState != null) {
              sheetSetState(update);
            } else {
              setState(update);
            }
          },
          destinations: [
            for (final tab in tabs)
              NavigationDestination(
                icon: Icon(tab.$1, size: 19),
                selectedIcon: Icon(tab.$1, size: 20),
                label: tab.$2,
              ),
          ],
        ),
        const SizedBox(height: 6),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
            child: switch (_contextTab) {
              0 => _modelContext(controller, text),
              _ => _imageContext(controller, text),
            },
          ),
        ),
      ]),
    );
  }

  Widget _sectionCard({required Widget child}) => Card(
        elevation: 0,
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: Padding(padding: const EdgeInsets.all(14), child: child),
      );

  // Kept for backward-compatible workspace editing helpers; the simplified
  // inspector intentionally exposes only model and image tabs.
  // ignore: unused_element
  Widget _characterContext(
      AgentController controller, Map<String, String> text) {
    final character = controller.activeCharacter;
    if (character == null) return Text(text['empty']!);
    final conversation = controller.selectedConversation;
    final builtIn = character.id == softwareImageCharacterId;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _sectionCard(
        child: Column(children: [
          _avatar(character.avatarDataUrl, character.name, 76),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (builtIn) ...[
              Icon(Icons.auto_awesome_rounded,
                  size: 21, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(character.name,
                  textAlign: TextAlign.center,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ),
          ]),
          if (builtIn)
            Padding(
              padding: const EdgeInsets.only(top: 7),
              child: Chip(
                avatar: const Icon(Icons.lock_outline_rounded, size: 15),
                label: Text(text['builtIn']!),
                visualDensity: VisualDensity.compact,
              ),
            ),
          if (character.tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(
                alignment: WrapAlignment.center,
                spacing: 5,
                runSpacing: 5,
                children: character.tags
                    .take(8)
                    .map((tag) => Chip(
                        visualDensity: VisualDensity.compact, label: Text(tag)))
                    .toList(),
              ),
            ),
          const SizedBox(height: 10),
          if (!builtIn)
            Wrap(spacing: 6, runSpacing: 6, children: [
              FilledButton.tonalIcon(
                onPressed: () => _editCharacter(controller, character, text),
                icon: const Icon(Icons.edit_outlined, size: 17),
                label: Text(text['edit']!),
              ),
              OutlinedButton.icon(
                onPressed: () => controller.setCharacterAvatar(character),
                icon: const Icon(Icons.account_circle_outlined, size: 17),
                label: Text(text['avatar'] ?? '头像'),
              ),
              OutlinedButton.icon(
                onPressed: () => controller.setCharacterBackground(character),
                icon: const Icon(Icons.wallpaper_outlined, size: 17),
                label: Text(text['background'] ?? '背景'),
              ),
            ]),
        ]),
      ),
      if (builtIn) ...[
        const SizedBox(height: 8),
        _sectionCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.auto_fix_high_rounded,
                  color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('内置 NovelAI 生图模板',
                    style: TextStyle(fontWeight: FontWeight.w800)),
              ),
              const Chip(
                avatar: Icon(Icons.check_circle_outline_rounded, size: 15),
                label: Text('已启用'),
                visualDensity: VisualDensity.compact,
              ),
            ]),
            const SizedBox(height: 8),
            const Wrap(spacing: 6, runSpacing: 6, children: [
              Chip(label: Text('中文意图整理'), visualDensity: VisualDensity.compact),
              Chip(
                  label: Text('Danbooru Tag'),
                  visualDensity: VisualDensity.compact),
              Chip(label: Text('构图与光影'), visualDensity: VisualDensity.compact),
              Chip(label: Text('参数确认'), visualDensity: VisualDensity.compact),
            ]),
          ]),
        ),
        const SizedBox(height: 8),
        _sectionCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('当前运行参数', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              _runtimeChip(
                  Icons.fact_check_outlined,
                  conversation?.generationMode == 'auto'
                      ? text['auto']!
                      : text['confirm']!),
              _runtimeChip(Icons.photo_size_select_large_outlined,
                  '${character.visual.width ?? 1024} × ${character.visual.height ?? 1024}'),
              _runtimeChip(Icons.tune_rounded,
                  '${character.visual.steps ?? 28} steps · CFG ${character.visual.scale ?? 5}'),
            ]),
          ]),
        ),
      ],
      const SizedBox(height: 8),
      _sectionCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text['export']!,
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final format in ['png', 'json', 'charx'])
              OutlinedButton(
                onPressed: () async {
                  try {
                    await controller.shareCharacter(character, format);
                  } catch (error) {
                    _snack('$error', error: true);
                  }
                },
                child: Text(format.toUpperCase()),
              ),
          ]),
        ]),
      ),
      const SizedBox(height: 8),
      _sectionCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text['group'] ?? '群聊成员',
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          ...controller.workspace.characters.map((item) {
            final enabled =
                conversation?.characterIds.contains(item.id) ?? false;
            return CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: enabled,
              title: Text(item.name),
              secondary: _avatar(item.avatarDataUrl, item.name, 30),
              onChanged: conversation == null
                  ? null
                  : (value) {
                      if (value == true) {
                        if (!conversation.characterIds.contains(item.id)) {
                          conversation.characterIds.add(item.id);
                        }
                      } else if (conversation.characterIds.length > 1) {
                        conversation.characterIds.remove(item.id);
                        if (conversation.activeCharacterId == item.id) {
                          conversation.activeCharacterId =
                              conversation.characterIds.first;
                        }
                      }
                      controller.saveWorkspace();
                    },
            );
          }),
        ]),
      ),
    ]);
  }

  // ignore: unused_element
  Widget _worldContext(AgentController controller, Map<String, String> text) {
    final conversation = controller.selectedConversation;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      FilledButton.tonalIcon(
        onPressed: () async {
          final lorebook = await controller.createLorebook();
          await _editLorebook(controller, lorebook, text);
        },
        icon: const Icon(Icons.add_rounded),
        label: Text(text['addLore'] ?? '新建世界书'),
      ),
      const SizedBox(height: 8),
      if (controller.workspace.lorebooks.isEmpty)
        _sectionCard(child: const Text('暂无世界书。关键词命中后，条目会自动注入当前对话。')),
      ...controller.workspace.lorebooks.map((book) {
        final enabled = conversation?.lorebookIds.contains(book.id) ?? false;
        final builtIn = book.id == softwareImageLorebookId;
        return _sectionCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.auto_stories_outlined,
                  size: 20, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(book.name,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                      if (builtIn)
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.lock_outline_rounded, size: 13),
                          const SizedBox(width: 3),
                          Text(text['builtIn']!,
                              style: Theme.of(context).textTheme.labelSmall),
                        ]),
                    ]),
              ),
              Switch(
                value: enabled,
                onChanged: conversation == null
                    ? null
                    : (value) {
                        if (value) {
                          if (!conversation.lorebookIds.contains(book.id)) {
                            conversation.lorebookIds.add(book.id);
                          }
                        } else {
                          conversation.lorebookIds.remove(book.id);
                        }
                        controller.saveWorkspace();
                      },
              ),
            ]),
            Text('${book.entries.length} 条 · ${book.tokenBudget} tokens'),
            if (book.description.trim().isNotEmpty)
              Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: Text(book.description)),
            const SizedBox(height: 6),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              if (!builtIn)
                TextButton.icon(
                  onPressed: () =>
                      _confirmDeleteLorebook(controller, book, text),
                  icon: const Icon(Icons.delete_outline_rounded, size: 17),
                  label: Text(text['delete']!),
                  style: TextButton.styleFrom(
                      foregroundColor: Theme.of(context).colorScheme.error),
                ),
              TextButton.icon(
                onPressed: () => _editLorebook(controller, book, text),
                icon: Icon(
                    builtIn ? Icons.visibility_outlined : Icons.edit_outlined,
                    size: 17),
                label: Text(builtIn ? text['view']! : text['edit']!),
              ),
            ]),
          ]),
        );
      }),
    ]);
  }

  // ignore: unused_element
  Widget _personaContext(AgentController controller, Map<String, String> text) {
    final conversation = controller.selectedConversation;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      FilledButton.tonalIcon(
        onPressed: () async {
          final persona = await controller.createPersona();
          await _editPersona(controller, persona, text);
        },
        icon: const Icon(Icons.add_rounded),
        label: Text(text['addPersona'] ?? '新建身份'),
      ),
      const SizedBox(height: 8),
      ...controller.workspace.personas.map((persona) {
        final selected = conversation?.personaId == persona.id;
        return _sectionCard(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: _avatar(persona.avatarDataUrl, persona.name, 42),
            title: Text(persona.name,
                style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(persona.description,
                maxLines: 3, overflow: TextOverflow.ellipsis),
            trailing: selected
                ? Icon(Icons.check_circle_rounded,
                    color: Theme.of(context).colorScheme.primary)
                : null,
            onTap: () {
              controller.workspace.selectedPersonaId = persona.id;
              if (conversation != null) conversation.personaId = persona.id;
              controller.saveWorkspace();
            },
            onLongPress: () => _editPersona(controller, persona, text),
          ),
        );
      }),
    ]);
  }

  Widget _modelContext(AgentController controller, Map<String, String> text) {
    final settings = controller.app.settings;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _sectionCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(
              controller.providerConfigured
                  ? Icons.check_circle_rounded
                  : Icons.warning_amber_rounded,
              color: controller.providerConfigured
                  ? Colors.green
                  : Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                controller.providerConfigured
                    ? text['providerReady']!
                    : text['providerMissing']!,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          Text(settings.agentProviderName),
          Text(settings.agentApiModel,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(settings.agentApiBaseUrl,
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(
              '${settings.agentApiProtocol} · ${settings.agentContextWindow} context'),
        ]),
      ),
      const SizedBox(height: 8),
      FilledButton.icon(
        onPressed: () => _configureModel(controller, text),
        icon: const Icon(Icons.tune_rounded),
        label: Text(text['settings']!),
      ),
      const SizedBox(height: 8),
      _sectionCard(
        child: Text(
          '模型名称与上下文支持从服务端检测；自动压缩危险线由软件根据上下文与最大输出自动计算。API Key 仅保存在系统安全存储中。',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ),
    ]);
  }

  Widget _imageContext(AgentController controller, Map<String, String> text) {
    final character = controller.activeCharacter;
    final auto = controller.selectedConversation?.generationMode == 'auto';
    final defaults = controller.app.params;
    final visual = character?.visual;
    final model = visual?.model ?? defaults.model;
    final width = visual?.width ?? defaults.width;
    final height = visual?.height ?? defaults.height;
    final steps = visual?.steps ?? defaults.steps;
    final scale = visual?.scale ?? defaults.cfgScale;
    final sampler = visual?.sampler ?? defaults.sampler;
    final count = visual?.count ?? 1;
    final modelOptions = [
      ...naiModels,
      if (!naiModels.any((item) => item.value == model))
        NaiOption(model, model),
    ];
    final samplerOptions = [
      ...naiSamplers,
      if (!naiSamplers.any((item) => item.value == sampler))
        NaiOption(sampler, sampler),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _sectionCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text['image']!,
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'confirm', label: Text(text['confirm']!)),
              ButtonSegment(value: 'auto', label: Text(text['auto']!)),
            ],
            selected: {auto ? 'auto' : 'confirm'},
            onSelectionChanged: (value) =>
                controller.setGenerationMode(value.first),
          ),
          const SizedBox(height: 10),
          Text(
              auto ? '模型提出场景图参数后会立即调用 NovelAI。' : '模型只提出参数；你确认或修改后才会消耗 Anlas。'),
        ]),
      ),
      if (character != null) ...[
        const SizedBox(height: 8),
        _sectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('本次创作参数',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text('手动修改后会作为后续对话与生图提案的默认值',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: () => controller.updateActiveCharacterVisual(
                    model: defaults.model,
                    width: defaults.width,
                    height: defaults.height,
                    steps: defaults.steps,
                    scale: defaults.cfgScale,
                    sampler: defaults.sampler,
                    count: 1,
                  ),
                  icon: const Icon(Icons.sync_rounded, size: 17),
                  label: const Text('同步默认'),
                ),
              ]),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: model,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'NovelAI 模型',
                  border: OutlineInputBorder(),
                ),
                items: modelOptions
                    .map((item) => DropdownMenuItem(
                        value: item.value,
                        child: Text(item.label,
                            maxLines: 1, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (value) {
                  if (value != null) {
                    controller.updateActiveCharacterVisual(model: value);
                  }
                },
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primaryContainer
                      .withOpacity(.28),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: Theme.of(context)
                          .colorScheme
                          .primary
                          .withOpacity(.18)),
                ),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('负面提示词与风格提示词',
                          style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 3),
                      Text('AI 只生成正面提示词，这两项始终由你控制。',
                          style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 8),
                      Text(
                          '风格提示词：${character.visual.stylePrompt.trim().isEmpty ? '未设置' : character.visual.stylePrompt}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 3),
                      Text(
                          '负面词：${character.visual.negativePrompt.trim().isEmpty ? defaultTavernNegativePrompt : character.visual.negativePrompt}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 7),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.tonalIcon(
                          onPressed: () =>
                              _configureUserImagePrompts(controller),
                          icon: const Icon(Icons.tune_rounded, size: 18),
                          label: const Text('设置'),
                        ),
                      ),
                    ]),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: sizePresets
                    .map((preset) => ChoiceChip(
                          selected:
                              width == preset.width && height == preset.height,
                          label: Text(localizedSizePresetLabel(
                              controller.app.settings.language,
                              preset.width,
                              preset.height,
                              preset.label)),
                          onSelected: (_) =>
                              controller.updateActiveCharacterVisual(
                            width: preset.width,
                            height: preset.height,
                          ),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 10),
              LayoutBuilder(builder: (context, constraints) {
                final cellWidth = (constraints.maxWidth - 8) / 2;
                return Wrap(spacing: 8, runSpacing: 8, children: [
                  SizedBox(
                    width: cellWidth,
                    child: _CommitNumberField(
                      label: '宽度',
                      value: width,
                      min: 64,
                      max: 4096,
                      integer: true,
                      onCommit: (value) => controller
                          .updateActiveCharacterVisual(width: value.round()),
                    ),
                  ),
                  SizedBox(
                    width: cellWidth,
                    child: _CommitNumberField(
                      label: '高度',
                      value: height,
                      min: 64,
                      max: 4096,
                      integer: true,
                      onCommit: (value) => controller
                          .updateActiveCharacterVisual(height: value.round()),
                    ),
                  ),
                  SizedBox(
                    width: cellWidth,
                    child: _CommitNumberField(
                      label: '采样步数',
                      value: steps,
                      min: 1,
                      max: 50,
                      integer: true,
                      onCommit: (value) => controller
                          .updateActiveCharacterVisual(steps: value.round()),
                    ),
                  ),
                  SizedBox(
                    width: cellWidth,
                    child: _CommitNumberField(
                      label: 'CFG Scale',
                      value: scale,
                      min: 0,
                      max: 10,
                      onCommit: (value) =>
                          controller.updateActiveCharacterVisual(scale: value),
                    ),
                  ),
                  SizedBox(
                    width: cellWidth,
                    child: _CommitNumberField(
                      label: '生成张数',
                      value: count,
                      min: 1,
                      max: 8,
                      integer: true,
                      onCommit: (value) => controller
                          .updateActiveCharacterVisual(count: value.round()),
                    ),
                  ),
                ]);
              }),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: sampler,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: '采样器',
                  border: OutlineInputBorder(),
                ),
                items: samplerOptions
                    .map((item) => DropdownMenuItem(
                        value: item.value,
                        child: Text(item.label,
                            maxLines: 1, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (value) {
                  if (value != null) {
                    controller.updateActiveCharacterVisual(sampler: value);
                  }
                },
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primaryContainer
                      .withOpacity(.34),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.chat_bubble_outline_rounded, size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '也可以直接对话调整，例如“改成 832×1216、30 步、生成 2 张”。AI 会沿用最近画面，只修改你点名的参数。',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        _sectionCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text['visualPrompt'] ?? 'NovelAI 角色视觉预设',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(character.visual.positivePrompt.trim().isEmpty
                ? (character.id == softwareImageCharacterId
                    ? '正在使用软件内置 NovelAI 生图模板。模板正文受保护，参数可在上方模式与生成提案中调整。'
                    : '尚未填写角色外观提示词。')
                : character.visual.positivePrompt),
            if (character.id == softwareImageCharacterId) ...[
              const SizedBox(height: 8),
              Row(children: [
                const Icon(Icons.lock_outline_rounded, size: 16),
                const SizedBox(width: 5),
                Expanded(child: Text(text['builtIn']!)),
              ]),
            ] else ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => _editCharacter(controller, character, text),
                  icon: const Icon(Icons.edit_outlined, size: 17),
                  label: Text(text['edit']!),
                ),
              ),
            ],
          ]),
        ),
      ],
    ]);
  }

  Future<void> _configureUserImagePrompts(AgentController controller) async {
    final character = controller.activeCharacter;
    if (character == null) return;
    final negative = TextEditingController(
      text: character.visual.negativePrompt.trim().isEmpty
          ? defaultTavernNegativePrompt
          : character.visual.negativePrompt,
    );
    final style = TextEditingController(text: character.visual.stylePrompt);
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('负面提示词与风格提示词'),
          content: SizedBox(
            width: 640,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<String>(
                  value: null,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: '从风格提示词列表选择',
                    border: OutlineInputBorder(),
                  ),
                  items: controller.app.settings.stylePromptPresets
                      .map((preset) => DropdownMenuItem(
                            value: preset.id,
                            child: Text('${preset.group} / ${preset.name}',
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (id) {
                    final preset = controller.app.settings.stylePromptPresets
                        .where((item) => item.id == id)
                        .firstOrNull;
                    if (preset != null) {
                      setDialogState(() => style.text = preset.prompt);
                    }
                  },
                ),
                const SizedBox(height: 10),
                _field(style, '风格提示词', lines: 4),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () async {
                      final value = style.text.trim();
                      if (value.isEmpty) return;
                      final name = TextEditingController(
                          text: value.split(',').take(2).join(', ').trim());
                      final accepted = await showDialog<bool>(
                        context: dialogContext,
                        builder: (nameContext) => AlertDialog(
                          title: const Text('加入风格提示词列表'),
                          content: TextField(
                              controller: name,
                              decoration:
                                  const InputDecoration(labelText: '名称')),
                          actions: [
                            TextButton(
                                onPressed: () =>
                                    Navigator.pop(nameContext, false),
                                child: const Text('取消')),
                            FilledButton(
                                onPressed: () =>
                                    Navigator.pop(nameContext, true),
                                child: const Text('加入')),
                          ],
                        ),
                      );
                      if (accepted == true && name.text.trim().isNotEmpty) {
                        await controller.app.addStylePromptPreset(
                            name: name.text, prompt: value, group: '酒馆 AI 生图');
                        if (mounted) _snack('风格提示词已加入列表');
                      }
                      name.dispose();
                    },
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('加入列表'),
                  ),
                ),
                _field(negative, '负面提示词', lines: 7),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () => setDialogState(
                        () => negative.text = defaultTavernNegativePrompt),
                    icon: const Icon(Icons.restore_rounded),
                    label: const Text('恢复默认'),
                  ),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('取消')),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('保存')),
          ],
        ),
      ),
    );
    if (saved == true) {
      await controller.updateActiveCharacterVisual(
        negativePrompt: negative.text,
        stylePrompt: style.text,
      );
    }
    negative.dispose();
    style.dispose();
  }

  Future<void> _showLibrarySheet(
      AgentController controller, Map<String, String> text) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .84,
        child: _libraryPane(controller, text),
      ),
    );
  }

  Future<void> _showContextSheet(
      AgentController controller, Map<String, String> text) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .9,
        child: StatefulBuilder(
          builder: (context, setSheetState) => _contextPane(
            controller,
            text,
            sheetSetState: setSheetState,
          ),
        ),
      ),
    );
  }

  Future<void> _showProtectedCharacterInfo(Map<String, String> text) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.verified_user_outlined),
        title: Text(text['builtIn']!),
        content: Text(text['builtInHint']!),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('知道了'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeleteLorebook(AgentController controller,
      TavernLorebook book, Map<String, String> text) async {
    if (book.id == softwareImageLorebookId) {
      _snack(text['builtInHint']!, error: true);
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: Icon(Icons.delete_outline_rounded,
            color: Theme.of(context).colorScheme.error),
        title: Text(text['deleteLorebook']!),
        content: Text('“${book.name}”\n\n${text['deleteLorebookHint']}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(text['cancel']!),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error),
            child: Text(text['delete']!),
          ),
        ],
      ),
    );
    if (confirmed == true && await controller.deleteLorebook(book.id)) {
      _snack('${text['delete']}: ${book.name}');
    }
  }

  Future<void> _editCharacter(AgentController controller,
      TavernCharacter character, Map<String, String> text) async {
    if (character.id == softwareImageCharacterId) {
      await _showProtectedCharacterInfo(text);
      return;
    }
    final fields = <String, TextEditingController>{
      'name': TextEditingController(text: character.name),
      'description': TextEditingController(text: character.description),
      'personality': TextEditingController(text: character.personality),
      'scenario': TextEditingController(text: character.scenario),
      'first': TextEditingController(text: character.firstMessage),
      'examples': TextEditingController(text: character.exampleMessages),
      'system': TextEditingController(text: character.systemPrompt),
      'post': TextEditingController(text: character.postHistoryInstructions),
      'tags': TextEditingController(text: character.tags.join(', ')),
      'positive': TextEditingController(text: character.visual.positivePrompt),
      'negative': TextEditingController(text: character.visual.negativePrompt),
      'style': TextEditingController(text: character.visual.stylePrompt),
    };
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760, maxHeight: 820),
          child: Column(children: [
            ListTile(
              leading: _avatar(character.avatarDataUrl, character.name, 42),
              title: Text(text['character']!,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              trailing: IconButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                icon: const Icon(Icons.close_rounded),
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _field(fields['name']!, '名称'),
                  _field(fields['description']!, '角色描述', lines: 5),
                  _field(fields['personality']!, '性格与说话方式', lines: 4),
                  _field(fields['scenario']!, '场景', lines: 4),
                  _field(fields['first']!, '首条消息', lines: 4),
                  _field(fields['examples']!, '示例对话', lines: 5),
                  _field(fields['tags']!, '标签（逗号分隔）'),
                  const Divider(height: 28),
                  Text(text['visualPrompt'] ?? 'NovelAI 角色视觉预设',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  _field(fields['positive']!, '角色正面提示词', lines: 5),
                  _field(fields['negative']!, '角色负面提示词', lines: 4),
                  _field(fields['style']!, '风格提示词', lines: 3),
                  const Divider(height: 28),
                  _field(fields['system']!, '角色系统提示词', lines: 5),
                  _field(fields['post']!, '历史后指令', lines: 4),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                TextButton(
                    onPressed: () => Navigator.pop(dialogContext, false),
                    child: Text(text['cancel']!)),
                const SizedBox(width: 8),
                FilledButton(
                    onPressed: () => Navigator.pop(dialogContext, true),
                    child: Text(text['save']!)),
              ]),
            ),
          ]),
        ),
      ),
    );
    if (saved == true) {
      character
        ..name = fields['name']!.text.trim().isEmpty
            ? character.name
            : fields['name']!.text.trim()
        ..description = fields['description']!.text
        ..personality = fields['personality']!.text
        ..scenario = fields['scenario']!.text
        ..firstMessage = fields['first']!.text
        ..exampleMessages = fields['examples']!.text
        ..systemPrompt = fields['system']!.text
        ..postHistoryInstructions = fields['post']!.text
        ..tags = fields['tags']!
            .text
            .split(RegExp(r'[,，\n]'))
            .map((item) => item.trim())
            .where((item) => item.isNotEmpty)
            .toSet()
            .toList()
        ..updatedAt = tavernNow();
      character.visual
        ..positivePrompt = fields['positive']!.text
        ..negativePrompt = fields['negative']!.text
        ..stylePrompt = fields['style']!.text;
      await controller.saveWorkspace();
    }
    for (final field in fields.values) {
      field.dispose();
    }
  }

  Future<void> _editPersona(AgentController controller, TavernPersona persona,
      Map<String, String> text) async {
    final name = TextEditingController(text: persona.name);
    final description = TextEditingController(text: persona.description);
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(text['persona']!),
        content: SizedBox(
          width: 520,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            _field(name, '名称'),
            _field(description, '身份、外观与叙事偏好', lines: 7),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(text['cancel']!)),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(text['save']!)),
        ],
      ),
    );
    if (saved == true) {
      persona
        ..name = name.text.trim().isEmpty ? persona.name : name.text.trim()
        ..description = description.text
        ..updatedAt = tavernNow();
      await controller.saveWorkspace();
    }
    name.dispose();
    description.dispose();
  }

  Future<void> _editLorebook(AgentController controller, TavernLorebook book,
      Map<String, String> text) async {
    final builtIn = book.id == softwareImageLorebookId;
    final draft = TavernLorebook.fromJson(book.toJson());
    final name = TextEditingController(text: draft.name);
    final description = TextEditingController(text: draft.description);
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720, maxHeight: 780),
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.auto_stories_outlined),
                title: Text(book.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: builtIn
                    ? Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.lock_outline_rounded, size: 13),
                        const SizedBox(width: 3),
                        Text(text['builtIn']!),
                      ])
                    : null,
                trailing: IconButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (builtIn)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.verified_user_outlined,
                                  color: Theme.of(context).colorScheme.primary),
                              const SizedBox(width: 9),
                              Expanded(child: Text(text['builtInHint']!)),
                            ]),
                      ),
                    _field(name, '名称', readOnly: builtIn),
                    _field(description, '说明', lines: 3, readOnly: builtIn),
                    Row(children: [
                      Expanded(
                        child: Text('条目 ${draft.entries.length}',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800)),
                      ),
                      if (!builtIn)
                        FilledButton.tonalIcon(
                          onPressed: () async {
                            final entry = TavernLorebookEntry();
                            final added = await _editLoreEntry(entry);
                            if (added) {
                              setDialogState(() => draft.entries.add(entry));
                            }
                          },
                          icon: const Icon(Icons.add_rounded),
                          label: const Text('添加条目'),
                        ),
                    ]),
                    const SizedBox(height: 8),
                    ...draft.entries.map((entry) => Card(
                          elevation: 0,
                          child: ListTile(
                            title: Text(entry.comment?.trim().isNotEmpty == true
                                ? entry.comment!
                                : (entry.keys.isEmpty
                                    ? '常驻条目'
                                    : entry.keys.join(', '))),
                            subtitle: Text(entry.content,
                                maxLines: 2, overflow: TextOverflow.ellipsis),
                            leading: Switch(
                              value: entry.enabled,
                              onChanged: builtIn
                                  ? null
                                  : (value) => setDialogState(
                                      () => entry.enabled = value),
                            ),
                            onTap: builtIn
                                ? null
                                : () async {
                                    await _editLoreEntry(entry);
                                    setDialogState(() {});
                                  },
                            trailing: builtIn
                                ? const Icon(Icons.lock_outline_rounded)
                                : IconButton(
                                    onPressed: () => setDialogState(
                                        () => draft.entries.remove(entry)),
                                    icon: const Icon(
                                        Icons.delete_outline_rounded),
                                  ),
                          ),
                        )),
                  ],
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                  TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: Text(builtIn ? '关闭' : text['cancel']!)),
                  if (!builtIn) ...[
                    const SizedBox(width: 8),
                    FilledButton(
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: Text(text['save']!)),
                  ],
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
    if (!builtIn && saved == true) {
      book
        ..name = name.text.trim().isEmpty ? book.name : name.text.trim()
        ..description = description.text
        ..scanDepth = draft.scanDepth
        ..tokenBudget = draft.tokenBudget
        ..recursiveScanning = draft.recursiveScanning
        ..entries = draft.entries
        ..extensions = draft.extensions
        ..updatedAt = tavernNow();
      await controller.saveWorkspace();
    }
    name.dispose();
    description.dispose();
  }

  Future<bool> _editLoreEntry(TavernLorebookEntry entry) async {
    final comment = TextEditingController(text: entry.comment ?? '');
    final keys = TextEditingController(text: entry.keys.join(', '));
    final secondary =
        TextEditingController(text: entry.secondaryKeys.join(', '));
    final content = TextEditingController(text: entry.content);
    var constant = entry.constant;
    var selective = entry.selective;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('世界书条目'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                _field(comment, '标题'),
                _field(keys, '主关键词（逗号分隔）'),
                _field(secondary, '次关键词（可选）'),
                _field(content, '注入内容', lines: 8),
                SwitchListTile(
                  value: constant,
                  title: const Text('始终激活'),
                  onChanged: (value) => setState(() => constant = value),
                ),
                SwitchListTile(
                  value: selective,
                  title: const Text('同时匹配次关键词'),
                  onChanged: (value) => setState(() => selective = value),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('取消')),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('保存')),
          ],
        ),
      ),
    );
    if (saved == true) {
      List<String> values(String raw) => raw
          .split(RegExp(r'[,，\n]'))
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList();
      entry
        ..comment = comment.text.trim().isEmpty ? null : comment.text.trim()
        ..keys = values(keys.text)
        ..secondaryKeys = values(secondary.text)
        ..content = content.text
        ..constant = constant
        ..selective = selective;
    }
    comment.dispose();
    keys.dispose();
    secondary.dispose();
    content.dispose();
    return saved == true;
  }

  Future<void> _editImageProposal(AgentController controller,
      AgentMessage message, Map<String, String> text) async {
    final current = message.imageProposal!;
    final positive = TextEditingController(text: current.positivePrompt);
    final width = TextEditingController(text: '${current.width ?? 1024}');
    final height = TextEditingController(text: '${current.height ?? 1024}');
    final steps = TextEditingController(text: '${current.steps ?? 28}');
    final scale = TextEditingController(text: '${current.scale ?? 5}');
    final count = TextEditingController(text: '${current.count}');
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(text['editParams']!),
        content: SizedBox(
          width: 620,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              _field(positive, '正面提示词', lines: 8),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('AI 仅生成正面提示词；负面提示词与风格提示词请在“生图”设置中调整。'),
              ),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _field(width, '宽度', number: true)),
                const SizedBox(width: 8),
                Expanded(child: _field(height, '高度', number: true)),
              ]),
              Row(children: [
                Expanded(child: _field(steps, 'Steps', number: true)),
                const SizedBox(width: 8),
                Expanded(child: _field(scale, 'CFG', number: true)),
                const SizedBox(width: 8),
                Expanded(child: _field(count, '数量', number: true)),
              ]),
            ]),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(text['cancel']!)),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(text['save']!)),
        ],
      ),
    );
    if (saved == true) {
      final proposal = TavernImageProposal(
        id: current.id,
        positivePrompt: positive.text,
        negativePrompt: controller.activeCharacter?.visual.negativePrompt
                    .trim()
                    .isNotEmpty ==
                true
            ? controller.activeCharacter!.visual.negativePrompt
            : defaultTavernNegativePrompt,
        stylePrompt: controller.activeCharacter?.visual.stylePrompt ?? '',
        width: int.tryParse(width.text),
        height: int.tryParse(height.text),
        steps: int.tryParse(steps.text),
        scale: double.tryParse(scale.text),
        count: int.tryParse(count.text)?.clamp(1, 8) ?? 1,
      );
      message.imageProposal = proposal;
      await controller.saveWorkspace();
    }
    for (final field in [positive, width, height, steps, scale, count]) {
      field.dispose();
    }
  }

  Future<void> _configureModel(
      AgentController controller, Map<String, String> text) async {
    final settings = controller.app.settings;
    final key = await controller.app.storage.getAgentApiKey() ?? '';
    if (!mounted) return;
    var protocol = settings.agentApiProtocol;
    var vision = settings.agentVisionEnabled;
    var autoCompact = settings.agentAutoCompact;
    final provider = TextEditingController(text: settings.agentProviderName);
    final base = TextEditingController(text: settings.agentApiBaseUrl);
    final apiKey = TextEditingController(text: key);
    final model = TextEditingController(text: settings.agentApiModel);
    final contextWindow =
        TextEditingController(text: '${settings.agentContextWindow}');
    final maxOutput =
        TextEditingController(text: '${settings.agentMaxOutputTokens}');
    List<AgentDiscoveredModel> discovered = [];
    var detecting = false;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700, maxHeight: 820),
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.hub_outlined),
                title: Text(text['settings']!,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                trailing: IconButton(
                    onPressed: () => Navigator.pop(dialogContext, false),
                    icon: const Icon(Icons.close_rounded)),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    DropdownButtonFormField<AgentProviderPreset>(
                      decoration: const InputDecoration(
                          labelText: '服务预设', border: OutlineInputBorder()),
                      items: agentProviderPresets
                          .map((item) => DropdownMenuItem(
                              value: item, child: Text(item.label)))
                          .toList(),
                      onChanged: (preset) {
                        if (preset == null) return;
                        setDialogState(() {
                          protocol = preset.protocol;
                          provider.text = preset.providerName;
                          base.text = preset.baseUrl;
                          model.text = preset.model;
                          contextWindow.text = '${preset.contextWindow}';
                          maxOutput.text = '${preset.maxOutputTokens}';
                          vision = preset.vision;
                          discovered = [];
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: protocol,
                      decoration: const InputDecoration(
                          labelText: '协议', border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(
                            value: 'openai-responses',
                            child: Text('OpenAI Responses')),
                        DropdownMenuItem(
                            value: 'openai-compatible',
                            child: Text('OpenAI Chat Completions')),
                        DropdownMenuItem(
                            value: 'anthropic-messages',
                            child: Text('Anthropic Messages')),
                        DropdownMenuItem(
                            value: 'google-gemini',
                            child: Text('Google Gemini')),
                      ],
                      onChanged: (value) =>
                          setDialogState(() => protocol = value ?? protocol),
                    ),
                    const SizedBox(height: 12),
                    _field(provider, '服务商名称'),
                    _field(base, 'API 地址'),
                    _field(apiKey, 'API Key', obscure: true),
                    _field(model, '模型名称'),
                    OutlinedButton.icon(
                      onPressed: detecting
                          ? null
                          : () async {
                              setDialogState(() => detecting = true);
                              try {
                                final models =
                                    await controller.provider.discoverModels(
                                  settings: settings,
                                  apiKey: apiKey.text,
                                  protocol: protocol,
                                  baseUrl: base.text,
                                );
                                setDialogState(() {
                                  discovered = models;
                                  detecting = false;
                                });
                              } catch (error) {
                                setDialogState(() => detecting = false);
                                _snack('$error', error: true);
                              }
                            },
                      icon: detecting
                          ? const SizedBox(
                              width: 17,
                              height: 17,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.manage_search_rounded),
                      label: const Text('检测模型与上下文'),
                    ),
                    if (discovered.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      DropdownButtonFormField<AgentDiscoveredModel>(
                        decoration: const InputDecoration(
                            labelText: '检测结果', border: OutlineInputBorder()),
                        items: discovered
                            .map((item) => DropdownMenuItem(
                                value: item, child: Text(item.displayName)))
                            .toList(),
                        onChanged: (item) {
                          if (item == null) return;
                          setDialogState(() {
                            model.text = item.id;
                            if (item.contextWindow != null) {
                              contextWindow.text = '${item.contextWindow}';
                            }
                            if (item.suggestedOutputTokens != null ||
                                item.maxOutputTokens != null) {
                              maxOutput.text =
                                  '${item.suggestedOutputTokens ?? item.maxOutputTokens}';
                            }
                            if (item.vision != null) vision = item.vision!;
                          });
                        },
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(
                          child: _field(contextWindow, '上下文长度', number: true)),
                      const SizedBox(width: 8),
                      Expanded(child: _field(maxOutput, '最大输出', number: true)),
                    ]),
                    SwitchListTile(
                      value: autoCompact,
                      contentPadding: EdgeInsets.zero,
                      title: const Text('自动压缩上下文'),
                      subtitle: const Text('阈值由软件按上下文与最大输出自动计算'),
                      onChanged: (value) =>
                          setDialogState(() => autoCompact = value),
                    ),
                    SwitchListTile(
                      value: vision,
                      contentPadding: EdgeInsets.zero,
                      title: const Text('允许读取图片附件'),
                      onChanged: (value) =>
                          setDialogState(() => vision = value),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                  TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: Text(text['cancel']!)),
                  const SizedBox(width: 8),
                  FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: Text(text['save']!)),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
    if (saved == true) {
      await controller.saveProvider(
        protocol: protocol,
        baseUrl: base.text,
        apiKey: apiKey.text,
        model: model.text,
        providerName: provider.text,
        contextWindow: int.tryParse(contextWindow.text) ?? 128000,
        maxOutputTokens: int.tryParse(maxOutput.text) ?? 8192,
        autoCompact: autoCompact,
        compactThreshold: settings.agentAutoCompactThreshold,
        visionEnabled: vision,
      );
    }
    for (final field in [
      provider,
      base,
      apiKey,
      model,
      contextWindow,
      maxOutput
    ]) {
      field.dispose();
    }
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    int lines = 1,
    bool obscure = false,
    bool number = false,
    bool readOnly = false,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: controller,
          readOnly: readOnly,
          obscureText: obscure,
          maxLines: obscure ? 1 : lines,
          minLines: obscure ? 1 : lines,
          keyboardType: number
              ? const TextInputType.numberWithOptions(decimal: true)
              : lines > 1
                  ? TextInputType.multiline
                  : TextInputType.text,
          decoration: InputDecoration(
              labelText: label,
              suffixIcon: readOnly
                  ? const Icon(Icons.lock_outline_rounded, size: 18)
                  : null,
              filled: readOnly,
              fillColor: readOnly
                  ? Theme.of(context).colorScheme.surfaceContainerLow
                  : null,
              alignLabelWithHint: lines > 1,
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
        ),
      );

  Widget _avatar(String? dataUrl, String name, double size) {
    final software = name.trim() == '软件智能生图';
    return SizedBox(
      width: size,
      height: size,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * .34),
        child: dataUrl == null
            ? ColoredBox(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: Center(
                  child: software
                      ? Icon(
                          Icons.auto_awesome_rounded,
                          size: size * .48,
                          color: Theme.of(context).colorScheme.primary,
                        )
                      : Text(name.trim().isEmpty ? '?' : name.trim()[0],
                          style: TextStyle(
                              fontSize: size * .4,
                              fontWeight: FontWeight.w800)),
                ),
              )
            : _dataImage(dataUrl,
                fit: BoxFit.cover,
                fallback: ColoredBox(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: const Icon(Icons.person_rounded),
                )),
      ),
    );
  }

  Widget _dataImage(String value,
      {required BoxFit fit, required Widget fallback}) {
    try {
      final comma = value.indexOf(',');
      if (!value.startsWith('data:') || comma < 0) return fallback;
      return Image.memory(base64Decode(value.substring(comma + 1)),
          fit: fit, errorBuilder: (_, __, ___) => fallback);
    } catch (_) {
      return fallback;
    }
  }
}

class _MessageEntrance extends StatefulWidget {
  final bool animate;
  final Widget child;

  const _MessageEntrance({
    super.key,
    required this.animate,
    required this.child,
  });

  @override
  State<_MessageEntrance> createState() => _MessageEntranceState();
}

class _MessageEntranceState extends State<_MessageEntrance>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;
  late final Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 180),
      value: widget.animate ? 0 : 1,
    );
    final curve =
        CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _opacity = curve;
    _offset = Tween<Offset>(
      begin: const Offset(0, .045),
      end: Offset.zero,
    ).animate(curve);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller.value == 0) {
      if (MediaQuery.of(context).disableAnimations) {
        _controller.value = 1;
      } else {
        _controller.forward();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _opacity,
        child: SlideTransition(position: _offset, child: widget.child),
      );
}

class _RunIndicator extends StatefulWidget {
  const _RunIndicator();

  @override
  State<_RunIndicator> createState() => _RunIndicatorState();
}

class _RunIndicatorState extends State<_RunIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 850),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary,
        shape: BoxShape.circle,
      ),
    );
    if (MediaQuery.of(context).disableAnimations) return dot;
    return FadeTransition(
      opacity: Tween<double>(begin: .45, end: 1).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: dot,
    );
  }
}

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget dots([double value = .65]) => Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final phase = (value - index * .16) % 1;
            final lift = phase < .5 ? phase * 2 : (1 - phase) * 2;
            return Transform.translate(
              offset: Offset(0, -2 * lift),
              child: Container(
                width: 6,
                height: 6,
                margin: const EdgeInsets.only(right: 4),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primary
                      .withOpacity(.35 + .65 * lift),
                  shape: BoxShape.circle,
                ),
              ),
            );
          }),
        );
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: MediaQuery.of(context).disableAnimations
          ? dots()
          : AnimatedBuilder(
              animation: _controller,
              builder: (_, __) => dots(_controller.value),
            ),
    );
  }
}

class _CommitNumberField extends StatefulWidget {
  final String label;
  final num value;
  final num min;
  final num max;
  final bool integer;
  final ValueChanged<double> onCommit;

  const _CommitNumberField({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onCommit,
    this.integer = false,
  });

  @override
  State<_CommitNumberField> createState() => _CommitNumberFieldState();
}

class _CommitNumberFieldState extends State<_CommitNumberField> {
  late final TextEditingController _controller;
  late final FocusNode _focus;

  String _formatted(num value) => widget.integer
      ? value.round().toString()
      : value.toDouble().toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: _formatted(widget.value));
    _focus = FocusNode()..addListener(_handleFocus);
  }

  @override
  void didUpdateWidget(covariant _CommitNumberField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_focus.hasFocus && oldWidget.value != widget.value) {
      _controller.text = _formatted(widget.value);
    }
  }

  void _handleFocus() {
    if (!_focus.hasFocus) _commit();
  }

  void _commit() {
    final parsed = double.tryParse(_controller.text.trim());
    final next = (parsed ?? widget.value.toDouble())
        .clamp(widget.min.toDouble(), widget.max.toDouble())
        .toDouble();
    final normalized = widget.integer ? next.roundToDouble() : next;
    _controller.text = _formatted(normalized);
    if (normalized != widget.value.toDouble()) widget.onCommit(normalized);
  }

  @override
  void dispose() {
    _focus.removeListener(_handleFocus);
    _focus.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _controller,
        focusNode: _focus,
        keyboardType: TextInputType.numberWithOptions(
          decimal: !widget.integer,
          signed: false,
        ),
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _focus.unfocus(),
        onTapOutside: (_) => _focus.unfocus(),
        decoration: InputDecoration(
          labelText: widget.label,
          border: const OutlineInputBorder(),
        ),
      );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
