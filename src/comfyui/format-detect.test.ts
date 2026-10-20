import { createHash } from "node:crypto";
import { describe,it,expect } from "vitest";
import { assertUntrustedValue,ComfyValidationError,detectComfyPayload,parseUntrustedJson,payloadFromImageMetadata } from "./format-detect";
import { sha256Hex,stableStringify } from "./canonical";
import { corePrompt } from "./core.test-fixtures";

describe("bounded untrusted JSON and format detection",()=>{
  it("rejects prototype keys at every level and returns typed issues",()=>{
    for(const key of ["__proto__","constructor","prototype"]){try{parseUntrustedJson(`{"nested":{"${key}":1}}`);throw new Error("expected rejection");}catch(error){expect(error).toBeInstanceOf(ComfyValidationError);expect((error as ComfyValidationError).issues[0].code).toBe("forbidden-key");}}
    expect(({} as {polluted?:boolean}).polluted).toBeUndefined();
  });
  it("uses UTF-8 byte limits, string limits and nesting limits",()=>{
    expect(()=>parseUntrustedJson('"中文"',{maxBytes:6})).toThrow("byte");
    expect(()=>parseUntrustedJson('"abcd"',{maxStringChars:3})).toThrow("string");
    expect(()=>parseUntrustedJson('{"a":{"b":1}}',{maxDepth:1})).toThrow("nesting");
    expect(()=>parseUntrustedJson('[1,2,3]',{maxNodes:3})).toThrow("count");
    expect(parseUntrustedJson('\ufeff{"ok":true}')).toEqual({ok:true});
  });
  it("rejects non-JSON values/cycles without running accessors from parsed imports",()=>{
    expect(()=>assertUntrustedValue({number:Infinity})).toThrow();expect(()=>assertUntrustedValue({bad:undefined})).toThrow();
    const value:Record<string,unknown>={};value.self=value;expect(()=>assertUntrustedValue(value)).toThrow("Cyclic");
  });
  it("detects API/UI/submission/history/image metadata but refuses ambiguous histories",()=>{
    const prompt=corePrompt(),ui={nodes:[],links:[]};
    expect(detectComfyPayload(prompt)).toMatchObject({kind:"api",format:"api",payload:prompt});
    expect(detectComfyPayload(ui).kind).toBe("ui");
    expect(detectComfyPayload({prompt}).kind).toBe("wrapped");
    expect(detectComfyPayload({id:{prompt:[0,"id",prompt,{}]}}).payload).toEqual(prompt);
    expect(payloadFromImageMetadata({prompt:JSON.stringify(prompt),workflow:JSON.stringify(ui)}).format).toBe("api");
    expect(detectComfyPayload({a:{prompt:[0,"a",prompt]},b:{prompt:[1,"b",prompt]}}).kind).toBe("unknown");
    expect(detectComfyPayload({parameters:"not a ComfyUI prompt"}).kind).toBe("unknown");
  });
});
describe("portable deterministic SHA256",()=>{
  it.each(["","abc","中文与emoji 🧪","x".repeat(200000)].map(text=>({text,length:text.length})))("matches node crypto for $length characters",({text})=>{
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });
  it("canonicalizes object key order without reordering arrays or mutating objects",()=>{
    const input={z:3,a:{b:1,a:2},x:[2,1]};expect(stableStringify(input)).toBe('{"a":{"a":2,"b":1},"x":[2,1],"z":3}');expect(Object.keys(input)).toEqual(["z","a","x"]);
  });
});
