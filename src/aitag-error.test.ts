import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {formatAitagFailure} from "./aitag-error";
describe("AITag user-facing errors", () => {
 it("keeps HTTP status through Electron's wrapped error", () => {
   expect(formatAitagFailure(new Error("Error invoking remote method 'aitag:search': Error: AITAG_BLOCKED_403"))).toContain("网站防护");
   expect(formatAitagFailure("AITAG_HTTP_429")).toContain("429");
   expect(formatAitagFailure("AITAG_TIMEOUT")).toContain("超时");
 });
 it.each(["zh-CN","zh-TW","en-US","ja-JP","ko-KR"])("localizes 403 and never includes remote HTML in %s", language => {
   const output = formatAitagFailure(new Error('AITAG_BLOCKED_403 <script>secret</script>'),language);
   expect(output).toContain("403");expect(output).not.toContain("secret");expect(output).not.toContain('<script>');
 });
 it("never displays arbitrary raw error text",()=>{
   expect(formatAitagFailure('https://name:secret@example.test/?token=123')).not.toContain('secret');
 });
 it("retains existing cards after failure, renders the real cause, and retries config",()=>{
   const source=readFileSync('src/AitagGallery.tsx','utf8').split('export default function AitagGallery')[1];
   expect(source).toContain('formatAitagFailure(error, language)');
   expect(source).not.toContain('!error && result.items.length > 0');
   expect(source).toContain('window.naiDesktop.aitagConfig().catch(() => null)');
   expect(source).toContain('onClick={() => void refresh()}');
 });
});
