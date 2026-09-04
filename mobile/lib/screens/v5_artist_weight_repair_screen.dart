import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../artist/artist_recipe.dart';
import '../artist/random_custom_tag_library.dart';
import '../artist/weight_distribution.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../prompts/v5_artist_weight_repair.dart';
import '../state/app_state.dart';
import '../ui/quality_preset_control.dart';
import '../ui/weight_distribution_controls.dart';
import 'positive_prompt_preset_sheet.dart';

class _RepairDrawResult {
  final ArtistRecipe recipe;
  final int sequence;
  int seed;
  String status;
  HistoryItem? image;
  String? error;
  String generationModel;
  bool liked;
  bool saving = false;

  _RepairDrawResult(
    this.recipe, {
    required this.sequence,
    required this.seed,
    this.status = 'pending',
    this.image,
    this.error,
    this.generationModel = 'nai-diffusion-5-full',
    this.liked = false,
  });

  Map<String, dynamic> toJson() => {
        'recipe': recipe.toJson(),
        'sequence': sequence,
        'seed': seed,
        'status': status,
        'image': image?.toJson(),
        'error': error,
        'generationModel': generationModel,
        'liked': liked,
      };

  factory _RepairDrawResult.fromJson(Map<String, dynamic> json) =>
      _RepairDrawResult(
        ArtistRecipe.fromJson(
          Map<String, dynamic>.from(json['recipe'] as Map? ?? const {}),
        ),
        sequence: (json['sequence'] as num?)?.toInt() ?? 1,
        seed: (json['seed'] as num?)?.toInt() ?? 1,
        status: json['status']?.toString() ?? 'done',
        image: json['image'] is Map
            ? HistoryItem.fromJson(
                Map<String, dynamic>.from(json['image'] as Map),
              )
            : null,
        error: json['error']?.toString(),
        generationModel:
            json['generationModel']?.toString() ?? 'nai-diffusion-5-full',
        liked: json['liked'] == true,
      );
}

Map<String, String> _repairText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return {
        'title': 'V4.5 畫師串修復器',
        'subtitle':
            '自動識別畫師、品質詞與其他 Tag；整串每個有效 Tag 都獨立壓到原權重的 1/3–1/2，並統一為規範 V5 數值格式。',
        'basis': '使用者實測與限制',
        'note':
            'NovelAI 官方沒有公布 V4.5→V5 換算公式。社群的 1/3–1/2 建議主要來自舊畫師權重遷移；依本工具設定，品質、風格與其他有效 Tag 也會套用相同範圍。這不是官方標準。',
        'safe':
            '明確的 artist: 與已確認的無前綴畫師名會辨識為畫師；品質、風格、年份、負面與內容 Tag 不會被加上 artist:。重複分隔符與孤立 :: 會自動清理。',
        'strategy': '社群遷移策略',
        'input': 'V4.5 完整 Tag 串',
        'output': '規範 V5 Tag 串',
        'run': '隨機修復畫師權重',
        'copy': '複製結果',
        'reset': '恢復預設',
        'empty': '請先貼上畫師串。',
        'none': '未識別到有效 Tag；請檢查輸入與分隔符。',
        'done':
            '已產生 {candidates} 組候選；每組修復 {count} 個 Tag（畫師 {artists}、品質詞 {quality}、其他 {other}）。',
        'copied': '已複製結果。',
      };
    case 'en-US':
      return {
        'title': 'V4.5 Artist-string Repair',
        'subtitle':
            'Auto-detect artist, quality, and other tags; independently scale every valid tag to one third–one half of its old weight and normalize V5 syntax.',
        'basis': 'Community evidence and limits',
        'note':
            'NovelAI publishes no V4.5→V5 formula. The community one-third-to-one-half heuristic mainly concerns legacy artist weights; this tool deliberately applies it to quality, style, and other valid tags for whole-string migration. It is not an official standard.',
        'safe':
            'Explicit artist: tags and reviewed bare artist names are classified as artists. Quality, style, year, negative, and content tags never gain artist:. Repeated separators and orphan :: markers are cleaned.',
        'strategy': 'Community migration heuristic',
        'input': 'Complete V4.5 tag string',
        'output': 'Normalized V5 tag string',
        'run': 'Randomize repair',
        'copy': 'Copy result',
        'reset': 'Restore defaults',
        'empty': 'Paste an artist string first.',
        'none': 'No valid tags were detected. Check the input and separators.',
        'done':
            'Created {candidates} candidates; each repairs {count} tags ({artists} artist, {quality} quality, {other} other).',
        'copied': 'Result copied.',
      };
    case 'ja-JP':
      return {
        'title': 'V4.5 画家列修復',
        'subtitle':
            '画家・品質・その他の Tag を自動判定し、すべての有効 Tag を旧値の 1/3～1/2 に個別調整して V5 数値形式へ統一します。',
        'basis': 'ユーザー検証と制限',
        'note':
            'NovelAI は V4.5→V5 の換算式を公開していません。1/3～1/2 の目安は主に旧画家ウェイト向けですが、本ツールでは文字列全体の移行のため品質・スタイル・その他にも適用します。公式標準ではありません。',
        'safe':
            '明示的な artist: と確認済みの画家名だけを画家として分類します。品質・スタイル・年・ネガティブ・内容 Tag に artist: は追加せず、重複区切りと孤立 :: は整理します。',
        'strategy': 'コミュニティ移行ヒューリスティック',
        'input': 'V4.5 完全 Tag 列',
        'output': '正規化 V5 Tag 列',
        'run': 'ランダム修復',
        'copy': '結果をコピー',
        'reset': '初期値に戻す',
        'empty': '画家列を貼り付けてください。',
        'none': '有効な Tag を認識できませんでした。入力と区切りを確認してください。',
        'done':
            '{candidates} 組の候補を作成し、各組で {count} 個の Tag（画家 {artists}、品質 {quality}、その他 {other}）を修復しました。',
        'copied': 'コピーしました。',
      };
    case 'ko-KR':
      return {
        'title': 'V4.5 작가 문자열 복구',
        'subtitle':
            '작가·품질·기타 Tag를 자동 구분하고 모든 유효 Tag를 기존 가중치의 1/3~1/2로 개별 조정해 V5 형식으로 통일합니다.',
        'basis': '사용자 검증과 한계',
        'note':
            'NovelAI는 V4.5→V5 환산식을 공개하지 않았습니다. 1/3~1/2 기준은 주로 기존 작가 가중치에 관한 것이며 이 도구는 전체 문자열 이전을 위해 품질·스타일·기타 Tag에도 적용합니다. 공식 표준은 아닙니다.',
        'safe':
            '명시적 artist:와 검토된 작가명만 작가로 분류합니다. 품질·스타일·연도·네거티브·내용 Tag에는 artist:를 붙이지 않으며 중복 구분자와 고립된 ::를 정리합니다.',
        'strategy': '커뮤니티 마이그레이션 휴리스틱',
        'input': 'V4.5 전체 Tag 문자열',
        'output': '정규화 V5 Tag 문자열',
        'run': '무작위 가중치 복구',
        'copy': '결과 복사',
        'reset': '기본값 복원',
        'empty': '작가 문자열을 먼저 붙여넣으세요.',
        'none': '유효한 Tag를 찾지 못했습니다. 입력과 구분자를 확인하세요.',
        'done':
            '후보 {candidates}개를 만들고 각 후보에서 Tag {count}개(작가 {artists}, 품질 {quality}, 기타 {other})를 복구했습니다.',
        'copied': '복사했습니다.',
      };
    default:
      return {
        'title': 'V4.5 画师串修复器',
        'subtitle':
            '自动识别画师、质量词和其他 Tag；整串每个有效 Tag 都独立压到原权重的 1/3–1/2，并统一为规范 V5 数值格式。',
        'basis': '用户实测结论与限制',
        'note':
            'NovelAI 官方没有公布 V4.5→V5 换算公式。社区的 1/3–1/2 建议主要来自旧画师权重迁移；按本工具设定，质量词、风格词和其他有效 Tag 也会套用同一范围。结果仅是试验起点，不是官方标准。',
        'safe':
            '显式 artist: 标签和已确认的无前缀画师名会识别为画师；质量、风格、年份、负面和内容 Tag 不会被加上 artist:。重复分隔符和孤立 :: 会自动清理。',
        'strategy': '社区迁移策略',
        'input': 'V4.5 完整 Tag 串',
        'output': '规范 V5 Tag 串',
        'run': '随机修复画师权重',
        'copy': '复制结果',
        'reset': '恢复默认',
        'empty': '请先粘贴画师串。',
        'none': '没有识别到有效 Tag；请检查输入和分隔符。',
        'done':
            '已生成 {candidates} 组候选；每组修复 {count} 个 Tag（画师 {artists}、质量词 {quality}、其他 {other}）。',
        'copied': '已复制结果。',
      };
  }
}

