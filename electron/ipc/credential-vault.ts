export const CREDENTIAL_PREFIX = "enc:v1:";
export const SENSITIVE_SETTING_KEYS = [
  "visionApiKey", "convertApiKey", "agentApiKey", "tagServerApiKey", "baiduSecret", "translateAiApiKey",
] as const;

type Cryptography = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

export class CredentialVault {
  private readonly locked = new Map<string, string>();
  constructor(private readonly crypto: Cryptography) {}
  issues() { return [...this.locked.keys()]; }
  forget(key: string) { this.locked.delete(key); }
  reset() { this.locked.clear(); }
  decode(key: string, value: unknown): unknown {
    if (typeof value !== "string" || !value.startsWith(CREDENTIAL_PREFIX)) return value;
    try {
      if (!this.crypto.isEncryptionAvailable()) throw new Error("locked");
      const result = this.crypto.decryptString(Buffer.from(value.slice(CREDENTIAL_PREFIX.length), "base64"));
      this.locked.delete(key);
      return result;
    } catch {
      this.locked.set(key, value);
      // Never send ciphertext to a provider or expose it as an editable key.
      return "";
    }
  }
  encode(key: string, value: unknown): unknown {
    // An unrelated settings/history save must preserve an unrecovered secret.
    if ((value == null || value === "") && this.locked.has(key)) return this.locked.get(key);
    if (typeof value !== "string" || !value || value.startsWith(CREDENTIAL_PREFIX)) return value;
    if (!this.crypto.isEncryptionAvailable()) throw new Error("本地凭据加密暂不可用，请稍后重试。");
    return CREDENTIAL_PREFIX + this.crypto.encryptString(value).toString("base64");
  }
}
