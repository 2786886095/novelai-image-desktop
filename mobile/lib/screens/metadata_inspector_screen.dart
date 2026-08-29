import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';

typedef _MetadataText = ({
  String title,
  String subtitle,
  String historyTitle,
  String historyHint,
  String historyGroup,
  String historyAll,
  String historyUngrouped,
  String historyEmpty,
  String historyMore,
  String choose,
  String replace,
  String dropHint,
  String localOnly,
  String detected,
  String sourceNovelAi,
  String sourceSd,
  String sourceComfy,
  String sourceUnknown,
  String compatible,
  String compatibleHint,
  String apply,
  String applied,
  String noCompatible,
  String details,
  String noParams,
  String raw,
  String copyRaw,
  String copied,
  String copyItem,
  String itemCopied,
  String viewOnly,
  String readFailed,
});

const _metadataUngrouped = '__metadata_ungrouped__';

/// Reads a history image through the same session-only snapshot path used by
/// manual imports. Kept outside the widget so the grouped-history action can be
/// verified without an image picker or navigation shell.
Future<({ImageMetadataReport report, File file, String name})>
    inspectHistoryImageMetadata(AppState appState, HistoryItem item) async {
  final source = File(item.filePath);
  if (!source.existsSync()) throw StateError('missing history image');
  final bytes = await source.readAsBytes();
  final report = inspectImageMetadata(parseImageTextMetadata(bytes));
  final fileName = source.uri.pathSegments.isEmpty
      ? item.filePath
      : source.uri.pathSegments.last;
  final snapshot =
      await appState.storage.saveMetadataInspectorImage(bytes, fileName);
  return (report: report, file: snapshot.file, name: fileName);
}