Map<String, String> _drawText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return {
        'title': '輸入畫師串抽卡',
        'hint':
            '沿用修復器的辨識與規範流程：每個有效 Tag 先按舊權重的 1/3～1/2 遷移，再限制於自訂最終範圍；不刪除任何 Tag。',
        'settings': '抽卡設定',
        'input': '完整 Tag 串',
        'inputHint': '例如：xiaoluo_xl, 1.2::artist:pottsness ::',
        'normalizeHint':
            '自動辨識畫師、品質詞與其他 Tag；只有明確 artist: 與已確認畫師名會取得 artist: 前綴。',
        'inputEmpty': '請先貼上畫師串。',
        'none': '未識別到有效 Tag；請檢查輸入與分隔符。',
        'min': '最低權重',
        'max': '最高權重',
        'count': '候選組數',
        'base': '正面提示詞（固定內容）',
        'fixed': '全批固定 Seed',
        'random': '每張隨機 Seed',
        'seed': 'Seed',
        'randomSeed': '隨機 Seed',
        'draw': '重新抽權重',
        'generate': '生成這一批',
        'stop': '停止',
        'params': '沿用生成頁目前參數；非 V5 模型會自動改用 V5 Full。',
        'all':
            '已識別 {count} 個有效 Tag（畫師 {artists}、品質詞 {quality}、其他 {other}）；每組完整保留。',
        'results': '本批候選',
        'favorites': '收藏夾',
        'shared': '本工具收藏獨立保存，不與另外兩種畫師工具共用',
        'empty': '輸入畫師串後即可抽取候選。',
        'emptyFavorite': '收藏庫暫無內容。',
        'needPrompt': '請填寫固定內容提示詞。',
        'needDraw': '請先抽取候選。',
        'running': '生成中 {done}/{total}',
        'complete': '生成完成，可收藏喜歡的結果。',
        'pending': '等待',
        'generating': '生成中',
        'done': '完成',
        'failed': '失敗',
        'favorite': '收藏',
        'saved': '已收藏',
        'saving': '儲存中',
        'remove': '移除',
        'apply': '套用到生成',
        'retry': '重試',
        'removed': '已移除收藏和本機圖片。',
        'preview': '雙擊或點擊按鈕預覽大圖',
      };
    case 'en-US':
      return {
        'title': 'Artist-string Weight Draw',
        'hint':
            'Uses the repair parser and normalization: every valid tag is first migrated to one third–one half of its old weight, then constrained to the custom final bounds; no tags are removed.',
        'settings': 'Draw settings',
        'input': 'Complete tag string',
        'inputHint': 'Example: xiaoluo_xl, 1.2::artist:pottsness ::',
        'normalizeHint':
            'Artist, quality, and other tags are classified automatically; only explicit or reviewed artists gain artist:.',
        'inputEmpty': 'Paste an artist string first.',
        'none': 'No valid tags were detected. Check the input and separators.',
        'min': 'Minimum weight',
        'max': 'Maximum weight',
        'count': 'Candidate sets',
        'base': 'Positive prompt (fixed content)',
        'fixed': 'Fixed seed for batch',
        'random': 'Random seed per image',
        'seed': 'Seed',
        'randomSeed': 'Random seed',
        'draw': 'Reroll weights',
        'generate': 'Generate batch',
        'stop': 'Stop',
        'params':
            'Uses current Generate settings; non-V5 models switch to V5 Full.',
        'all':
            '{count} valid tags detected ({artists} artist, {quality} quality, {other} other); every set retains all of them.',
        'results': 'Candidates',
        'favorites': 'Favorites',
        'shared':
            'This tool has its own favorites; the other two artist tools are separate',
        'empty': 'Paste an artist string, then draw candidates.',
        'emptyFavorite': 'No favorites yet.',
        'needPrompt': 'Enter a fixed content prompt.',
        'needDraw': 'Draw candidates first.',
        'running': 'Generating {done}/{total}',
        'complete': 'Generation complete. Save the results you like.',
        'pending': 'Pending',
        'generating': 'Generating',
        'done': 'Done',
        'failed': 'Failed',
        'favorite': 'Favorite',
        'saved': 'Saved',
        'saving': 'Saving',
        'remove': 'Remove',
        'apply': 'Apply',
        'retry': 'Retry',
        'removed': 'Favorite and local image removed.',
        'preview': 'Double-tap or use the button to preview',
      };
    case 'ja-JP':
      return {
        'title': '画家列ウェイト抽選',
        'hint':
            '修復器と同じ判定・正規化を使い、各 Tag を旧ウェイトの 1/3～1/2 に移行してから指定範囲内に収めます。Tag は削除しません。',
        'settings': '抽選設定',
        'input': '完全な Tag 列',
        'inputHint': '例：xiaoluo_xl, 1.2::artist:pottsness ::',
        'normalizeHint': '画家・品質・その他を自動分類し、明示的または確認済みの画家だけに artist: を付けます。',
        'inputEmpty': '画家列を貼り付けてください。',
        'none': '有効な Tag を認識できませんでした。入力と区切りを確認してください。',
        'min': '最小',
        'max': '最大',
        'count': '候補セット数',
        'base': 'ポジティブプロンプト（固定内容）',
        'fixed': '全候補 Seed 固定',
        'random': '画像ごと Seed 抽選',
        'seed': 'Seed',
        'randomSeed': 'Seed を抽選',
        'draw': 'ウェイト再抽選',
        'generate': '一括生成',
        'stop': '停止',
        'params': '生成画面の現在設定を使用し、非 V5 は V5 Full に切り替えます。',
        'all':
            '{count} 個の有効 Tag（画家 {artists}、品質 {quality}、その他 {other}）を各組に保持します。',
        'results': '候補',
        'favorites': 'お気に入り',
        'shared': 'このツール専用のお気に入りです。他の2つとは共有しません',
        'empty': '画家列を入力して候補を抽選できます。',
        'emptyFavorite': 'お気に入りはありません。',
        'needPrompt': '固定内容を入力してください。',
        'needDraw': '先に候補を抽選してください。',
        'running': '生成中 {done}/{total}',
        'complete': '生成完了。好きな結果を保存できます。',
        'pending': '待機',
        'generating': '生成中',
        'done': '完了',
        'failed': '失敗',
        'favorite': '保存',
        'saved': '保存済み',
        'saving': '保存中',
        'remove': '削除',
        'apply': '生成へ適用',
        'retry': '再試行',
        'removed': 'お気に入りと画像を削除しました。',
        'preview': 'ダブルタップまたはボタンで拡大',
      };
    case 'ko-KR':
      return {
        'title': '작가 문자열 가중치 뽑기',
        'hint':
            '복구 도구와 같은 판별·정규화를 사용해 각 Tag를 기존 가중치의 1/3~1/2로 이전한 뒤 지정 범위로 제한하며 Tag는 삭제하지 않습니다.',
        'settings': '추첨 설정',
        'input': '전체 Tag 문자열',
        'inputHint': '예: xiaoluo_xl, 1.2::artist:pottsness ::',
        'normalizeHint': '작가·품질·기타를 자동 분류하고 명시적 또는 검토된 작가에만 artist:를 붙입니다.',
        'inputEmpty': '작가 문자열을 붙여넣으세요.',
        'none': '유효한 Tag를 찾지 못했습니다. 입력과 구분자를 확인하세요.',
        'min': '최저',
        'max': '최고',
        'count': '후보 세트 수',
        'base': '긍정 프롬프트 (고정 내용)',
        'fixed': '전체 Seed 고정',
        'random': '이미지별 Seed 무작위',
        'seed': 'Seed',
        'randomSeed': 'Seed 무작위',
        'draw': '가중치 다시 뽑기',
        'generate': '일괄 생성',
        'stop': '중지',
        'params': '생성 화면의 현재 설정을 사용하며 비 V5 모델은 V5 Full로 전환합니다.',
        'all':
            '유효 Tag {count}개(작가 {artists}, 품질 {quality}, 기타 {other})를 모든 세트에 유지합니다.',
        'results': '후보',
        'favorites': '즐겨찾기',
        'shared': '이 도구 전용 즐겨찾기이며 다른 두 도구와 공유하지 않습니다',
        'empty': '작가 문자열을 입력한 뒤 후보를 뽑을 수 있습니다.',
        'emptyFavorite': '즐겨찾기가 없습니다.',
        'needPrompt': '고정 내용을 입력하세요.',
        'needDraw': '먼저 후보를 뽑으세요.',
        'running': '생성 중 {done}/{total}',
        'complete': '생성 완료. 마음에 드는 결과를 저장하세요.',
        'pending': '대기',
        'generating': '생성 중',
        'done': '완료',
        'failed': '실패',
        'favorite': '저장',
        'saved': '저장됨',
        'saving': '저장 중',
        'remove': '삭제',
        'apply': '생성에 적용',
        'retry': '재시도',
        'removed': '즐겨찾기와 이미지를 삭제했습니다.',
        'preview': '두 번 탭하거나 버튼으로 크게 보기',
      };
    default:
      return {
        'title': '输入画师串抽卡',
        'hint':
            '沿用修复器的识别与规范流程：每个有效 Tag 先按旧权重的 1/3～1/2 迁移，再限制在自定义最终范围内；不删除任何 Tag。',
        'settings': '抽卡设置',
        'input': '完整 Tag 串',
        'inputHint': '例如：xiaoluo_xl, 1.2::artist:pottsness ::',
        'normalizeHint':
            '自动识别画师、质量词与其他 Tag；只有显式 artist: 和已确认画师名会获得 artist: 前缀。',
        'inputEmpty': '请先粘贴画师串。',
        'none': '没有识别到有效 Tag；请检查输入和分隔符。',
        'min': '最低权重',
        'max': '最高权重',
        'count': '候选组数',
        'base': '正面提示词（固定内容）',
        'fixed': '全批固定 Seed',
        'random': '每张随机 Seed',
        'seed': 'Seed',
        'randomSeed': '随机 Seed',
        'draw': '重新抽权重',
        'generate': '生成这一批',
        'stop': '停止',
        'params': '生图沿用生成页当前参数；非 V5 模型会自动改用 V5 Full。',
        'all':
            '已识别 {count} 个有效 Tag（画师 {artists}、质量词 {quality}、其他 {other}）；每组完整保留。',
        'results': '本批候选',
        'favorites': '收藏夹',
        'shared': '本工具收藏独立保存，不与另外两种画师工具共用',
        'empty': '输入画师串后即可抽取候选。',
        'emptyFavorite': '收藏库暂无内容。',
        'needPrompt': '请填写固定内容提示词。',
        'needDraw': '请先抽取候选。',
        'running': '正在生成 {done}/{total}',
        'complete': '生成完成；可收藏喜欢的结果。',
        'pending': '等待',
        'generating': '生成中',
        'done': '完成',
        'failed': '失败',
        'favorite': '收藏',
        'saved': '已收藏',
        'saving': '保存中',
        'remove': '移除',
        'apply': '应用到生成',
        'retry': '重试',
        'removed': '已移除收藏和本地图片。',
        'preview': '双击或点击按钮预览大图',
      };
  }
}

