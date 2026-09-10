import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({app: {}, safeStorage: {}}));
import { lockedCredentials, applyRecoveredCredentials } from "./credential-recovery";

describe("mixed legacy encryption profiles", () => {
  const data = {token: "enc:v1:legacy", settings: {agentApiKey:"enc:v1:legacy2", visionApiKey:"enc:v1:stable", ordinary:42}, history:[{id:"keep"}]};
  const decrypt = (v: string) => {if(v !== "enc:v1:stable") throw Error(); return "works";};
  it("only tries encrypted fields rejected by the stable context", () => {
    expect(lockedCredentials(data,decrypt).map(p=>p.key)).toEqual(["token","agentApiKey"]);
  });
  it("re-encrypts recovered keys while preserving settings, history and already usable keys", () => {
    const result = applyRecoveredCredentials(data,lockedCredentials(data,decrypt),["one","two"],v=>`enc:v1:new-${v}`);
    expect(result.recovered).toBe(2);expect(result.data.history).toEqual(data.history);
    expect(result.data.settings.visionApiKey).toBe(data.settings.visionApiKey);
    expect(result.data.settings.ordinary).toBe(42);expect(data.token).toBe("enc:v1:legacy");
  });
  it("does not overwrite a concurrently replaced key or erase a still locked key", () => {
    const result=applyRecoveredCredentials({...data, token:"enc:v1:changed"},lockedCredentials(data,decrypt),["one",null],v=>v);
    expect(result.recovered).toBe(0);expect(result.data.token).toBe("enc:v1:changed");
    expect(result.data.settings.agentApiKey).toBe(data.settings.agentApiKey);
  });
  it("does not accept ciphertext masquerading as recovered plaintext", () => {
    expect(applyRecoveredCredentials(data,lockedCredentials(data,decrypt),["enc:v1:broken",""],v=>v).recovered).toBe(0);
  });
  it("pins userData before ready/singleton and runs recovery before loading settings", () => {
    const main=readFileSync("electron/main.ts","utf8");
    expect(main.indexOf("else pinUserDataAndMigrate();")).toBeLessThan(main.indexOf("requestSingleInstanceLock()"));
    expect(main.indexOf("await recoverLegacyCredentials()")).toBeLessThan(main.indexOf("  readStore();"));
    const bootstrap=readFileSync("electron/bootstrap.ts","utf8");expect(bootstrap).toContain('require("./credential-helper")');
  });
});