_MetadataText _metadataTextFor(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return (
        title: '恢復圖片原始資料',
        subtitle: '讀取 NovelAI、Stable Diffusion WebUI / Forge 與 ComfyUI 圖片內嵌參數。',
        historyTitle: '從分組記錄選擇',
        historyHint: '直接點選分組中的圖片，即可查看其完整原始資料。',
        historyGroup: '圖片分組',
        historyAll: '全部分組',
        historyUngrouped: '未分組',
        historyEmpty: '此分組暫無可讀取的圖片',
        historyMore: '載入更多',
        choose: '選擇原始圖片',
        replace: '更換圖片',
        dropHint: '支援 PNG、JPG、JPEG、WebP。請盡量選擇未經聊天軟體壓縮的原圖。',
        localOnly: '零積分 · 不呼叫 AI · 不傳送網路請求',
        detected: '辨識來源',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '未知或無可辨識參數',
        compatible: '可一鍵使用的參數',
        compatibleHint: '只套用 NovelAI 支援的相容項目；SD 模型、VAE、LoRA 保留供查看。',
        apply: '一鍵套用到生成',
        applied: '已套用相容參數',
        noCompatible: '沒有可直接套用到 NovelAI 的相容參數',
        details: '逐項參數',
        noParams: '沒有讀取到生成參數。圖片可能被壓縮或匯出時關閉了中繼資料。',
        raw: '完整原始資料',
        copyRaw: '複製原始資料',
        copied: '原始資料已複製',
        copyItem: '複製此項',
        itemCopied: '已複製',
        viewOnly: '部分 SD / ComfyUI 專用值只能查看，無法直接套用到 NovelAI。',
        readFailed: '無法讀取該圖片，請確認檔案未損壞並重新選擇原圖。',
      );
    case 'en-US':
      return (
        title: 'Restore Image Metadata',
        subtitle:
            'Read embedded NovelAI, Stable Diffusion WebUI / Forge, and ComfyUI generation data.',
        historyTitle: 'Choose from grouped history',
        historyHint:
            'Tap an image in any group to inspect its complete metadata.',
        historyGroup: 'Image group',
        historyAll: 'All groups',
        historyUngrouped: 'Ungrouped',
        historyEmpty: 'No readable images in this group',
        historyMore: 'Load more',
        choose: 'Choose original image',
        replace: 'Replace image',
        dropHint:
            'Supports PNG, JPG, JPEG, and WebP. Use the uncompressed original whenever possible.',
        localOnly: '0 Anlas · no AI call · no network request',
        detected: 'Detected source',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: 'Unknown or no recognized parameters',
        compatible: 'Parameters ready to reuse',
        compatibleHint:
            'Only NovelAI-compatible values are applied. SD model, VAE, and LoRA values remain view-only.',
        apply: 'Use in Generate',
        applied: 'Compatible parameters applied',
        noCompatible: 'No compatible parameters can be applied to NovelAI',
        details: 'Parameter details',
        noParams:
            'No generation parameters were found. The image may have been compressed or exported without metadata.',
        raw: 'Complete raw metadata',
        copyRaw: 'Copy raw metadata',
        copied: 'Raw metadata copied',
        copyItem: 'Copy value',
        itemCopied: 'Copied',
        viewOnly:
            'Some SD / ComfyUI-only values are view-only and cannot be applied directly to NovelAI.',
        readFailed:
            'Could not read this image. Check that the file is intact and choose the original again.',
      );
    case 'ja-JP':
      return (
        title: '画像の元データを復元',
        subtitle:
            'NovelAI、Stable Diffusion WebUI / Forge、ComfyUI の埋め込み生成情報を読み取ります。',
        historyTitle: 'グループ履歴から選択',
        historyHint: 'グループ内の画像をタップすると、完全な元データを確認できます。',
        historyGroup: '画像グループ',
        historyAll: 'すべてのグループ',
        historyUngrouped: '未分類',
        historyEmpty: 'このグループに読み取れる画像はありません',
        historyMore: 'さらに読み込む',
        choose: '元画像を選択',
        replace: '画像を変更',
        dropHint: 'PNG、JPG、JPEG、WebP に対応。可能な限り未圧縮の元画像を選択してください。',
        localOnly: 'Anlas 0 · AI 不使用 · ネットワーク送信なし',
        detected: '検出元',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '不明または認識可能な設定なし',
        compatible: '再利用できる設定',
        compatibleHint: 'NovelAI と互換性のある項目だけを適用します。SD のモデル、VAE、LoRA は閲覧のみです。',
        apply: '生成画面で使用',
        applied: '互換設定を適用しました',
        noCompatible: 'NovelAI に直接適用できる互換設定がありません',
        details: '設定一覧',
        noParams: '生成設定を読み取れません。圧縮されたか、メタデータなしで保存された可能性があります。',
        raw: '完全な元データ',
        copyRaw: '元データをコピー',
        copied: '元データをコピーしました',
        copyItem: 'この値をコピー',
        itemCopied: 'コピーしました',
        viewOnly: '一部の SD / ComfyUI 専用値は閲覧のみで、NovelAI へ直接適用できません。',
        readFailed: '画像を読み取れません。ファイルが壊れていないか確認し、元画像を選び直してください。',
      );
    case 'ko-KR':
      return (
        title: '이미지 원본 데이터 복원',
        subtitle:
            'NovelAI, Stable Diffusion WebUI / Forge, ComfyUI 이미지의 내장 생성 정보를 읽습니다.',
        historyTitle: '그룹 기록에서 선택',
        historyHint: '그룹의 이미지를 누르면 전체 원본 데이터를 확인할 수 있습니다.',
        historyGroup: '이미지 그룹',
        historyAll: '모든 그룹',
        historyUngrouped: '미분류',
        historyEmpty: '이 그룹에 읽을 수 있는 이미지가 없습니다',
        historyMore: '더 불러오기',
        choose: '원본 이미지 선택',
        replace: '이미지 변경',
        dropHint: 'PNG, JPG, JPEG, WebP 지원. 가능하면 압축되지 않은 원본을 선택하세요.',
        localOnly: 'Anlas 0 · AI 호출 없음 · 네트워크 전송 없음',
        detected: '감지된 출처',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '알 수 없거나 인식 가능한 매개변수 없음',
        compatible: '바로 사용할 수 있는 매개변수',
        compatibleHint: 'NovelAI와 호환되는 값만 적용합니다. SD 모델, VAE, LoRA 값은 보기 전용입니다.',
        apply: '생성 화면에서 사용',
        applied: '호환 매개변수를 적용했습니다',
        noCompatible: 'NovelAI에 바로 적용할 수 있는 호환 매개변수가 없습니다',
        details: '매개변수 상세',
        noParams: '생성 매개변수를 찾지 못했습니다. 이미지가 압축되었거나 메타데이터 없이 저장되었을 수 있습니다.',
        raw: '전체 원본 데이터',
        copyRaw: '원본 데이터 복사',
        copied: '원본 데이터를 복사했습니다',
        copyItem: '이 값 복사',
        itemCopied: '복사했습니다',
        viewOnly: '일부 SD / ComfyUI 전용 값은 보기 전용이며 NovelAI에 바로 적용할 수 없습니다.',
        readFailed: '이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인하고 원본을 다시 선택하세요.',
      );
    default:
      return (
        title: '恢复图片原数据',
        subtitle: '读取 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 图片内嵌参数。',
        historyTitle: '从分组记录选择',
        historyHint: '直接点击分组中的图片，即可查看其完整原数据。',
        historyGroup: '图片分组',
        historyAll: '全部分组',
        historyUngrouped: '未分组',
        historyEmpty: '该分组暂无可读取的图片',
        historyMore: '加载更多',
        choose: '选择原始图片',
        replace: '更换图片',
        dropHint: '支持 PNG、JPG、JPEG、WebP。请尽量选择未经聊天软件压缩的原图。',
        localOnly: '零积分 · 不调用 AI · 不发送网络请求',
        detected: '识别来源',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '未知或无可识别参数',
        compatible: '可一键使用的参数',
        compatibleHint: '只套用 NovelAI 支持的兼容项；SD 模型、VAE、LoRA 保留供查看。',
        apply: '一键使用到生成',
        applied: '已套用兼容参数',
        noCompatible: '没有可直接套用到 NovelAI 的兼容参数',
        details: '逐项参数',
        noParams: '没有读取到生成参数。图片可能被平台压缩或导出时关闭了元数据。',
        raw: '完整原始数据',
        copyRaw: '复制原始数据',
        copied: '原始数据已复制',
        copyItem: '复制此项',
        itemCopied: '已复制',
        viewOnly: '部分 SD / ComfyUI 专用值只能查看，无法直接套用到 NovelAI。',
        readFailed: '无法读取该图片，请确认文件未损坏并重新选择原图。',
      );
  }
}

