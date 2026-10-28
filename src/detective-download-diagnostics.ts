export interface DetectiveDownloadDiagnostic {
  stage: string;
  file: string;
  code?: string;
  httpStatus?: number;
  message: string;
}

/** Diagnostics are text, not raw request/config dumps or signed CDN credentials. */
export function sanitizeDownloadDiagnostic(value: string): string {
  return value.slice(0, 16_000)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        return `${url.protocol}//${url.host}${url.pathname}${url.search || url.hash ? "?[redacted]" : ""}`;
      } catch { return "[redacted URL]"; }
    })
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;"'\]}]+/gi, "[redacted authorization]")
    .replace(/\b(?:authorization|(?:access|refresh|id|auth|api|hf)[_-]?token|hugging[_-]?face(?:[_-]?hub)?[_-]?token|token|password|passwd|api[_-]?key|(?:client[_-]?)?secret)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;\]}]+)/gi, "[redacted credential]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim().slice(0, 1600);
}

export function downloadFailureDiagnostic(error: unknown, stage: string, file: string): DetectiveDownloadDiagnostic {
  const item = error && typeof error === "object" ? error as { code?: unknown; httpStatus?: unknown; response?: { status?: unknown }; message?: unknown } : {};
  const code = typeof item.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(item.code) ? item.code : undefined;
  const status = Number(item.httpStatus ?? item.response?.status);
  return {
    stage, file: sanitizeDownloadDiagnostic(file).slice(0, 260),
    ...(code ? { code } : {}),
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}),
    message: sanitizeDownloadDiagnostic(typeof item.message === "string" ? item.message : String(error)) || "Unknown installation error",
  };
}

const LABELS = {
  "zh-CN": "实际失败原因（已隐藏凭据）",
} as const;
export function downloadDiagnosticLabel(language: unknown): string {
  return LABELS[language as keyof typeof LABELS] ?? LABELS["zh-CN"];
}
