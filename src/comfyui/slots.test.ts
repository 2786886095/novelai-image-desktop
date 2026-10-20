import { describe,it,expect } from "vitest";
import { applySlotValues,detectSlots,seedBounds,resolveStaticScalar } from "./slots";
import { coreCatalog,corePrompt } from "./core.test-fixtures";
import { ComfyValidationError } from "./format-detect";

describe("exact-site workflow parameter slots",()=>{
  it("detects separate loaders plus parameters and positive/negative prompts",()=>{
    const slots=detectSlots(corePrompt(),coreCatalog);
    expect(slots.filter(slot=>slot.kind==="model").map(slot=>slot.role).sort()).toEqual(["diffusion","text-encoder","vae"]);
    expect(slots.find(slot=>slot.id==="positive:4:text")?.defaultValue).toBe("positive text");expect(slots.find(slot=>slot.id==="negative:5:text")?.defaultValue).toBe("negative text");
    expect(slots.some(slot=>slot.input==="filename_prefix")).toBe(false);expect(slots.find(slot=>slot.id==="seed:7:seed")?.max).toBe(Number.MAX_SAFE_INTEGER);
    expect(slots.find(slot=>slot.nodeId==="2"&&slot.input==="type")?.options).toContain("krea2");
  });
  it("applies scalar edits immutably to exact sites without silently clipping",()=>{
    const prompt=corePrompt(),slots=detectSlots(prompt,coreCatalog),before=JSON.stringify(prompt);
    const changed=applySlotValues(prompt,slots,{"positive:4:text":"changed","steps:7:steps":5,"model:1:unet_name":"other.safetensors"},coreCatalog);
    expect(changed["4"].inputs.text).toBe("changed");expect(changed["7"].inputs.steps).toBe(5);expect(JSON.stringify(prompt)).toBe(before);
    expect(()=>applySlotValues(prompt,slots,{"steps:7:steps":0},coreCatalog)).toThrow(ComfyValidationError);
    expect(()=>applySlotValues(prompt,slots,{"model:1:unet_name":"missing"},coreCatalog)).toThrow();
    expect(()=>applySlotValues(prompt,slots,{"seed:7:seed":Number.MAX_SAFE_INTEGER+1},coreCatalog)).toThrow();
  });
  it("rejects unknown/stale keys, non-scalars and slot-site class mismatches",()=>{
    const prompt=corePrompt(),slots=detectSlots(prompt,coreCatalog);
    expect(()=>applySlotValues(prompt,slots,{"filename:9:filename_prefix":"injected"},coreCatalog)).toThrow("unknown");
    expect(()=>applySlotValues(prompt,slots,{"positive:4:text":{} as never},coreCatalog)).toThrow("scalar");
    prompt["4"].class_type="PrimitiveStringMultiline";expect(()=>applySlotValues(prompt,slots,{"positive:4:text":"stale"},coreCatalog)).toThrow("no longer");
  });
  it("traces conditioning combinations and primitive-backed prompts without duplicating a shared site",()=>{
    const prompt=corePrompt();prompt.primitive={class_type:"PrimitiveStringMultiline",inputs:{value:"real source"}};prompt["4"].inputs.text=["primitive",0];
    prompt.combine={class_type:"ConditioningCombine",inputs:{conditioning_1:["4",0],conditioning_2:["5",0]}};prompt["7"].inputs.positive=["combine",0];
    const slots=detectSlots(prompt,coreCatalog);expect(slots.find(slot=>slot.id==="positive:primitive:value")?.defaultValue).toBe("real source");
    expect(slots.filter(slot=>slot.nodeId==="5"&&slot.input==="text")).toHaveLength(1);
  });
  it("does not invent editable negative text for a zeroed-positive branch",()=>{
    const prompt=corePrompt();delete prompt["5"];prompt.zero={class_type:"ConditioningZeroOut",inputs:{conditioning:["4",0]}};prompt["7"].inputs.negative=["zero",0];
    const slots=detectSlots(prompt,coreCatalog);expect(slots.filter(slot=>slot.kind==="negative")).toEqual([]);expect(slots.filter(slot=>slot.kind==="positive")).toHaveLength(1);
  });
  it("marks linked text as an explicit override instead of replacing it by default",()=>{
    const prompt=corePrompt();prompt["4"].inputs.text=["derived",0];prompt.derived={class_type:"SomeTextGenerator",inputs:{}};
    const slots=detectSlots(prompt,coreCatalog),slot=slots.find(slot=>slot.id==="positive:4:text")!;
    expect(slot.defaultValue).toBeNull();expect(slot.linkedFrom).toEqual({nodeId:"derived",classType:"SomeTextGenerator"});
    expect(applySlotValues(prompt,slots,{},coreCatalog)["4"].inputs.text).toEqual(["derived",0]);
    expect(applySlotValues(prompt,slots,{[slot.id]:"explicit override"},coreCatalog)["4"].inputs.text).toBe("explicit override");
  });
  it("applies parent-provided labels/kinds and bounded seed representation",()=>{
    const slots=detectSlots(corePrompt(),coreCatalog,{"4:text":{label:"Parent prompt"}});expect(slots.find(slot=>slot.nodeId==="4")?.label).toBe("Parent prompt");
    expect(seedBounds({min:-10,max:18446744073709551615})).toEqual({min:0,max:Number.MAX_SAFE_INTEGER});
  });
  it("resolves documented core primitive defaults without rewriting links or evaluating unknown nodes",()=>{
    const prompt=corePrompt();prompt.seed={class_type:"PrimitiveInt",inputs:{value:4321}};prompt["7"].inputs.seed=["seed",0];
    const slots=detectSlots(prompt,coreCatalog),slot=slots.find(slot=>slot.kind==="seed")!;
    expect(slot.defaultValue).toBe(4321);expect(slot.linkedFrom?.nodeId).toBe("seed");expect(prompt["7"].inputs.seed).toEqual(["seed",0]);
    expect(resolveStaticScalar(prompt,prompt["7"].inputs.seed,coreCatalog)).toBe(4321);
    expect(resolveStaticScalar(prompt,["unknown",0],coreCatalog)).toBeNull();prompt.seed.inputs.value=["seed",0];expect(resolveStaticScalar(prompt,["seed",0],coreCatalog)).toBeNull();
    prompt.condition={class_type:"PrimitiveBoolean",inputs:{value:true}};prompt.switch={class_type:"ComfySwitchNode",inputs:{switch:["condition",0],on_true:["condition",0],on_false:false}};
    expect(resolveStaticScalar(prompt,["switch",0],coreCatalog)).toBe(true);
  });
});
