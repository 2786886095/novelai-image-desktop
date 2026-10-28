// Only render application-owned messages, never remote HTML, URLs or credentials.
const MESSAGES = {
  "zh-CN": [
    "AITag 网站防护拒绝了软件请求（HTTP 403）。官网网页与接口的访问结果可能不同；请稍后重试，或打开官网查看。",
    "AITag 接口拒绝访问（HTTP {status}）。请打开官网确认访问状态。",
    "AITag 请求过于频繁（HTTP 429），请稍后重试。",
    "AITag 服务暂时异常（HTTP {status}），请稍后重试。",
    "AITag 返回的不是有效图库数据，可能是接口变更或验证页面。",
    "AITag 请求超时，请稍后重试并检查软件代理设置。",
    "AITag 连接失败，请检查软件代理或网络设置。",
    "读取 AITag 数据失败，请稍后重试。"
  ]
} as const;
export function formatAitagFailure(error: unknown, language = "zh-CN"): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = message.match(/AITAG_(BLOCKED_403|HTTP_\d{3}|INVALID_RESPONSE|TIMEOUT|NETWORK)/)?.[1] ?? "";
  const text = MESSAGES[language as keyof typeof MESSAGES] ?? MESSAGES["zh-CN"];
  const status = code.match(/HTTP_(\d{3})/)?.[1] ?? "";
  const index = code === "BLOCKED_403" ? 0
    : status === "429" ? 2
    : status ? (Number(status) >= 500 ? 3 : 1)
    : code === "INVALID_RESPONSE" ? 4 : code === "TIMEOUT" ? 5 : code === "NETWORK" ? 6 : 7;
  return text[index].replace("{status}", status);
}
