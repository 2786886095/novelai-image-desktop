import { SystemPromptImportError, type SystemPromptImportErrorCode } from "./system-prompt-import";
import { errorText } from "../error-message";

const translations = {
  "zh-CN": { title: "系统提示词", hint: "支持 UTF-8 TXT、MD、系统提示词 JSON 和 SillyTavern JSON。转换与反推分别选择；不覆盖任务输出模板。", import: "导入系统提示词", empty: "没有可用的系统提示词正文。", bytes: "文件超过 2 MiB，未导入。", utf8: "文件不是有效的 UTF-8 文本。", extension: "请选择 .txt、.md 或 .json 文件。", json: "JSON 格式无效，原配置未更改。", shape: "JSON 必须包含 systemPrompt / system_prompt 或启用的 SillyTavern prompts。", "system-limit": "系统提示词超过 200,000 字符，已拒绝而非截断。", "postscript-limit": "追加提示词超过 100,000 字符，已拒绝而非截断。" },
} as const;

export function systemPromptImportText(language: unknown) {
  const toggles = {
    "zh-CN": { enabled: "启用系统提示词（转换／反推）", disabledHint: "开关关闭时保留选择，但不应用正文；不会自动替你开启。" },
  } as const;
  const key = language as keyof typeof translations;
  return { ...(translations[key] ?? translations["zh-CN"]), ...(toggles[key] ?? toggles["zh-CN"]) };
}
export function systemPromptImportErrorText(error: unknown, language: unknown) {
  return error instanceof SystemPromptImportError
    ? systemPromptImportText(language)[error.code as SystemPromptImportErrorCode]
    : errorText(error);
}