Map<String, String> _drawParamText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return {
        'title': 'NovelAI 生成參數',
        'hint': '參數只用於本工具批次生圖，可自行修改，也可從生成頁同步或恢復初始參數。',
        'sync': '從生成頁同步',
        'reset': '恢復初始參數',
        'model': '模型',
        'size': '圖片尺寸',
        'width': '寬度',
        'height': '高度',
        'negative': '負面提示詞',
        'steps': '步數',
        'sampler': '採樣器',
        'noise': '噪聲計畫',
        'uc': '負面預設',
      };
    case 'en-US':
      return {
        'title': 'NovelAI generation settings',
        'hint':
            'These independent settings apply only to this batch. Sync from Generate or restore app defaults at any time.',
        'sync': 'Sync from Generate',
        'reset': 'Restore defaults',
        'model': 'Model',
        'size': 'Image size',
        'width': 'Width',
        'height': 'Height',
        'negative': 'Negative prompt',
        'steps': 'Steps',
        'sampler': 'Sampler',
        'noise': 'Noise schedule',
        'uc': 'UC preset',
      };
    case 'ja-JP':
      return {
        'title': 'NovelAI 生成設定',
        'hint': 'このツールの一括生成だけに使う独立設定です。生成画面との同期または初期化ができます。',
        'sync': '生成画面から同期',
        'reset': '初期設定に戻す',
        'model': 'モデル',
        'size': '画像サイズ',
        'width': '幅',
        'height': '高さ',
        'negative': 'ネガティブプロンプト',
        'steps': 'ステップ',
        'sampler': 'サンプラー',
        'noise': 'ノイズスケジュール',
        'uc': 'UC プリセット',
      };
    case 'ko-KR':
      return {
        'title': 'NovelAI 생성 설정',
        'hint': '이 도구의 일괄 생성에만 적용되는 독립 설정입니다. 생성 화면 동기화 또는 초기화가 가능합니다.',
        'sync': '생성 화면에서 동기화',
        'reset': '초기값 복원',
        'model': '모델',
        'size': '이미지 크기',
        'width': '너비',
        'height': '높이',
        'negative': '네거티브 프롬프트',
        'steps': '스텝',
        'sampler': '샘플러',
        'noise': '노이즈 스케줄',
        'uc': 'UC 프리셋',
      };
    default:
      return {
        'title': 'NovelAI 生成参数',
        'hint': '参数仅用于本工具批量生图，可自行修改；也可从生成页同步或恢复软件初始参数。',
        'sync': '从生成页同步',
        'reset': '恢复初始参数',
        'model': '模型',
        'size': '图片尺寸',
        'width': '宽度',
        'height': '高度',
        'negative': '负面提示词',
        'steps': '步数',
        'sampler': '采样器',
        'noise': '噪声计划',
        'uc': '负面预设',
      };
  }
}

enum V5ArtistToolMode { repair, draw }

class V5ArtistWeightRepairScreen extends StatefulWidget {
  final VoidCallback onBack;
  final V5ArtistToolMode mode;

  const V5ArtistWeightRepairScreen({
    super.key,
    required this.onBack,
    this.mode = V5ArtistToolMode.repair,
  });

  @override
  State<V5ArtistWeightRepairScreen> createState() =>
      _V5ArtistWeightRepairScreenState();
}

