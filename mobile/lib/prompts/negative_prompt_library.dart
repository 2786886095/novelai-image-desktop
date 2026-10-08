import 'dart:typed_data';
import 'dart:convert';

const negativeBuiltins=[
  {
    'id': 'negative-reinforced-v1',
    'name': '强化版',
    'prompt': r'''2.0::worst quality, normal quality, lowres, text, letters, title, watermark, signature, username, artist name, artist collaboration, 
1.8::bad hands, extra fingers, missing fingers, fused fingers, poorly drawn hands, bad feet, extra toes, missing toes, fused toes, poorly drawn feet, 
1.6::bad anatomy, bad proportions, malformed limbs, extra limbs, missing limbs, disconnected limbs, fused body parts, long neck, unnatural pose, 
1.5::blurry, jpeg artifacts, compression artifacts, glitch, scan lines, chromatic aberration, aliasing, jagged edges, grid noise, edge artifact, denoising failure, 
1.4::poorly drawn face, ugly face, asymmetrical eyes, cross-eyed, iris deformation, disproportional philtrum, facial asymmetry, 
1.3::plastic skin, wax figure, clay render, doll joint, flat color, flat lighting, specular overflow, vignetting, 
1.2::censored, cropped, out of frame, black bars, sketch, unfinished, messy, cartoon, Disney style, Pixar style, cel-shaded, vector art, western woman, western face, blood vessel, 
1.1::frame border, UV stretching, PBR error, subsurface scattering error, ray tracing artifact, digital artifact, unfinished, duplicate''',
    'createdAt': '2026-10-08T00:00:00Z'
  },
  {
    'id': 'negative-light-v1',
    'name': '轻量版',
    'prompt': r'''lowres, bad anatomy, bad hands, extra limbs, missing limbs, deformed, mutated, poorly drawn face, ugly, blurry, out of focus, watermark, text, error, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, username, artistic error, film grain, scan artifacts, bad quality, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page,mismatched pupils, glowing eyes''',
    'createdAt': '2026-10-08T00:00:00Z'
  }
];

bool _valid(dynamic p)=>p is Map && p['id'] is String && (p['id'] as String).isNotEmpty && (p['id'] as String).length<=100 && p['name'] is String && (p['name'] as String).trim().isNotEmpty && (p['name'] as String).length<=100 && p['prompt'] is String && (p['prompt'] as String).trim().isNotEmpty && (p['prompt'] as String).length<=100000 && p['createdAt'] is String;
List<Map<String,String>> normalizeNegativePromptPresets(dynamic value){
 if(value is! List)return negativeBuiltins.map((p)=>Map<String,String>.from(p)).toList();
 final ids=<String>{};return value.where(_valid).where((p)=>ids.add(p['id'] as String)).take(2000).map((p)=><String,String>{for(final k in ['id','name','prompt','createdAt'])k:p[k] as String}).toList();
}
List<Map<String,String>> parseNegativeLibrary(String text){
 if(text.length>5000000)throw const FormatException('Library file exceeds 5 MB');
 final doc=jsonDecode(text.replaceFirst(RegExp(r'^\uFEFF'),''));
 if(doc is! Map||doc['identifier']!='langbai-negative-prompt-library'||doc['version']!=1||doc['presets'] is! List)throw const FormatException('Invalid negative prompt library');
 final raw=doc['presets'] as List;if(raw.length>2000||raw.any((p)=>!_valid(p)))throw const FormatException('Invalid negative prompt presets');
 final entries=normalizeNegativePromptPresets(raw);if(entries.length!=raw.length)throw const FormatException('Duplicate preset IDs');return entries;
}
String exportNegativeLibrary(List<Map<String,String>> entries)=>const JsonEncoder.withIndent('  ').convert({'identifier':'langbai-negative-prompt-library','version':1,'presets':normalizeNegativePromptPresets(entries)});
String applyNegativePreset(String current,String prompt,String mode)=>mode=='replace'||current.trim().isEmpty?prompt:prompt.trim().isEmpty?current:current+(current.trimRight().endsWith(',')?' ':', ')+prompt;
List<Map<String,String>> mergeNegativeLibrary(List<Map<String,String>> current,List<Map<String,String>> imported,String Function() newId){final next=current.map((p)=>Map<String,String>.from(p)).toList();for(final p in imported){if(next.any((e)=>e['name']==p['name']&&e['prompt']==p['prompt']))continue;next.add({...p,'id':next.any((e)=>e['id']==p['id'])?newId():p['id']!});}if(next.length>2000)throw const FormatException('Maximum 2000 presets');return next;}

String decodeNegativeFile(Uint8List bytes)=>utf8.decode(bytes);
const _negativeLabels={
  "zh-CN": [
    "负面提示词库",
    "选择后预览，再替换或追加；不会改动正面提示词。",
    "搜索名称或提示词",
    "保存当前",
    "新建",
    "编辑",
    "删除",
    "导入",
    "导出",
    "替换",
    "追加",
    "关闭",
    "保存",
    "取消",
    "名称",
    "负面提示词",
    "暂无预设",
    "已保存",
    "已应用负面提示词",
    "确认删除此预设？"
  ],
  "zh-TW": [
    "負面提示詞庫",
    "選擇後預覽，再取代或追加；不會改動正面提示詞。",
    "搜尋名稱或提示詞",
    "儲存目前",
    "新增",
    "編輯",
    "刪除",
    "匯入",
    "匯出",
    "取代",
    "追加",
    "關閉",
    "儲存",
    "取消",
    "名稱",
    "負面提示詞",
    "尚無預設",
    "已儲存",
    "已套用負面提示詞",
    "確認刪除此預設？"
  ],
  "ja-JP": [
    "ネガティブライブラリ",
    "プレビュー後に置換または追加。正面プロンプトは変更しません。",
    "名前・プロンプトを検索",
    "現在を保存",
    "新規",
    "編集",
    "削除",
    "読込",
    "書出し",
    "置換",
    "追加",
    "閉じる",
    "保存",
    "キャンセル",
    "名前",
    "ネガティブプロンプト",
    "プリセットなし",
    "保存しました",
    "適用しました",
    "このプリセットを削除しますか？"
  ],
  "ko-KR": [
    "부정 프롬프트 라이브러리",
    "미리 보기 후 교체 또는 추가합니다. 긍정 프롬프트는 변경하지 않습니다.",
    "이름 또는 프롬프트 검색",
    "현재 저장",
    "새로 만들기",
    "편집",
    "삭제",
    "가져오기",
    "내보내기",
    "교체",
    "추가",
    "닫기",
    "저장",
    "취소",
    "이름",
    "부정 프롬프트",
    "프리셋 없음",
    "저장됨",
    "적용됨",
    "이 프리셋을 삭제할까요?"
  ],
  "en-US": [
    "Negative prompt library",
    "Preview, then replace or append. Positive prompts are never changed.",
    "Search names or prompts",
    "Save current",
    "New",
    "Edit",
    "Delete",
    "Import",
    "Export",
    "Replace",
    "Append",
    "Close",
    "Save",
    "Cancel",
    "Name",
    "Negative prompt",
    "No presets",
    "Saved",
    "Negative prompt applied",
    "Delete this preset?"
  ]
};
List<String> negativeLibraryLabels(String language)=>_negativeLabels[language]??_negativeLabels['en-US']!;
