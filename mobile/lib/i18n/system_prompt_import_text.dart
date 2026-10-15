import 'app_locales.dart';
import '../agent/tavern_preset_import.dart';

const _errors = <String, List<String>>{
  'empty': [
    '系统提示词为空；原配置未改。',
    '系統提示詞為空；原設定未改。',
    'Empty system prompt; existing configuration preserved.',
    'システムプロンプトが空です。設定は保持。',
    '시스템 프롬프트가 비어 있습니다. 기존 설정은 유지됩니다.'
  ],
  'bytes': [
    '文件超过 2 MiB；拒绝导入，未截断。',
    '檔案超過 2 MiB；拒絕匯入，未截斷。',
    'File exceeds 2 MiB; rejected without truncation.',
    '2 MiB を超えています。切り詰めず拒否。',
    '파일이 2 MiB를 초과합니다. 잘라내지 않고 거부했습니다.'
  ],
  'utf8': [
    '文件不是有效 UTF-8；请转换编码后重试。',
    '檔案不是有效 UTF-8；請轉換編碼後重試。',
    'Invalid UTF-8; convert the encoding and retry.',
    'UTF-8 形式が無効です。文字コードを変換してください。',
    '올바른 UTF-8이 아닙니다. 인코딩을 변환해 주세요.'
  ],
  'extension': [
    '仅支持 TXT / MD / JSON 系统提示词。',
    '僅支援 TXT / MD / JSON 系統提示詞。',
    'Only TXT / MD / JSON system prompts are supported.',
    'TXT / MD / JSON のみ対応。',
    'TXT / MD / JSON만 지원합니다.'
  ],
  'json': [
    'JSON 损坏；原配置未改。',
    'JSON 損壞；原設定未改。',
    'Malformed JSON; existing configuration preserved.',
    'JSON が不正です。設定は保持。',
    'JSON이 올바르지 않습니다. 기존 설정은 유지됩니다.'
  ],
  'shape': [
    '未找到有效 systemPrompt / system_prompt 或 ST 提示块。',
    '未找到有效 systemPrompt / system_prompt 或 ST 提示區塊。',
    'No valid systemPrompt/system_prompt or ST prompt blocks.',
    '有効な systemPrompt/system_prompt または ST ブロックがありません。',
    '유효한 systemPrompt/system_prompt 또는 ST 블록이 없습니다.'
  ],
  'system-limit': [
    '系统正文超过 200000 字符；拒绝导入，未截断。',
    '系統本文超過 200000 字元；拒絕匯入，未截斷。',
    'System body exceeds 200000 characters; rejected without truncation.',
    '本文が200000文字を超えます。切り詰めず拒否。',
    '본문이 200000자를 초과합니다. 잘라내지 않고 거부했습니다.'
  ],
  'postscript-limit': [
    '后置正文超过 100000 字符；拒绝导入，未截断。',
    '後置本文超過 100000 字元；拒絕匯入，未截斷。',
    'Postscript exceeds 100000 characters; rejected without truncation.',
    '追記が100000文字を超えます。切り詰めず拒否。',
    '후문이 100000자를 초과합니다. 잘라내지 않고 거부했습니다.'
  ],
};
String systemPromptImportErrorText(Object error, Object? language) {
  final code = error is SystemPromptImportError ? error.code : null;
  final rows = code == null ? null : _errors[code];
  if (rows == null) return error.toString();
  final index = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']
      .indexOf(normalizeAppLocaleCode(language));
  return rows[index < 0 ? 0 : index];
}