class _V5ArtistWeightRepairScreenState
    extends State<V5ArtistWeightRepairScreen> {
  static const _repairFavoritesKey = 'v5_artist_repair_v1_favorites';
  static const _drawFavoritesKey = 'v5_artist_draw_v1_favorites';
  static const _repairPrefsPrefix = 'v5_artist_repair_v1_';
  static const _drawPrefsPrefix = 'v5_artist_draw_v1_';
  final _input = TextEditingController();
  final _output = TextEditingController();
  final _drawInput = TextEditingController();
  final _drawTagSearch = TextEditingController();
  final _basePrompt = TextEditingController();
  final _minWeight = TextEditingController(text: '0.2');
  final _maxWeight = TextEditingController(text: '1.2');
  final _candidateCount = TextEditingController(text: '8');
  final _seed = TextEditingController(text: '246813579');
  final _width = TextEditingController(text: '832');
  final _height = TextEditingController(text: '1216');
  final _negativePrompt = TextEditingController();
  GenerateParams _generationParams = GenerateParams();
  String _message = '';
  bool _fixedSeed = true;
  bool _running = false;
  bool _cancelled = false;
  bool _showFavorites = false;
  WeightControlMode _weightControlMode = WeightControlMode.novice;
  WeightDistributionConfig _weightDistribution =
      const WeightDistributionConfig();
  final List<_RepairDrawResult> _results = [];
  final List<_RepairDrawResult> _favorites = [];
  final Set<String> _drawStyleTags = <String>{};
  String _drawTagCategory = 'quality';

  String get _prefsPrefix => widget.mode == V5ArtistToolMode.draw
      ? _drawPrefsPrefix
      : _repairPrefsPrefix;
  String get _favoritesKey => widget.mode == V5ArtistToolMode.draw
      ? _drawFavoritesKey
      : _repairFavoritesKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadToolState());
  }

  Future<void> _loadToolState() async {
    if (!mounted) return;
    final app = context.read<AppState>();
    final prefs = await SharedPreferences.getInstance();
    final prefix = _prefsPrefix;
    _basePrompt.text =
        prefs.getString('${prefix}positivePrompt') ?? app.params.positivePrompt;
    final savedInput = prefs.getString('${prefix}artistInput') ?? '';
    if (widget.mode == V5ArtistToolMode.draw) {
      _drawInput.text = savedInput;
    } else {
      _input.text = savedInput;
    }
    _minWeight.text = '${prefs.getDouble('${prefix}minWeight') ?? .2}';
    _maxWeight.text = '${prefs.getDouble('${prefix}maxWeight') ?? 1.2}';
    _candidateCount.text = '${prefs.getInt('${prefix}candidateCount') ?? 8}';
    _seed.text = '${prefs.getInt('${prefix}seed') ?? 246813579}';
    _fixedSeed = prefs.getBool('${prefix}fixedSeed') ?? true;
    _weightControlMode =
        prefs.getString('${prefix}weightControlMode') == 'advanced'
            ? WeightControlMode.advanced
            : WeightControlMode.novice;
    _weightDistribution = WeightDistributionConfig(
      mode: prefs.getDouble('${prefix}weightMode') ?? .8,
      leftDispersion: prefs.getDouble('${prefix}weightLeftDispersion') ?? .4,
      rightDispersion: prefs.getDouble('${prefix}weightRightDispersion') ?? .4,
      softBalance: prefs.getDouble('${prefix}weightSoftBalance') ?? 0,
    );
    _drawStyleTags
      ..clear()
      ..addAll(prefs.getStringList('${prefix}styleTags') ?? const <String>[]);
    try {
      final raw = prefs.getString('${prefix}generationParams');
      _generationParams = raw == null
          ? _prepareGenerationParams(app.params)
          : GenerateParams.fromJson(
              Map<String, dynamic>.from(jsonDecode(raw) as Map),
            );
    } catch (_) {
      _generationParams = _prepareGenerationParams(app.params);
    }
    _generationParams
      ..positivePrompt = ''
      ..stylePrompt = '';
    _syncGenerationControllers();
    try {
      final decoded = jsonDecode(
        prefs.getString(_favoritesKey) ?? '[]',
      ) as List;
      _favorites
        ..clear()
        ..addAll(
            decoded.whereType<Map>().map((item) => _RepairDrawResult.fromJson(
                  Map<String, dynamic>.from(item),
                )));
    } catch (_) {
      _favorites.clear();
    }
    if (mounted) setState(() {});
  }

  GenerateParams _prepareGenerationParams(GenerateParams source) {
    final next = source.copy();
    if (!next.isV5) next.model = 'nai-diffusion-5-full';
    next
      ..positivePrompt = ''
      ..stylePrompt = '';
    return next.normalized();
  }

  void _syncGenerationControllers() {
    _width.text = '${_generationParams.width}';
    _height.text = '${_generationParams.height}';
    _negativePrompt.text = _generationParams.negativePrompt;
  }

  Future<void> _saveDrawState() async {
    final prefs = await SharedPreferences.getInstance();
    final prefix = _prefsPrefix;
    await prefs.setString('${prefix}positivePrompt', _basePrompt.text);
    await prefs.setString(
      '${prefix}artistInput',
      widget.mode == V5ArtistToolMode.draw ? _drawInput.text : _input.text,
    );
    await prefs.setDouble(
        '${prefix}minWeight', double.tryParse(_minWeight.text) ?? .2);
    await prefs.setDouble(
        '${prefix}maxWeight', double.tryParse(_maxWeight.text) ?? 1.2);
    await prefs.setInt('${prefix}candidateCount',
        (int.tryParse(_candidateCount.text) ?? 8).clamp(1, 100).toInt());
    await prefs.setInt('${prefix}seed',
        (int.tryParse(_seed.text) ?? 246813579).clamp(1, 0x7fffffff).toInt());
    await prefs.setBool('${prefix}fixedSeed', _fixedSeed);
    await prefs.setString(
        '${prefix}weightControlMode',
        _weightControlMode == WeightControlMode.advanced
            ? 'advanced'
            : 'novice');
    await prefs.setDouble('${prefix}weightMode', _weightDistribution.mode);
    await prefs.setDouble(
        '${prefix}weightLeftDispersion', _weightDistribution.leftDispersion);
    await prefs.setDouble(
        '${prefix}weightRightDispersion', _weightDistribution.rightDispersion);
    await prefs.setDouble(
        '${prefix}weightSoftBalance', _weightDistribution.softBalance);
    await prefs.setStringList(
        '${prefix}styleTags', _drawStyleTags.toList(growable: false));
    _generationParams.negativePrompt = _negativePrompt.text;
    await prefs.setString(
        '${prefix}generationParams', jsonEncode(_generationParams.toJson()));
  }

  void _commitDimension(TextEditingController controller, bool width) {
    final fallback = width ? _generationParams.width : _generationParams.height;
    final value = int.tryParse(controller.text) ?? fallback;
    final snapped = snapNaiDimensionWithinArea(
      value,
      width ? _generationParams.height : _generationParams.width,
      fallback,
    );
    setState(() {
      controller.text = '$snapped';
      if (width) {
        _generationParams.width = snapped;
      } else {
        _generationParams.height = snapped;
      }
    });
    _saveDrawState();
  }

  Future<void> _saveFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _favoritesKey,
      jsonEncode(_favorites.map((item) => item.toJson()).toList()),
    );
  }

  @override
  void dispose() {
    _input.dispose();
    _output.dispose();
    _drawInput.dispose();
    _drawTagSearch.dispose();
    _basePrompt.dispose();
    _minWeight.dispose();
    _maxWeight.dispose();
    _candidateCount.dispose();
    _seed.dispose();
    _width.dispose();
    _height.dispose();
    _negativePrompt.dispose();
    super.dispose();
  }

  Future<void> _run(Map<String, String> text) async {
    if (_input.text.trim().isEmpty) {
      setState(() {
        _output.clear();
        _message = text['empty']!;
      });
      return;
    }
    final normalized = normalizeV45ArtistSyntax(_input.text);
    final recipes = repairV45ArtistCandidatesForV5(
      input: _input.text,
      count: (int.tryParse(_candidateCount.text) ?? 8).clamp(1, 100),
      drawSeed: _freshSeed(),
      weightDistribution: _weightControlMode == WeightControlMode.advanced
          ? _weightDistribution
          : null,
    );
    if (recipes.isEmpty) {
      setState(() {
        _output.clear();
        _message = text['none']!;
      });
      return;
    }
    await _installRecipes(recipes);
    if (!mounted) return;
    setState(() {
      _output.text = recipes.first.prompt;
      _message = text['done']!
          .replaceAll('{candidates}', recipes.length.toString())
          .replaceAll('{count}', normalized.totalAdjusted.toString())
          .replaceAll('{artists}', normalized.artistTagCount.toString())
          .replaceAll('{quality}', normalized.qualityTagCount.toString())
          .replaceAll('{other}', normalized.otherTagCount.toString());
    });
    _saveDrawState();
  }

  void _reset() {
    setState(() {
      _minWeight.text = '0.2';
      _maxWeight.text = '1.2';
      _candidateCount.text = '8';
      _seed.text = '246813579';
      _fixedSeed = true;
      _weightControlMode = WeightControlMode.novice;
      _weightDistribution = const WeightDistributionConfig();
      _message = '';
    });
    _saveDrawState();
  }

  int _freshSeed() => Random.secure().nextInt(0x7fffffff) + 1;

  Future<void> _clearTemporaryResults() async {
    final app = context.read<AppState>();
    final temporary = _results
        .where((item) => !item.liked && item.image != null)
        .map((item) => item.image!)
        .toList();
    _results.clear();
    for (final image in temporary) {
      await app.deleteArtistLabTemporary(image).catchError((_) {});
    }
  }

  Future<void> _installRecipes(List<ArtistRecipe> recipes) async {
    await _clearTemporaryResults();
    if (!mounted) return;
    final model = _generationParams.model;
    final fixed =
        (int.tryParse(_seed.text) ?? 246813579).clamp(1, 0x7fffffff).toInt();
    setState(() {
      _results.addAll(List.generate(
        recipes.length,
        (index) => _RepairDrawResult(
          recipes[index],
          sequence: index + 1,
          seed: _fixedSeed ? fixed : _freshSeed(),
          generationModel: model,
        ),
      ));
      _showFavorites = false;
    });
  }

  Future<void> _draw(Map<String, String> text) async {
    if (_drawInput.text.trim().isEmpty) {
      setState(() => _message = text['inputEmpty']!);
      return;
    }
    final source = <String>[
      _drawInput.text.trim(),
      ..._drawStyleTags,
    ].where((value) => value.isNotEmpty).join(', ');
    final normalized = normalizeV45ArtistSyntax(source);
    final recipes = drawAllV5ArtistWeights(
      input: normalized.output,
      count: (int.tryParse(_candidateCount.text) ?? 8).clamp(1, 100),
      minWeight: double.tryParse(_minWeight.text) ?? .2,
      maxWeight: double.tryParse(_maxWeight.text) ?? 1.2,
      drawSeed: _freshSeed(),
      weightDistribution: _weightControlMode == WeightControlMode.advanced
          ? _weightDistribution
          : null,
    );
    if (recipes.isEmpty) {
      setState(() => _message = text['none']!);
      return;
    }
    await _installRecipes(recipes);
    if (!mounted) return;
    setState(() {
      _message = text['all']!
          .replaceAll('{count}', normalized.totalAdjusted.toString())
          .replaceAll('{artists}', normalized.artistTagCount.toString())
          .replaceAll('{quality}', normalized.qualityTagCount.toString())
          .replaceAll('{other}', normalized.otherTagCount.toString());
    });
    _saveDrawState();
  }

  Widget _drawStyleTagLibrary(AppState app) {
    final language = normalizeAppLocaleCode(app.settings.language);
    final category = randomCustomTagLibrary.firstWhere(
      (item) => item.id == _drawTagCategory,
      orElse: () => randomCustomTagLibrary.first,
    );
    final query = _drawTagSearch.text.trim().toLowerCase();
    final entries = category.tags.where((entry) {
      if (query.isEmpty) return true;
      return entry.tag.toLowerCase().contains(query) ||
          entry.labels.values
              .any((label) => label.toLowerCase().contains(query));
    }).toList(growable: false);
    final chinese = language == 'zh-CN' || language == 'zh-TW';
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        initiallyExpanded: false,
        leading: const Icon(Icons.style_outlined),
        title: Text(chinese ? '画风 Tag 库' : 'Style Tag library'),
        subtitle: Text(chinese
            ? '已选 ${_drawStyleTags.length} 个；每个候选都会加入并随机赋权'
            : '${_drawStyleTags.length} selected; added to every draw with random weights'),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        children: [
          TextField(
            controller: _drawTagSearch,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              suffixIcon: query.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        _drawTagSearch.clear();
                        setState(() {});
                      },
                      icon: const Icon(Icons.clear),
                    ),
              hintText: chinese ? '搜索 Tag 或含义' : 'Search Tag or meaning',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 42,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: randomCustomTagLibrary.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final item = randomCustomTagLibrary[index];
                return ChoiceChip(
                  selected: item.id == _drawTagCategory,
                  label: Text('${item.label(language)} ${item.tags.length}'),
                  onSelected: (_) => setState(() => _drawTagCategory = item.id),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 280,
            child: entries.isEmpty
                ? Center(
                    child: Text(chinese ? '没有匹配的 Tag' : 'No matching tags'))
                : ListView.builder(
                    primary: false,
                    itemCount: entries.length,
                    itemExtent: 54,
                    itemBuilder: (context, index) {
                      final entry = entries[index];
                      final selected = _drawStyleTags.contains(entry.tag);
                      return CheckboxListTile(
                        dense: true,
                        value: selected,
                        controlAffinity: ListTileControlAffinity.leading,
                        title: Text(entry.tag,
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(entry.label(language),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        onChanged: (_) {
                          setState(() {
                            if (selected) {
                              _drawStyleTags.remove(entry.tag);
                            } else {
                              _drawStyleTags.add(entry.tag);
                            }
                          });
                          _saveDrawState();
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _generateOne(_RepairDrawResult result) async {
    final app = context.read<AppState>();
    final fixed = _generationParams.copy()
      ..positivePrompt = _basePrompt.text.trim()
      ..negativePrompt = _negativePrompt.text
      ..stylePrompt = result.recipe.prompt
      ..seedMode = 'fixed'
      ..seed = result.seed;
    setState(() {
      result
        ..status = 'generating'
        ..error = null
        ..generationModel = fixed.model;
    });
    try {
      final image = await app.generateArtistLabTemporary(
        panelParams: fixed,
        panelExtras: GenerateExtras(),
      );
      if (!mounted) return;
      setState(() {
        result
          ..image = image
          ..status = 'done'
          ..generationModel =
              image.model.isNotEmpty ? image.model : fixed.model;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        result
          ..status = 'failed'
          ..error = error.toString();
      });
    }
  }

  Future<void> _generate(Map<String, String> text) async {
    if (_running) return;
    if (_results.isEmpty) {
      setState(() => _message = text['needDraw']!);
      return;
    }
    if (_basePrompt.text.trim().isEmpty) {
      setState(() => _message = text['needPrompt']!);
      return;
    }
    setState(() {
      _running = true;
      _cancelled = false;
    });
    for (final result in _results) {
      if (_cancelled) break;
      await _generateOne(result);
    }
    if (!mounted) return;
    setState(() {
      _running = false;
      _message = _cancelled ? text['stop']! : text['complete']!;
    });
  }

  void _stop() {
    _cancelled = true;
    context.read<AppState>().cancelGeneration();
  }

  Future<void> _retry(_RepairDrawResult result) async {
    if (_running) return;
    setState(() => _running = true);
    await _generateOne(result);
    if (mounted) setState(() => _running = false);
  }

  Future<void> _favorite(_RepairDrawResult result) async {
    if (result.image == null || result.liked || result.saving) return;
    final app = context.read<AppState>();
    setState(() => result.saving = true);
    try {
      result.image = await app.saveArtistLabFavorite(result.image!);
      result
        ..liked = true
        ..saving = false
        ..status = 'done';
      _favorites.removeWhere((item) => item.recipe.id == result.recipe.id);
      _favorites.insert(0, result);
      await _saveFavorites();
    } catch (error) {
      result
        ..saving = false
        ..error = error.toString();
    }
    if (mounted) setState(() {});
  }

  Future<void> _removeFavorite(
    _RepairDrawResult result,
    Map<String, String> text,
  ) async {
    if (result.image == null) return;
    await context.read<AppState>().deleteHistory(result.image!.id);
    _favorites.removeWhere((item) => item.recipe.id == result.recipe.id);
    _results.removeWhere((item) => item.recipe.id == result.recipe.id);
    await _saveFavorites();
    if (mounted) setState(() => _message = text['removed']!);
  }

  void _apply(_RepairDrawResult result) {
    final app = context.read<AppState>();
    final value = _generationParams.copy()
      ..model = result.generationModel
      ..positivePrompt = _basePrompt.text.trim()
      ..negativePrompt = _negativePrompt.text
      ..stylePrompt = result.recipe.prompt
      ..seedMode = 'fixed'
      ..seed = result.seed;
    app.setParam((target) {
      target
        ..model = value.model
        ..stylePrompt = value.stylePrompt
        ..positivePrompt = value.positivePrompt
        ..negativePrompt = value.negativePrompt
        ..width = value.width
        ..height = value.height
        ..steps = value.steps
        ..cfgScale = value.cfgScale
        ..cfgRescale = value.cfgRescale
        ..sampler = value.sampler
        ..noiseSchedule = value.noiseSchedule
        ..seed = value.seed
        ..seedMode = value.seedMode
        ..ucPreset = value.ucPreset
        ..qualityPreset = value.qualityPreset
        ..qualityToggle = value.qualityToggle
        ..transparentBackground = value.transparentBackground
        ..smea = value.smea
        ..smeaDyn = value.smeaDyn
        ..variety = value.variety
        ..fileNamePrefix = value.fileNamePrefix;
    });
  }

  Future<void> _previewResult(
    _RepairDrawResult result,
    Map<String, String> text,
  ) async {
    final image = result.image;
    if (image == null) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: .5,
                  maxScale: 6,
                  child: Center(
                    child: Image.file(
                      File(image.filePath),
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.broken_image_outlined, size: 48),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                top: 8,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${result.generationModel} · ${image.width}×${image.height}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip:
                          MaterialLocalizations.of(context).closeButtonTooltip,
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _drawResultCard(
    _RepairDrawResult result,
    Map<String, String> text, {
    bool favorite = false,
  }) {
    final width = result.image?.width ?? _generationParams.width;
    final height = result.image?.height ?? _generationParams.height;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            dense: true,
            title: Text('#${result.sequence.toString().padLeft(2, '0')}'),
            subtitle: Text('${result.generationModel} · $width×$height'),
            trailing: Text(favorite || result.liked
                ? text['saved']!
                : text[result.status] ?? result.status),
          ),
          AspectRatio(
            aspectRatio: width / max(1, height),
            child: result.image == null
                ? Center(
                    child: result.status == 'generating'
                        ? const CircularProgressIndicator()
                        : const Icon(Icons.image_outlined, size: 42),
                  )
                : GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onDoubleTap: () => _previewResult(result, text),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.file(
                          File(result.image!.filePath),
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            size: 42,
                          ),
                        ),
                        Positioned(
                          right: 10,
                          bottom: 10,
                          child: IconButton.filledTonal(
                            tooltip: text['preview'],
                            onPressed: () => _previewResult(result, text),
                            icon: const Icon(Icons.zoom_in),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: SelectableText(
              result.recipe.prompt,
              maxLines: 5,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          if (result.error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                result.error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          OverflowBar(
            alignment: MainAxisAlignment.end,
            spacing: 8,
            children: [
              if (favorite)
                TextButton.icon(
                  onPressed: () => _removeFavorite(result, text),
                  icon: const Icon(Icons.delete_outline),
                  label: Text(text['remove']!),
                )
              else if (result.status == 'failed')
                TextButton.icon(
                  onPressed: _running ? null : () => _retry(result),
                  icon: const Icon(Icons.refresh),
                  label: Text(text['retry']!),
                )
              else
                TextButton.icon(
                  onPressed:
                      result.status == 'done' && !result.liked && !result.saving
                          ? () => _favorite(result)
                          : null,
                  icon: Icon(
                      result.liked ? Icons.favorite : Icons.favorite_border),
                  label: Text(result.saving
                      ? text['saving']!
                      : result.liked
                          ? text['saved']!
                          : text['favorite']!),
                ),
              FilledButton(
                onPressed:
                    result.status == 'done' ? () => _apply(result) : null,
                child: Text(text['apply']!),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _numberField(
    TextEditingController controller,
    String label, {
    bool decimal = false,
    double width = 145,
  }) {
    return SizedBox(
      width: width,
      child: TextField(
        controller: controller,
        keyboardType: TextInputType.numberWithOptions(decimal: decimal),
        decoration: InputDecoration(
          labelText: label,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
          border: const OutlineInputBorder(),
        ),
        onEditingComplete: _saveDrawState,
        onTapOutside: (_) => _saveDrawState(),
      ),
    );
  }

  Widget _generationSettingsCard(
    AppState app,
    Map<String, String> text,
  ) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        key: const PageStorageKey<String>('v5-artist-draw-generation'),
        initiallyExpanded: true,
        maintainState: true,
        title: Text(text['title']!),
        subtitle: Text(text['hint']!),
        trailing: PopupMenuButton<String>(
          tooltip: text['title'],
          icon: const Icon(Icons.tune),
          onSelected: (value) {
            setState(() {
              _generationParams = value == 'sync'
                  ? _prepareGenerationParams(app.params)
                  : GenerateParams();
              _syncGenerationControllers();
            });
            _saveDrawState();
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              value: 'sync',
              child: ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.sync),
                title: Text(text['sync']!),
              ),
            ),
            PopupMenuItem(
              value: 'reset',
              child: ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.restart_alt),
                title: Text(text['reset']!),
              ),
            ),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: LayoutBuilder(builder: (context, constraints) {
              final fieldWidth = constraints.maxWidth >= 620
                  ? (constraints.maxWidth - 12) / 2
                  : constraints.maxWidth;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  SizedBox(
                    width: constraints.maxWidth,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('v5-draw-model-${_generationParams.model}'),
                      value: _generationParams.model,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: text['model']),
                      items: naiModels
                          .map((option) => DropdownMenuItem(
                                value: option.value,
                                child: Text(localizedNaiOptionLabel(
                                  app.settings.language,
                                  option.value,
                                  option.label,
                                )),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() {
                          _generationParams.model = value;
                          if (!_generationParams.isV5) {
                            if (_generationParams.qualityPreset == 'light') {
                              _generationParams.qualityPreset = 'standard';
                            }
                            _generationParams.transparentBackground = false;
                          }
                          _generationParams.qualityToggle =
                              _generationParams.qualityPreset != 'none';
                        });
                        _saveDrawState();
                      },
                    ),
                  ),
                  SizedBox(
                    width: constraints.maxWidth,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(text['size']!,
                            style: Theme.of(context).textTheme.labelLarge),
                        const SizedBox(height: 7),
                        Wrap(
                          spacing: 7,
                          runSpacing: 7,
                          children: sizePresets
                              .map((preset) => ChoiceChip(
                                    label: Text(localizedSizePresetLabel(
                                      app.settings.language,
                                      preset.width,
                                      preset.height,
                                      preset.label,
                                    )),
                                    selected: _generationParams.width ==
                                            preset.width &&
                                        _generationParams.height ==
                                            preset.height,
                                    onSelected: (_) {
                                      setState(() {
                                        _generationParams
                                          ..width = preset.width
                                          ..height = preset.height;
                                        _syncGenerationControllers();
                                      });
                                      _saveDrawState();
                                    },
                                  ))
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: TextField(
                      controller: _width,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(labelText: text['width']),
                      onEditingComplete: () => _commitDimension(_width, true),
                      onTapOutside: (_) => _commitDimension(_width, true),
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: TextField(
                      controller: _height,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(labelText: text['height']),
                      onEditingComplete: () => _commitDimension(_height, false),
                      onTapOutside: (_) => _commitDimension(_height, false),
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey(
                          'v5-draw-sampler-${_generationParams.sampler}'),
                      value: _generationParams.sampler,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: text['sampler']),
                      items: naiSamplers
                          .map((option) => DropdownMenuItem(
                                value: option.value,
                                child: Text(localizedNaiOptionLabel(
                                  app.settings.language,
                                  option.value,
                                  option.label,
                                )),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _generationParams.sampler = value);
                        _saveDrawState();
                      },
                    ),
                  ),
                  if (_generationParams.supportsNoiseScheduleControl)
                    SizedBox(
                      width: fieldWidth,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey(
                            'v5-draw-noise-${_generationParams.noiseSchedule}'),
                        value: _generationParams.noiseSchedule,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: text['noise']),
                        items: naiNoiseSchedules
                            .map((option) => DropdownMenuItem(
                                  value: option.value,
                                  child: Text(localizedNaiOptionLabel(
                                    app.settings.language,
                                    option.value,
                                    option.label,
                                  )),
                                ))
                            .toList(),
                        onChanged: (value) {
                          if (value == null) return;
                          setState(
                              () => _generationParams.noiseSchedule = value);
                          _saveDrawState();
                        },
                      ),
                    ),
                  SizedBox(
                    width: fieldWidth,
                    child: DropdownButtonFormField<int>(
                      key: ValueKey('v5-draw-uc-${_generationParams.ucPreset}'),
                      value: _generationParams.ucPreset,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: text['uc']),
                      items: ucPresets
                          .map((option) => DropdownMenuItem(
                                value: int.parse(option.value),
                                child: Text(localizedNaiOptionLabel(
                                  app.settings.language,
                                  option.value,
                                  option.label,
                                )),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _generationParams.ucPreset = value);
                        _saveDrawState();
                      },
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${text['steps']} · ${_generationParams.steps}'),
                        Slider(
                          value:
                              _generationParams.steps.clamp(1, 50).toDouble(),
                          min: 1,
                          max: 50,
                          divisions: 49,
                          onChanged: (value) => setState(
                              () => _generationParams.steps = value.round()),
                          onChangeEnd: (_) => _saveDrawState(),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            'CFG Scale · ${_generationParams.cfgScale.toStringAsFixed(1)}'),
                        Slider(
                          value: _generationParams.cfgScale.clamp(1, 10),
                          min: 1,
                          max: 10,
                          divisions: 45,
                          onChanged: (value) => setState(
                              () => _generationParams.cfgScale = value),
                          onChangeEnd: (_) => _saveDrawState(),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            'CFG Rescale · ${_generationParams.cfgRescale.toStringAsFixed(2)}'),
                        Slider(
                          value: _generationParams.cfgRescale.clamp(0, 1),
                          min: 0,
                          max: 1,
                          divisions: 100,
                          onChanged: (value) => setState(
                              () => _generationParams.cfgRescale = value),
                          onChangeEnd: (_) => _saveDrawState(),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: constraints.maxWidth,
                    child: QualityPresetControl(
                      language: app.settings.language,
                      model: _generationParams.model,
                      value: _generationParams.qualityPreset,
                      transparentBackground:
                          _generationParams.transparentBackground,
                      onChanged: (value) {
                        setState(() => _generationParams
                          ..qualityPreset = value
                          ..qualityToggle = value != 'none');
                        _saveDrawState();
                      },
                      onTransparentChanged: (value) {
                        setState(() =>
                            _generationParams.transparentBackground = value);
                        _saveDrawState();
                      },
                    ),
                  ),
                  SizedBox(
                    width: constraints.maxWidth,
                    child: TextField(
                      controller: _negativePrompt,
                      minLines: 2,
                      maxLines: 5,
                      decoration: InputDecoration(labelText: text['negative']),
                      onChanged: (value) {
                        _generationParams.negativePrompt = value;
                        _saveDrawState();
                      },
                    ),
                  ),
                  SizedBox(
                    width: constraints.maxWidth,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (_generationParams.supportsVariety)
                          FilterChip(
                            label: const Text('Variety+'),
                            selected: _generationParams.variety,
                            onSelected: (value) {
                              setState(() => _generationParams.variety = value);
                              _saveDrawState();
                            },
                          ),
                        if (!_generationParams.isV4Plus)
                          FilterChip(
                            label: const Text('SMEA'),
                            selected: _generationParams.smea,
                            onSelected: (value) {
                              setState(() {
                                _generationParams.smea = value;
                                if (!value) _generationParams.smeaDyn = false;
                              });
                              _saveDrawState();
                            },
                          ),
                        if (!_generationParams.isV4Plus)
                          FilterChip(
                            label: const Text('SMEA Dyn'),
                            selected: _generationParams.smeaDyn,
                            onSelected: _generationParams.smea
                                ? (value) {
                                    setState(() =>
                                        _generationParams.smeaDyn = value);
                                    _saveDrawState();
                                  }
                                : null,
                          ),
                      ],
                    ),
                  ),
                ],
              );
            }),
          ),
        ],
      ),
    );
  }

  List<Widget> _resultWorkspace(
    AppState app,
    Map<String, String> text,
  ) =>
      [
        const SizedBox(height: 12),
        _generationSettingsCard(app, _drawParamText(app.settings.language)),
        const SizedBox(height: 12),
        SegmentedButton<bool>(
          segments: [
            ButtonSegment(
              value: false,
              label: Text('${text['results']} (${_results.length})'),
            ),
            ButtonSegment(
              value: true,
              label: Text('${text['favorites']} (${_favorites.length})'),
            ),
          ],
          selected: {_showFavorites},
          onSelectionChanged: (values) =>
              setState(() => _showFavorites = values.first),
        ),
        const SizedBox(height: 6),
        Text(
          text['shared']!,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        if (!_showFavorites && _results.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(text['empty']!, textAlign: TextAlign.center),
          )
        else if (_showFavorites && _favorites.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(text['emptyFavorite']!, textAlign: TextAlign.center),
          )
        else
          ...(_showFavorites ? _favorites : _results).map(
            (item) => _drawResultCard(
              item,
              text,
              favorite: _showFavorites,
            ),
          ),
      ];

  List<Widget> _drawWorkspace(
    AppState app,
    ColorScheme colors,
    Map<String, String> text,
    int completed,
  ) {
    return [
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                text['settings']!,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 5),
              TextField(
                controller: _drawInput,
                minLines: 4,
                maxLines: 9,
                onChanged: (_) => setState(() => _message = ''),
                decoration: InputDecoration(
                  labelText: text['input'],
                  hintText: text['inputHint'],
                  helperText: text['normalizeHint'],
                  helperMaxLines: 2,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              _drawStyleTagLibrary(app),
              const SizedBox(height: 14),
              LayoutBuilder(
                builder: (context, constraints) {
                  final columns = constraints.maxWidth >= 700
                      ? 3
                      : constraints.maxWidth >= 360
                          ? 2
                          : 1;
                  final fieldWidth =
                      (constraints.maxWidth - (columns - 1) * 10) / columns;
                  return Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _numberField(_minWeight, text['min']!,
                          decimal: true, width: fieldWidth),
                      _numberField(_maxWeight, text['max']!,
                          decimal: true, width: fieldWidth),
                      _numberField(_candidateCount, text['count']!,
                          width: fieldWidth),
                    ],
                  );
                },
              ),
              const SizedBox(height: 12),
              WeightDistributionControls(
                mode: _weightControlMode,
                lower: double.tryParse(_minWeight.text) ?? .2,
                upper: double.tryParse(_maxWeight.text) ?? 1.2,
                config: _weightDistribution,
                onModeChanged: (value) {
                  setState(() => _weightControlMode = value);
                  _saveDrawState();
                },
                onChanged: (value) {
                  setState(() => _weightDistribution = value);
                  _saveDrawState();
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _basePrompt,
                minLines: 3,
                maxLines: 7,
                decoration: InputDecoration(
                  labelText: text['base'],
                  border: const OutlineInputBorder(),
                ),
                onChanged: (_) => _saveDrawState(),
              ),
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerRight,
                child: AnimatedBuilder(
                  animation: _basePrompt,
                  builder: (context, _) => PositivePromptPresetButton(
                    currentPrompt: _basePrompt.text,
                    compact: true,
                    onApply: (value) {
                      _basePrompt.text = value;
                      _basePrompt.selection = TextSelection.collapsed(
                          offset: _basePrompt.text.length);
                      _saveDrawState();
                    },
                  ),
                ),
              ),
              const SizedBox(height: 10),
              SegmentedButton<bool>(
                segments: [
                  ButtonSegment(
                    value: true,
                    icon: const Icon(Icons.push_pin_outlined),
                    label: Text(text['fixed']!),
                  ),
                  ButtonSegment(
                    value: false,
                    icon: const Icon(Icons.casino_outlined),
                    label: Text(text['random']!),
                  ),
                ],
                selected: {_fixedSeed},
                onSelectionChanged: (values) {
                  setState(() => _fixedSeed = values.first);
                  _saveDrawState();
                },
              ),
              if (_fixedSeed) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _seed,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: text['seed'],
                          border: const OutlineInputBorder(),
                        ),
                        onEditingComplete: _saveDrawState,
                        onTapOutside: (_) => _saveDrawState(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filledTonal(
                      tooltip: text['randomSeed'],
                      onPressed: () {
                        setState(() => _seed.text = '${_freshSeed()}');
                        _saveDrawState();
                      },
                      icon: const Icon(Icons.casino_outlined),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: _running ? null : () => _draw(text),
                    icon: const Icon(Icons.casino_outlined),
                    label: Text(text['draw']!),
                  ),
                  if (_running)
                    FilledButton.tonalIcon(
                      onPressed: _stop,
                      icon: const Icon(Icons.stop_circle_outlined),
                      label: Text(text['stop']!),
                    )
                  else
                    FilledButton.icon(
                      onPressed:
                          _results.isEmpty ? null : () => _generate(text),
                      icon: const Icon(Icons.play_arrow),
                      label: Text(text['generate']!),
                    ),
                ],
              ),
              if (_running) ...[
                const SizedBox(height: 10),
                LinearProgressIndicator(
                  value: _results.isEmpty ? null : completed / _results.length,
                ),
                const SizedBox(height: 5),
                Text(text['running']!
                    .replaceAll('{done}', '$completed')
                    .replaceAll('{total}', '${_results.length}')),
              ],
              if (_message.isNotEmpty && !_running) ...[
                const SizedBox(height: 10),
                Text(
                  _message,
                  style: TextStyle(
                    color: _message == text['none']
                        ? colors.error
                        : colors.primary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      ..._resultWorkspace(app, text),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final language = app.settings.language;
    final text = _repairText(language);
    final drawText = _drawText(language);
    final colors = Theme.of(context).colorScheme;
    final completed = _results
        .where((item) => item.status == 'done' || item.status == 'failed')
        .length;
    if (widget.mode == V5ArtistToolMode.draw) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            onPressed: widget.onBack,
            icon: const Icon(Icons.arrow_back),
          ),
          title: Text(drawText['title']!),
          actions: [
            TextButton.icon(
              onPressed: _reset,
              icon: const Icon(Icons.restart_alt),
              label: Text(text['reset']!),
            ),
          ],
        ),
        body: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 36),
          children: [
            Text(
              drawText['hint']!,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            ..._drawWorkspace(app, colors, drawText, completed),
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: widget.onBack,
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(text['title']!),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 36),
        children: [
          Text(text['subtitle']!,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Card(
            color: colors.primaryContainer.withAlpha(88),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, color: colors.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(text['basis']!,
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 5),
                        Text(text['note']!),
                        const SizedBox(height: 7),
                        Text(text['safe']!,
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.casino_outlined,
                          size: 18, color: colors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(text['strategy']!,
                            style: Theme.of(context).textTheme.titleSmall),
                      ),
                      Text(
                        '×0.333–0.5',
                        style: TextStyle(
                          color: colors.primary,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _input,
                    onChanged: (_) => setState(() => _output.clear()),
                    minLines: 5,
                    maxLines: 10,
                    decoration: InputDecoration(
                      labelText: text['input'],
                      hintText:
                          '(artist:foo:1.2), {artist:bar}, [artist:baz], 1.2::artist:qux ::',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      filled: true,
                      fillColor: colors.surface,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Expanded(child: Divider(color: colors.outlineVariant)),
                        Container(
                          width: 32,
                          height: 32,
                          margin: const EdgeInsets.symmetric(horizontal: 10),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: colors.primaryContainer,
                            border: Border.all(color: colors.outlineVariant),
                          ),
                          child: Icon(Icons.arrow_downward,
                              size: 17, color: colors.primary),
                        ),
                        Expanded(child: Divider(color: colors.outlineVariant)),
                      ],
                    ),
                  ),
                  TextField(
                    controller: _output,
                    readOnly: true,
                    minLines: 5,
                    maxLines: 10,
                    decoration: InputDecoration(
                      labelText: text['output'],
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      filled: true,
                      fillColor: colors.primaryContainer.withAlpha(44),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _numberField(
                    _candidateCount,
                    drawText['count']!,
                    width: double.infinity,
                  ),
                  const SizedBox(height: 12),
                  WeightDistributionControls(
                    mode: _weightControlMode,
                    lower: minV5ArtistRepairMultiplier,
                    upper: maxV5ArtistRepairMultiplier,
                    config: _weightDistribution,
                    onModeChanged: (value) {
                      setState(() => _weightControlMode = value);
                      _saveDrawState();
                    },
                    onChanged: (value) {
                      setState(() => _weightDistribution = value);
                      _saveDrawState();
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _basePrompt,
                    minLines: 3,
                    maxLines: 7,
                    onChanged: (_) => _saveDrawState(),
                    decoration: InputDecoration(
                      labelText: drawText['base'],
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerRight,
                    child: AnimatedBuilder(
                      animation: _basePrompt,
                      builder: (context, _) => PositivePromptPresetButton(
                        currentPrompt: _basePrompt.text,
                        compact: true,
                        onApply: (value) {
                          _basePrompt.text = value;
                          _basePrompt.selection = TextSelection.collapsed(
                              offset: _basePrompt.text.length);
                          _saveDrawState();
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SegmentedButton<bool>(
                    segments: [
                      ButtonSegment(
                        value: true,
                        icon: const Icon(Icons.push_pin_outlined),
                        label: Text(drawText['fixed']!),
                      ),
                      ButtonSegment(
                        value: false,
                        icon: const Icon(Icons.casino_outlined),
                        label: Text(drawText['random']!),
                      ),
                    ],
                    selected: {_fixedSeed},
                    onSelectionChanged: (values) {
                      setState(() => _fixedSeed = values.first);
                      _saveDrawState();
                    },
                  ),
                  if (_fixedSeed) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _seed,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(
                              labelText: drawText['seed'],
                              border: const OutlineInputBorder(),
                            ),
                            onEditingComplete: _saveDrawState,
                            onTapOutside: (_) => _saveDrawState(),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filledTonal(
                          tooltip: drawText['randomSeed'],
                          onPressed: () {
                            setState(() => _seed.text = '${_freshSeed()}');
                            _saveDrawState();
                          },
                          icon: const Icon(Icons.casino_outlined),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: _running ? null : () => _run(text),
                        icon: const Icon(Icons.auto_fix_high),
                        label: Text(text['run']!),
                      ),
                      OutlinedButton.icon(
                        onPressed: _output.text.isEmpty
                            ? null
                            : () async {
                                await Clipboard.setData(
                                  ClipboardData(text: _output.text),
                                );
                                if (!context.mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(text['copied']!)),
                                );
                              },
                        icon: const Icon(Icons.content_copy_outlined),
                        label: Text(text['copy']!),
                      ),
                      if (_running)
                        FilledButton.tonalIcon(
                          onPressed: _stop,
                          icon: const Icon(Icons.stop_circle_outlined),
                          label: Text(drawText['stop']!),
                        )
                      else
                        FilledButton.icon(
                          onPressed: _results.isEmpty
                              ? null
                              : () => _generate(drawText),
                          icon: const Icon(Icons.play_arrow),
                          label: Text(drawText['generate']!),
                        ),
                    ],
                  ),
                  if (_running) ...[
                    const SizedBox(height: 10),
                    LinearProgressIndicator(
                      value:
                          _results.isEmpty ? null : completed / _results.length,
                    ),
                    const SizedBox(height: 5),
                    Text(drawText['running']!
                        .replaceAll('{done}', '$completed')
                        .replaceAll('{total}', '${_results.length}')),
                  ],
                  if (_message.isNotEmpty && !_running) ...[
                    const SizedBox(height: 10),
                    Text(
                      _message,
                      style: TextStyle(
                        color: _message == text['none']
                            ? colors.error
                            : colors.primary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          ..._resultWorkspace(app, drawText),
        ],
      ),
    );
  }
}