const _importedEnglish = <String, String>{
  'positivePrompt': 'Positive prompt',
  'negativePrompt': 'Negative prompt',
  'model': 'Model',
  'steps': 'Steps',
  'cfgScale': 'CFG scale',
  'cfgRescale': 'CFG rescale',
  'sampler': 'Sampler',
  'noiseSchedule': 'Noise schedule',
  'seed': 'Seed',
  'seedMode': 'Seed mode',
  'width': 'Width',
  'height': 'Height',
  'smea': 'SMEA',
  'smeaDyn': 'SMEA Dyn',
};

const _parameterEnglish = <String, String>{
  'positive prompt': 'Positive prompt',
  'negative prompt': 'Negative prompt',
  'style prompt': 'Style prompt',
  'description': 'Description',
  'prompt': 'Prompt',
  'uc': 'Undesired content',
  'steps': 'Steps',
  'cfg scale': 'CFG scale',
  'scale': 'CFG scale',
  'cfg rescale': 'CFG rescale',
  'cfg_rescale': 'CFG rescale',
  'sampler': 'Sampler',
  'scheduler': 'Scheduler',
  'schedule type': 'Schedule type',
  'noise schedule': 'Noise schedule',
  'noise_schedule': 'Noise schedule',
  'seed': 'Seed',
  'seed mode': 'Seed mode',
  'width': 'Width',
  'height': 'Height',
  'size': 'Size',
  'model': 'Model',
  'source': 'Source',
  'software': 'Software',
  'model hash': 'Model hash',
  'vae': 'VAE',
  'vae hash': 'VAE hash',
  'lora': 'LoRA',
  'checkpoint': 'Checkpoint',
  'denoise': 'Denoise',
  'denoising strength': 'Denoising strength',
  'clip skip': 'Clip skip',
  'version': 'Version',
  'smea': 'SMEA',
  'sm': 'SMEA',
  'smea dyn': 'SMEA Dyn',
  'sm_dyn': 'SMEA Dyn',
  'dynamic_thresholding': 'Dynamic thresholding',
  'qualitytoggle': 'Quality toggle',
  'quality toggle': 'Quality toggle',
  'uc preset': 'UC preset',
  'variety+': 'Variety+',
  'params_version': 'Parameters version',
  'hires steps': 'Hires steps',
  'hires upscale': 'Hires upscale',
  'hires upscaler': 'Hires upscaler',
  'hires prompt': 'Hires prompt',
  'hires negative prompt': 'Hires negative prompt',
  'lora hashes': 'LoRA hashes',
  'adetailer model': 'ADetailer model',
  'adetailer prompt': 'ADetailer prompt',
  'adetailer negative prompt': 'ADetailer negative prompt',
  'adetailer confidence': 'ADetailer confidence',
  'adetailer denoising strength': 'ADetailer denoising strength',
  'adetailer version': 'ADetailer version',
};

