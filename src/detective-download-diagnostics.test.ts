import { expect, it } from "vitest";
import { downloadDiagnosticLabel, downloadFailureDiagnostic, sanitizeDownloadDiagnostic } from "./detective-download-diagnostics";

it("retains failure evidence while redacting URL credentials, signed queries and authorization", () => {
  const raw = 'TLS_SENTINEL https://fixture-user:fixture-pass@cdn.invalid/archive?token=fixture-token&signature=fixture-signature#fixture-fragment Authorization: Bearer fixture-bearer password=fixture-password {"api_key":"fixture-key"}';
  const result = downloadFailureDiagnostic(Object.assign(new Error(raw), { code: "ERR_TLS_CERT_ALTNAME_INVALID" }), "downloading", "model.zip");
  expect(result).toMatchObject({ stage: "downloading", file: "model.zip", code: "ERR_TLS_CERT_ALTNAME_INVALID" });
  expect(result.message).toContain("TLS_SENTINEL");
  expect(result.message).toContain("https://cdn.invalid/archive");
  for (const privateValue of ["fixture-user", "fixture-pass", "fixture-token", "fixture-signature", "fixture-fragment", "fixture-bearer", "fixture-password", "fixture-key"]) expect(result.message).not.toContain(privateValue);
});
it("bounds diagnostics and keeps valid status/errno without raw request config", () => {
  const result = downloadFailureDiagnostic({ message: "disk sentinel " + "x".repeat(20_000), code: "ENOSPC", response: { status: 403 }, config: { token: "not-for-display" } }, "extracting", "archive.zip");
  expect(result.message.length).toBeLessThanOrEqual(1600);
  expect(result).toMatchObject({ code: "ENOSPC", httpStatus: 403 });
  expect(JSON.stringify(result)).not.toContain("not-for-display");
  expect(downloadFailureDiagnostic({ code: "password=fixture", message: "failure", httpStatus: 999 }, "checking", "Python")).not.toHaveProperty("code");
  expect(sanitizeDownloadDiagnostic("failure\u0000control")).toBe("failure control");
});
it("redacts common prefixed credentials in actual failure messages, including case and dash variants", () => {
  const values = ["fixture-access-value", "fixture-hf-value", "fixture-refresh-value", "fixture-hub-value", "fixture-auth-value", "fixture-client-value", "fixture-query-value", "fixture-user-value", "fixture-pass-value"];
  const message = `PREFIX_SENTINEL access_token=${values[0]} HF-TOKEN: "${values[1]}" refresh-token='${values[2]}' {"HUGGING_FACE_HUB_TOKEN":"${values[3]}"} AuthToken=${values[4]} client_secret=${values[5]} https://${values[7]}:${values[8]}@cdn.invalid/archive?signed=${values[6]}`;
  const result = downloadFailureDiagnostic(Object.assign(new Error(message), { code: "ETIMEDOUT" }), "downloading", "model.zip");
  expect(result).toMatchObject({ stage: "downloading", code: "ETIMEDOUT" });
  expect(result.message).toContain("PREFIX_SENTINEL");
  expect(result.message).toContain("https://cdn.invalid/archive?[redacted]");
  for (const value of values) expect(result.message).not.toContain(value);
});
it("has a diagnostic label", () => {
  expect(downloadDiagnosticLabel("zh-CN")).toBe("实际失败原因（已隐藏凭据）");
});
