import { expect, it, vi } from 'vitest';
vi.mock('./store', () => ({ getSettings: () => ({}) }));
vi.mock('./proxy', () => ({ proxyConfigForUrl: async () => ({}) }));
import { BackupAccountValidationError, backupAccountValidationError } from './nai-accounts-validation';

const failed = (code: 'auth' | 'http' | 'network' | 'unsupported', status: number) => ({ ok: false, code, status }) as const;

it('names the account and the reason in Chinese without credentials or raw codes', () => {
  const error = backupAccountValidationError('主账号', failed('auth', 401));
  expect(error).toBeInstanceOf(BackupAccountValidationError);
  expect(error.message).toBe('备份中的 NovelAI 账户「主账号」验证未通过：API Token 无效或已失效（HTTP 401）；未导入任何数据。');
  expect(backupAccountValidationError('x', failed('http', 500)).message).toContain('接口返回了错误状态（HTTP 500）');
  expect(backupAccountValidationError('x', failed('unsupported', 302)).message).toContain('未找到兼容的只读鉴权接口（HTTP 302）');
  // Status 0 (no response) is left out; an unknown code falls back to the HTTP text.
  expect(backupAccountValidationError('x', failed('network', 0)).message).not.toContain('HTTP');
  expect(backupAccountValidationError('x', { ok: false, code: 'other', status: 418 } as never).message).toContain('接口返回了错误状态（HTTP 418）');
});

it('cleans the archive label: no bidi or control characters, cut by code point, blank labels omitted', () => {
  const reversed = backupAccountValidationError('主账号‮ 反向\n第二行', failed('auth', 401)).message;
  expect(reversed).not.toMatch(/[‮\n]/);
  expect(reversed).toContain('「主账号 反向 第二行」');
  const long = backupAccountValidationError('a'.repeat(63) + '😀tail', failed('auth', 401)).message;
  expect(long).toContain(`「${'a'.repeat(63)}😀」`);
  expect(long).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  expect(backupAccountValidationError('   ', failed('auth', 401)).message).toMatch(/^备份中的 NovelAI 账户验证未通过/);
  // Joiners are part of the text: emoji sequences and Persian words stay intact.
  expect(backupAccountValidationError('👩\u200D💻工作号', failed('auth', 401)).message).toContain('「👩\u200D💻工作号」');
  expect(backupAccountValidationError('می\u200Cخواهم', failed('auth', 401)).message).toContain('「می\u200Cخواهم」');
});