const _zhCnParameters = <String, String>{
  'Positive prompt': '正面提示词',
  'Negative prompt': '负面提示词',
  'Description': '提示词描述',
  'Prompt': '提示词',
  'Undesired content': '不希望出现的内容',
  'Steps': '采样步数',
  'CFG scale': '提示词引导强度',
  'CFG rescale': 'CFG 重缩放',
  'Sampler': '采样器',
  'Scheduler': '调度器',
  'Schedule type': '调度类型',
  'Noise schedule': '噪声调度',
  'Seed': '种子',
  'Seed mode': '种子模式',
  'Width': '宽度',
  'Height': '高度',
  'Size': '尺寸',
  'Model': '模型',
  'Source': '来源模型',
  'Software': '生成软件',
  'Model hash': '模型哈希',
  'VAE': 'VAE 模型',
  'VAE hash': 'VAE 哈希',
  'LoRA': 'LoRA 模型',
  'Checkpoint': '基础模型',
  'Denoise': '降噪强度',
  'Denoising strength': '重绘强度',
  'Clip skip': 'CLIP 跳过层数',
  'Version': '版本',
  'SMEA': 'SMEA 平滑',
  'SMEA Dyn': '动态 SMEA',
  'Dynamic thresholding': '动态阈值',
  'Quality toggle': '质量增强',
  'Style prompt': '风格提示词',
  'UC preset': '负面预设',
  'Variety+': '多样化',
  'Parameters version': '参数版本',
  'Hires steps': '高清修复步数',
  'Hires upscale': '高清放大倍数',
  'Hires upscaler': '高清放大算法',
  'Hires prompt': '高清修复提示词',
  'Hires negative prompt': '高清修复负面提示词',
  'LoRA hashes': 'LoRA 哈希',
  'ADetailer model': '细节修复模型',
  'ADetailer prompt': '细节修复提示词',
  'ADetailer negative prompt': '细节修复负面提示词',
  'ADetailer confidence': '细节检测置信度',
  'ADetailer denoising strength': '细节修复重绘强度',
  'ADetailer version': '细节修复版本',
};

