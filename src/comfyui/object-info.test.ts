import { describe,it,expect } from "vitest";
import { isApiNodeDef,isCoreModule,isModelLikeInput,normalizeObjectInfo } from "./object-info";
import { coreCatalog } from "./core.test-fixtures";

describe("live object_info normalization",()=>{
  it("retains old nested and new COMBO choices independently per loader",()=>{
    expect(coreCatalog.UNETLoader.inputs.unet_name.options).toEqual(["model.safetensors","other.safetensors"]);
    expect(coreCatalog.CLIPLoader.inputs.clip_name.options).toEqual(["clip.safetensors"]);
    expect(coreCatalog.CLIPLoader.inputs.type.options).toContain("moss_image");
    expect(coreCatalog.KSampler.inputs.seed.controlAfterGenerate).toBe(true);
    expect(isModelLikeInput("clip_name",coreCatalog.CLIPLoader.inputs.clip_name,coreCatalog.CLIPLoader)).toBe(true);
    expect(isModelLikeInput("model",coreCatalog.KSampler.inputs.model,coreCatalog.KSampler)).toBe(false);
  });
  it("tracks exact order/hidden/forceInput/remote/image-upload without remote network access",()=>{
    const catalog=normalizeObjectInfo({Remote:{input:{required:{image:["COMBO",{remote:{route:"/internal/files/output"},image_upload:true}],text:["STRING",{forceInput:true}]},hidden:{prompt:"PROMPT"}},input_order:{required:["text","image"]},output:["IMAGE"],python_module:"nodes"}});
    expect(catalog.Remote.inputOrder).toEqual(["text","image"]);expect(catalog.Remote.hidden).toEqual(["prompt"]);
    expect(catalog.Remote.inputs.image).toMatchObject({type:"COMBO",remote:true,imageUpload:true});
    expect(catalog.Remote.inputs.image.options).toBeUndefined();expect(catalog.Remote.inputs.text.widget).toBe(false);
  });
  it("marks missing input_order unverified and does not mistake arbitrary namespaces for core",()=>{
    const catalog=normalizeObjectInfo({Custom:{input:{required:{value:["INT",{}]}},output:["INT"],python_module:"custom_nodes.nodes"}});
    expect(catalog.Custom.inputOrderExplicit).toBe(false);expect(isCoreModule(catalog.Custom.pythonModule)).toBe(false);
    expect(isCoreModule("comfy_extras.nodes_logic")).toBe(true);expect(isCoreModule("nodes.fake")).toBe(false);expect(isCoreModule(null)).toBe(false);
    expect(isApiNodeDef({...catalog.Custom,apiNode:false,pythonModule:"comfy_api_nodes.nodes_vendor"})).toBe(true);
  });
  it("rejects malformed catalog/options instead of quietly dropping node definitions",()=>{
    expect(()=>normalizeObjectInfo({})).toThrow();expect(()=>normalizeObjectInfo({Broken:{}})).toThrow();
    expect(()=>normalizeObjectInfo({Broken:{input:{required:{model:[[{untrusted:true}]]}}}})).toThrow("combo");
  });
});
