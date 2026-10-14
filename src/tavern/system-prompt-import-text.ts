import { SystemPromptImportError, type SystemPromptImportErrorCode } from "./system-prompt-import";

const translations = {
  "zh-CN": { title: "系统提示词", hint: "支持 UTF-8 TXT、MD、系统提示词 JSON 和 SillyTavern JSON。转换与反推分别选择；不覆盖任务输出模板。", import: "导入系统提示词", empty: "没有可用的系统提示词正文。", bytes: "文件超过 2 MiB，未导入。", utf8: "文件不是有效的 UTF-8 文本。", extension: "请选择 .txt、.md 或 .json 文件。", json: "JSON 格式无效，原配置未更改。", shape: "JSON 必须包含 systemPrompt / system_prompt 或启用的 SillyTavern prompts。", "system-limit": "系统提示词超过 200,000 字符，已拒绝而非截断。", "postscript-limit": "追加提示词超过 100,000 字符，已拒绝而非截断。" },
  "zh-TW": { title: "系統提示詞", hint: "支援 UTF-8 TXT、MD、系統提示詞 JSON 與 SillyTavern JSON。轉換與反推分別選擇；不覆寫任務輸出模板。", import: "匯入系統提示詞", empty: "沒有可用的系統提示詞正文。", bytes: "檔案超過 2 MiB，未匯入。", utf8: "檔案不是有效的 UTF-8 文字。", extension: "請選擇 .txt、.md 或 .json 檔案。", json: "JSON 格式無效，原設定未更改。", shape: "JSON 必須包含 systemPrompt / system_prompt 或啟用的 SillyTavern prompts。", "system-limit": "系統提示詞超過 200,000 字元，已拒絕而非截斷。", "postscript-limit": "追加提示詞超過 100,000 字元，已拒絕而非截斷。" },
  "en-US": { title: "System prompt", hint: "Import UTF-8 TXT, MD, system-prompt JSON or SillyTavern JSON. Conversion and reverse select independently; task output templates are preserved.", import: "Import system prompt", empty: "No usable system prompt body was found.", bytes: "File exceeds 2 MiB; nothing was imported.", utf8: "File is not valid UTF-8 text.", extension: "Choose a .txt, .md or .json file.", json: "Invalid JSON; existing settings are unchanged.", shape: "JSON must contain systemPrompt / system_prompt or enabled SillyTavern prompts.", "system-limit": "System prompt exceeds 200,000 characters; rejected, not truncated.", "postscript-limit": "Postscript exceeds 100,000 characters; rejected, not truncated." },
  "ja-JP": { title: "システムプロンプト", hint: "UTF-8 TXT、MD、システムプロンプト JSON、SillyTavern JSON に対応。変換と解析は個別選択し、出力テンプレートは保持します。", import: "システムプロンプトを読み込む", empty: "使用可能なシステムプロンプト本文がありません。", bytes: "ファイルが 2 MiB を超えています。読み込みませんでした。", utf8: "有効な UTF-8 テキストではありません。", extension: ".txt、.md、.json ファイルを選択してください。", json: "JSON 形式が無効です。既存の設定は変更していません。", shape: "JSON には systemPrompt / system_prompt または有効な SillyTavern prompts が必要です。", "system-limit": "本文が 200,000 文字を超えています。切り捨てずに拒否しました。", "postscript-limit": "追加本文が 100,000 文字を超えています。切り捨てずに拒否しました。" },
  "ko-KR": { title: "시스템 프롬프트", hint: "UTF-8 TXT, MD, 시스템 프롬프트 JSON 및 SillyTavern JSON을 지원합니다. 변환과 분석은 개별 선택하며 출력 템플릿을 유지합니다.", import: "시스템 프롬프트 가져오기", empty: "사용 가능한 시스템 프롬프트 본문이 없습니다.", bytes: "파일이 2 MiB를 초과하여 가져오지 않았습니다.", utf8: "유효한 UTF-8 텍스트가 아닙니다.", extension: ".txt, .md 또는 .json 파일을 선택하세요.", json: "잘못된 JSON입니다. 기존 설정은 변경되지 않았습니다.", shape: "JSON에 systemPrompt / system_prompt 또는 활성 SillyTavern prompts가 필요합니다.", "system-limit": "본문이 200,000자를 초과하여 잘라내지 않고 거부했습니다.", "postscript-limit": "추가 본문이 100,000자를 초과하여 잘라내지 않고 거부했습니다." },
} as const;

export function systemPromptImportText(language: unknown) {
  const toggles = {
    "zh-CN": { enabled: "启用系统提示词（转换／反推）", disabledHint: "开关关闭时保留选择，但不应用正文；不会自动替你开启。" },
    "zh-TW": { enabled: "啟用系統提示詞（轉換／反推）", disabledHint: "關閉時保留選擇，但不套用正文；不會自動開啟。" },
    "en-US": { enabled: "Enable system prompts (conversion / reverse)", disabledHint: "When disabled, selections are retained but their bodies are not applied. Importing does not turn this on." },
    "ja-JP": { enabled: "システムプロンプトを有効にする（変換／解析）", disabledHint: "無効時も選択を保持しますが、本文は適用されません。読み込みで自動的に有効にはしません。" },
    "ko-KR": { enabled: "시스템 프롬프트 사용 (변환 / 분석)", disabledHint: "비활성화하면 선택은 유지되지만 본문은 적용되지 않습니다. 가져오기로 자동 활성화하지 않습니다." },
  } as const;
  const key = language as keyof typeof translations;
  return { ...(translations[key] ?? translations["en-US"]), ...(toggles[key] ?? toggles["en-US"]) };
}
export function systemPromptImportErrorText(error: unknown, language: unknown) {
  return error instanceof SystemPromptImportError
    ? systemPromptImportText(language)[error.code as SystemPromptImportErrorCode]
    : error instanceof Error ? error.message : String(error);
}