Map<String, String> _parameterTranslations(String code) => switch (code) {
      'zh-CN' => _zhCnParameters,
      'zh-TW' => _zhCnParameters.map((key, value) => MapEntry(
          key,
          value
              .replaceAll('提示词', '提示詞')
              .replaceAll('采样', '取樣')
              .replaceAll('调度', '排程')
              .replaceAll('噪声', '雜訊')
              .replaceAll('种子', '種子')
              .replaceAll('宽度', '寬度')
              .replaceAll('软件', '軟體')
              .replaceAll('哈希', '雜湊')
              .replaceAll('参数', '參數')
              .replaceAll('动态', '動態')
              .replaceAll('质量', '品質')
              .replaceAll('重绘', '重繪'))),
      'ja-JP' => const {
          'Positive prompt': 'ポジティブプロンプト',
          'Negative prompt': 'ネガティブプロンプト',
          'Description': 'プロンプト記述',
          'Prompt': 'プロンプト',
          'Undesired content': '除外内容',
          'Steps': 'ステップ数',
          'CFG scale': 'CFG スケール',
          'CFG rescale': 'CFG リスケール',
          'Sampler': 'サンプラー',
          'Scheduler': 'スケジューラー',
          'Schedule type': 'スケジュール方式',
          'Noise schedule': 'ノイズスケジュール',
          'Seed': 'シード',
          'Seed mode': 'シード方式',
          'Width': '幅',
          'Height': '高さ',
          'Size': 'サイズ',
          'Model': 'モデル',
          'Source': '生成元',
          'Software': '生成ソフト',
          'Model hash': 'モデルハッシュ',
          'Checkpoint': 'チェックポイント',
          'Denoise': 'ノイズ除去',
          'Denoising strength': 'ノイズ除去強度',
          'Clip skip': 'CLIP スキップ',
          'Version': 'バージョン',
          'SMEA Dyn': '動的 SMEA',
          'Dynamic thresholding': '動的しきい値',
          'Quality toggle': '品質向上',
          'Style prompt': 'スタイルプロンプト',
          'UC preset': 'ネガティブプリセット',
          'Variety+': '多様化',
          'Parameters version': 'パラメータ版',
          'Hires steps': '高解像度ステップ',
          'Hires upscale': '高解像度倍率',
          'Hires upscaler': '高解像度アップスケーラー',
          'Hires prompt': '高解像度プロンプト',
          'Hires negative prompt': '高解像度ネガティブプロンプト',
          'LoRA hashes': 'LoRA ハッシュ',
          'ADetailer model': 'ディテール修正モデル',
          'ADetailer prompt': 'ディテール修正プロンプト',
          'ADetailer negative prompt': 'ディテール修正ネガティブプロンプト',
          'ADetailer confidence': 'ディテール検出信頼度',
          'ADetailer denoising strength': 'ディテール修正強度',
          'ADetailer version': 'ADetailer バージョン',
        },
      'ko-KR' => const {
          'Positive prompt': '긍정 프롬프트',
          'Negative prompt': '부정 프롬프트',
          'Description': '프롬프트 설명',
          'Prompt': '프롬프트',
          'Undesired content': '제외할 내용',
          'Steps': '샘플링 단계',
          'CFG scale': 'CFG 강도',
          'CFG rescale': 'CFG 재조정',
          'Sampler': '샘플러',
          'Scheduler': '스케줄러',
          'Schedule type': '스케줄 유형',
          'Noise schedule': '노이즈 스케줄',
          'Seed': '시드',
          'Seed mode': '시드 모드',
          'Width': '너비',
          'Height': '높이',
          'Size': '크기',
          'Model': '모델',
          'Source': '출처 모델',
          'Software': '생성 소프트웨어',
          'Model hash': '모델 해시',
          'Checkpoint': '체크포인트',
          'Denoise': '노이즈 제거',
          'Denoising strength': '노이즈 제거 강도',
          'Clip skip': 'CLIP 건너뛰기',
          'Version': '버전',
          'SMEA Dyn': '동적 SMEA',
          'Dynamic thresholding': '동적 임계값',
          'Quality toggle': '품질 향상',
          'Style prompt': '스타일 프롬프트',
          'UC preset': '네거티브 프리셋',
          'Variety+': '다양화',
          'Parameters version': '매개변수 버전',
          'Hires steps': '고해상도 단계',
          'Hires upscale': '고해상도 배율',
          'Hires upscaler': '고해상도 업스케일러',
          'Hires prompt': '고해상도 프롬프트',
          'Hires negative prompt': '고해상도 부정 프롬프트',
          'LoRA hashes': 'LoRA 해시',
          'ADetailer model': '세부 보정 모델',
          'ADetailer prompt': '세부 보정 프롬프트',
          'ADetailer negative prompt': '세부 보정 부정 프롬프트',
          'ADetailer confidence': '세부 감지 신뢰도',
          'ADetailer denoising strength': '세부 보정 강도',
          'ADetailer version': 'ADetailer 버전',
        },
      _ => const {},
    };

String metadataParameterLabel(Object? language, String key) {
  final code = normalizeAppLocaleCode(language);
  final english = _parameterEnglish[key.trim().toLowerCase()] ?? key;
  if (code == 'en-US') return english;
  final generic = switch (code) {
    'zh-TW' => '其他參數',
    'ja-JP' => 'その他の設定',
    'ko-KR' => '기타 매개변수',
    _ => '其他参数',
  };
  final translated = _parameterTranslations(code)[english] ?? generic;
  return '$translated ($english)';
}

String metadataGroupLabel(Object? language, String group) {
  final code = normalizeAppLocaleCode(language);
  final english = const {
        'generation': 'Generation',
        'model': 'Model',
        'image': 'Image',
        'raw': 'Raw'
      }[group] ??
      group;
  if (code == 'en-US') return english;
  final translated = switch (code) {
        'zh-TW' => const {
            'Generation': '生成參數',
            'Model': '模型參數',
            'Image': '圖片參數',
            'Raw': '原始資料'
          },
        'ja-JP' => const {
            'Generation': '生成設定',
            'Model': 'モデル設定',
            'Image': '画像設定',
            'Raw': '元データ'
          },
        'ko-KR' => const {
            'Generation': '생성 매개변수',
            'Model': '모델 매개변수',
            'Image': '이미지 매개변수',
            'Raw': '원본 데이터'
          },
        _ => const {
            'Generation': '生成参数',
            'Model': '模型参数',
            'Image': '图像参数',
            'Raw': '原始数据'
          },
      }[english] ??
      english;
  return '$translated ($english)';
}

class MetadataInspectorScreen extends StatefulWidget {
  final VoidCallback onBack;
  final VoidCallback onOpenGenerate;

  const MetadataInspectorScreen({
    super.key,
    required this.onBack,
    required this.onOpenGenerate,
  });

  @override
  State<MetadataInspectorScreen> createState() =>
      _MetadataInspectorScreenState();
}

class _MetadataInspectorScreenState extends State<MetadataInspectorScreen> {
  final _picker = ImagePicker();
  ImageMetadataReport? _report;
  String? _filePath;
  String _fileName = '';
  bool _reading = false;
  bool _historyOpen = true;
  String _historyGroupId = '';
  String? _historyReadingId;
  int _historyDisplayLimit = 60;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restoreSnapshot());
  }

  Future<void> _restoreSnapshot() async {
    try {
      final snapshot =
          await context.read<AppState>().storage.getMetadataInspectorImage();
      if (snapshot == null || !mounted) return;
      final bytes = await snapshot.file.readAsBytes();
      final report = inspectImageMetadata(parseImageTextMetadata(bytes));
      if (!mounted) return;
      setState(() {
        _report = report;
        _filePath = snapshot.file.path;
        _fileName = snapshot.name;
      });
    } catch (_) {
      // Persistence is best-effort; image import remains available.
    }
  }

  Future<void> _pick() async {
    final appState = context.read<AppState>();
    final text = _metadataTextFor(appState.settings.language);
    setState(() => _reading = true);
    try {
      final picked = await _picker.pickImage(source: ImageSource.gallery);
      if (picked == null || !mounted) return;
      final bytes = await picked.readAsBytes();
      final report = inspectImageMetadata(parseImageTextMetadata(bytes));
      final snapshot =
          await appState.storage.saveMetadataInspectorImage(bytes, picked.name);
      if (!mounted) return;
      setState(() {
        _report = report;
        _filePath = snapshot.file.path;
        _fileName = picked.name;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(text.readFailed)));
      }
    } finally {
      if (mounted) setState(() => _reading = false);
    }
  }

  Future<void> _readHistoryImage(
    AppState appState,
    HistoryItem item,
    _MetadataText text,
  ) async {
    setState(() => _historyReadingId = item.id);
    try {
      final result = await inspectHistoryImageMetadata(appState, item);
      if (!mounted) return;
      setState(() {
        _report = result.report;
        _filePath = result.file.path;
        _fileName = result.name;
        _historyOpen = false;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(text.readFailed)));
      }
    } finally {
      if (mounted) setState(() => _historyReadingId = null);
    }
  }

  String _source(_MetadataText text, ImageMetadataKind kind) => switch (kind) {
        ImageMetadataKind.novelAi => text.sourceNovelAi,
        ImageMetadataKind.stableDiffusion => text.sourceSd,
        ImageMetadataKind.comfyUi => text.sourceComfy,
        ImageMetadataKind.unknown => text.sourceUnknown,
      };

  Future<void> _copyItem(String value, String label, _MetadataText text) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('${text.itemCopied}: $label')));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = _metadataTextFor(state.settings.language);
    final report = _report;
    final compatible = report?.imported.compatibleValues ?? const {};
    final history = state.history.where((item) {
      if (_historyGroupId == _metadataUngrouped) {
        return item.groupId == null || item.groupId!.isEmpty;
      }
      return _historyGroupId.isEmpty || item.groupId == _historyGroupId;
    }).toList(growable: false);
    final visibleHistory = history.take(_historyDisplayLimit).toList();
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          onPressed: widget.onBack,
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(text.title),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 980),
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(16),
            children: [
              Text(text.subtitle, style: Theme.of(context).textTheme.bodyLarge),
              const SizedBox(height: 12),
              _HistoryMetadataPicker(
                text: text,
                groups: state.groups,
                items: visibleHistory,
                totalCount: history.length,
                selectedGroupId: _historyGroupId,
                expanded: _historyOpen,
                readingId: _historyReadingId,
                onExpandedChanged: (value) =>
                    setState(() => _historyOpen = value),
                onGroupChanged: (value) => setState(() {
                  _historyGroupId = value;
                  _historyDisplayLimit = 60;
                }),
                onSelect: (item) => _readHistoryImage(state, item, text),
                onLoadMore: () => setState(() => _historyDisplayLimit += 60),
              ),
              const SizedBox(height: 12),
              Card(
                clipBehavior: Clip.antiAlias,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: LayoutBuilder(builder: (context, constraints) {
                    final compact = constraints.maxWidth < 620;
                    final preview =
                        _filePath != null && File(_filePath!).existsSync()
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(14),
                                child: Image.file(
                                  File(_filePath!),
                                  width: compact ? double.infinity : 150,
                                  height: 150,
                                  fit: BoxFit.contain,
                                ),
                              )
                            : Container(
                                width: compact ? double.infinity : 150,
                                height: 150,
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(Icons.image_search, size: 44),
                              );
                    final copy = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _fileName.isEmpty ? text.choose : _fileName,
                          style: Theme.of(context).textTheme.titleMedium,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 2,
                        ),
                        const SizedBox(height: 6),
                        Text(text.dropHint),
                        const SizedBox(height: 6),
                        Text(
                          text.localOnly,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.primary),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.tonalIcon(
                          onPressed: _reading ? null : _pick,
                          icon: _reading
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.folder_open),
                          label:
                              Text(report == null ? text.choose : text.replace),
                        ),
                      ],
                    );
                    return compact
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              preview,
                              const SizedBox(height: 14),
                              copy
                            ],
                          )
                        : Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              preview,
                              const SizedBox(width: 18),
                              Expanded(child: copy),
                            ],
                          );
                  }),
                ),
              ),
              if (report != null) ...[
                const SizedBox(height: 12),
                _SummaryCard(
                  title: text.detected,
                  value: _source(text, report.kind),
                  subtitle: report.software,
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(text.compatible,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        Text(text.compatibleHint),
                        const SizedBox(height: 12),
                        if (compatible.isEmpty)
                          Text(text.noCompatible)
                        else
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: compatible.entries.map((entry) {
                              final english =
                                  _importedEnglish[entry.key] ?? entry.key;
                              return Chip(
                                  label: Text(
                                '${metadataParameterLabel(state.settings.language, english)}: ${entry.value}',
                              ));
                            }).toList(),
                          ),
                        const SizedBox(height: 14),
                        FilledButton.icon(
                          onPressed: compatible.isEmpty
                              ? null
                              : () {
                                  state.applyImportedMetadata(
                                    report.imported,
                                    characterCaptions: report.characterCaptions,
                                    exact: true,
                                    preserveMissing: true,
                                  );
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(text.applied)));
                                  widget.onOpenGenerate();
                                },
                          icon: const Icon(Icons.play_arrow),
                          label: Text(text.apply),
                        ),
                      ],
                    ),
                  ),
                ),
                if (report.kind == ImageMetadataKind.stableDiffusion ||
                    report.kind == ImageMetadataKind.comfyUi) ...[
                  const SizedBox(height: 12),
                  Card(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.info_outline),
                          const SizedBox(width: 10),
                          Expanded(child: Text(text.viewOnly)),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(text.details,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        if (report.entries.isEmpty)
                          Text(text.noParams)
                        else
                          ...report.entries.map((entry) => _ParameterTile(
                                entry: entry,
                                label: metadataParameterLabel(
                                    state.settings.language, entry.key),
                                groupLabel: metadataGroupLabel(
                                    state.settings.language, entry.group),
                                copyTooltip: text.copyItem,
                                onCopy: () => _copyItem(
                                  entry.value,
                                  metadataParameterLabel(
                                      state.settings.language, entry.key),
                                  text,
                                ),
                              )),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: ExpansionTile(
                    title: Text(text.raw),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: Alignment.centerRight,
                        child: OutlinedButton.icon(
                          onPressed: report.rawText.isEmpty
                              ? null
                              : () async {
                                  await Clipboard.setData(
                                      ClipboardData(text: report.rawText));
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(text.copied)));
                                },
                          icon: const Icon(Icons.copy),
                          label: Text(text.copyRaw),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        constraints: const BoxConstraints(maxHeight: 420),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: SingleChildScrollView(
                          child: SelectableText(
                            report.rawText.isEmpty
                                ? text.noParams
                                : report.rawText,
                            style: const TextStyle(
                                fontFamily: 'monospace', fontSize: 12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _HistoryMetadataPicker extends StatelessWidget {
  final _MetadataText text;
  final List<HistoryGroup> groups;
  final List<HistoryItem> items;
  final int totalCount;
  final String selectedGroupId;
  final bool expanded;
  final String? readingId;
  final ValueChanged<bool> onExpandedChanged;
  final ValueChanged<String> onGroupChanged;
  final ValueChanged<HistoryItem> onSelect;
  final VoidCallback onLoadMore;

  const _HistoryMetadataPicker({
    required this.text,
    required this.groups,
    required this.items,
    required this.totalCount,
    required this.selectedGroupId,
    required this.expanded,
    required this.readingId,
    required this.onExpandedChanged,
    required this.onGroupChanged,
    required this.onSelect,
    required this.onLoadMore,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(text.historyTitle),
            subtitle: Text(text.historyHint),
            trailing: Icon(expanded ? Icons.expand_less : Icons.expand_more),
            onTap: () => onExpandedChanged(!expanded),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              // Keep room for the dropdown's floating label. With zero top
              // padding AnimatedCrossFade clipped "图片分组" against its own
              // bounds on compact Android screens.
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String>(
                    value: selectedGroupId,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: text.historyGroup,
                      prefixIcon: const Icon(Icons.folder_outlined),
                    ),
                    items: [
                      DropdownMenuItem(
                        value: '',
                        child: Text(text.historyAll,
                            overflow: TextOverflow.ellipsis),
                      ),
                      DropdownMenuItem(
                        value: _metadataUngrouped,
                        child: Text(text.historyUngrouped,
                            overflow: TextOverflow.ellipsis),
                      ),
                      ...groups.map(
                        (group) => DropdownMenuItem(
                          value: group.id,
                          child:
                              Text(group.name, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    ],
                    onChanged: (value) => onGroupChanged(value ?? ''),
                  ),
                  const SizedBox(height: 12),
                  if (items.isEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 24),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        children: [
                          Icon(Icons.image_not_supported_outlined,
                              color: theme.colorScheme.outline),
                          const SizedBox(height: 8),
                          Text(text.historyEmpty,
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyMedium),
                        ],
                      ),
                    )
                  else
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final columns = constraints.maxWidth < 420
                            ? 2
                            : constraints.maxWidth < 720
                                ? 4
                                : 6;
                        final rows =
                            (items.length / columns).ceil().clamp(1, 2);
                        final cellWidth =
                            (constraints.maxWidth - (columns - 1) * 10) /
                                columns;
                        final height =
                            rows * (cellWidth * 1.22) + (rows - 1) * 10;
                        return SizedBox(
                          height: height.clamp(150, 360).toDouble(),
                          child: GridView.builder(
                            itemCount: items.length,
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: columns,
                              crossAxisSpacing: 10,
                              mainAxisSpacing: 10,
                              childAspectRatio: .82,
                            ),
                            itemBuilder: (context, index) {
                              final item = items[index];
                              final file = File(item.filePath);
                              final fileName = file.uri.pathSegments.isEmpty
                                  ? item.filePath
                                  : file.uri.pathSegments.last;
                              final reading = readingId == item.id;
                              return Material(
                                key: ValueKey('metadata-history-${item.id}'),
                                color: theme.colorScheme.surfaceContainerLow,
                                borderRadius: BorderRadius.circular(12),
                                clipBehavior: Clip.antiAlias,
                                child: InkWell(
                                  onTap: reading ? null : () => onSelect(item),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Expanded(
                                        child: Stack(
                                          fit: StackFit.expand,
                                          children: [
                                            Image.file(
                                              file,
                                              fit: BoxFit.contain,
                                              cacheWidth: 320,
                                              errorBuilder: (_, __, ___) =>
                                                  const Center(
                                                child: Icon(Icons.broken_image),
                                              ),
                                            ),
                                            if (reading)
                                              const ColoredBox(
                                                color: Colors.black26,
                                                child: Center(
                                                  child:
                                                      CircularProgressIndicator(),
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.all(8),
                                        child: Text(
                                          fileName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: theme.textTheme.labelMedium,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        );
                      },
                    ),
                  if (items.length < totalCount) ...[
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: onLoadMore,
                      icon: const Icon(Icons.expand_more),
                      label: Text('${text.historyMore} '
                          '(${items.length}/$totalCount)'),
                    ),
                  ],
                ],
              ),
            ),
            crossFadeState:
                expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 180),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final String subtitle;

  const _SummaryCard({
    required this.title,
    required this.value,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: const Icon(Icons.data_object),
          title: Text(value),
          subtitle: Text(subtitle.isEmpty ? title : '$title · $subtitle'),
        ),
      );
}

class _ParameterTile extends StatelessWidget {
  final ImageMetadataEntry entry;
  final String label;
  final String groupLabel;
  final String copyTooltip;
  final VoidCallback onCopy;

  const _ParameterTile({
    required this.entry,
    required this.label,
    required this.groupLabel,
    required this.copyTooltip,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border:
                Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(label,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                    IconButton(
                      tooltip: '$copyTooltip: $label',
                      visualDensity: VisualDensity.compact,
                      onPressed: onCopy,
                      icon: const Icon(Icons.copy_outlined, size: 19),
                    ),
                  ],
                ),
                Text(groupLabel, style: Theme.of(context).textTheme.labelSmall),
                const SizedBox(height: 6),
                SelectableText(entry.value),
              ],
            ),
          ),
        ),
      );
}
