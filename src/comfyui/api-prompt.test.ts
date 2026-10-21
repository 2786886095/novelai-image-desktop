import { describe,it,expect } from "vitest";
import { assertSubmittablePrompt,isLinkRef,thirdPartyCanonical,validateApiPrompt } from "./api-prompt";
import { normalizeObjectInfo } from "./object-info";
import { coreCatalog,corePrompt } from "./core.test-fixtures";

describe("runtime API graph validation",()=>{
  it("validates a real-shaped nine-node graph without modifying it",()=>{
    const prompt=corePrompt(),before=JSON.stringify(prompt),result=validateApiPrompt(prompt,coreCatalog);
    expect(result.ok).toBe(true);expect(result.outputNodes).toEqual(["9"]);expect(result.missingModels).toEqual([]);expect(JSON.stringify(prompt)).toBe(before);
  });
  it("distinguishes missing local weights from invalid ordinary combo choices",()=>{
    const prompt=corePrompt();prompt["1"].inputs.unet_name="missing.safetensors";prompt["7"].inputs.scheduler="invented";
    const result=validateApiPrompt(prompt,coreCatalog);
    expect(result.ok).toBe(false);expect(result.missingModels[0]).toMatchObject({nodeId:"1",input:"unet_name",role:"diffusion",directoryHint:"diffusion_models"});
    expect(result.issues).toContainEqual(expect.objectContaining({code:"invalid-option",nodeId:"7",input:"scheduler"}));
    prompt["1"].inputs.unet_name="other.safetensors";prompt["7"].inputs.scheduler="simple";expect(validateApiPrompt(prompt,coreCatalog).ok).toBe(true);
  });
  it("rejects missing/unknown inputs, invalid scalar types and unsafe int seeds",()=>{
    const prompt=corePrompt();delete prompt["7"].inputs.steps;prompt["7"].inputs.cfg="4";prompt["7"].inputs.seed=Number.MAX_SAFE_INTEGER+1;prompt["7"].inputs.control_after_generate="randomize";
    const codes=validateApiPrompt(prompt,coreCatalog).issues.map(issue=>issue.code);
    expect(codes).toContain("missing-input");expect(codes).toContain("value-type");expect(codes).toContain("unknown-input");
  });
  it("checks links, slot bounds and output types rather than accepting any two-item array",()=>{
    const prompt=corePrompt();prompt["7"].inputs.model=["missing",0];prompt["7"].inputs.positive=["2",99];prompt["7"].inputs.negative=["2",0];prompt["7"].inputs.denoise=2;
    const codes=validateApiPrompt(prompt,coreCatalog).issues.map(issue=>issue.code);
    expect(codes.filter(code=>code==="invalid-link")).toHaveLength(2);expect(codes).toContain("link-type-mismatch");expect(codes).toContain("value-range");
    expect(isLinkRef(["1","0"])).toBe(false);expect(isLinkRef(["1",-1])).toBe(false);expect(isLinkRef(["1",0])).toBe(true);
  });
  it("finds cycles, absent outputs, missing node types and retained unreachable nodes",()=>{
    const prompt=corePrompt();prompt["8"].inputs.samples=["8",0];delete prompt["9"];prompt.unknown={class_type:"NotInstalled",inputs:{}};
    const result=validateApiPrompt(prompt,coreCatalog),codes=result.issues.map(issue=>issue.code);
    expect(codes).toContain("cycle");expect(codes).toContain("no-output-node");expect(codes).toContain("unreachable-node");expect(result.missingNodeTypes).toEqual(["NotInstalled"]);
  });
  it("blocks API/cloud nodes and fingerprints third-party/unknown origins for confirmation",()=>{
    const catalog={...coreCatalog,...normalizeObjectInfo({Cloud:{input:{required:{}},output:[],output_node:true,python_module:"comfy_api_nodes.vendor",api_node:true},Third:{input:{required:{}},output:[],output_node:true,python_module:"custom_nodes.vendor"},Unknown:{input:{required:{}},output:[],output_node:true}})};
    const result=validateApiPrompt({a:{class_type:"Cloud",inputs:{}},b:{class_type:"Third",inputs:{}},c:{class_type:"Unknown",inputs:{}}},catalog);
    expect(result.cloudNodes).toEqual([{nodeId:"a",classType:"Cloud"}]);expect(result.ok).toBe(false);expect(result.thirdParty).toHaveLength(2);
    expect(thirdPartyCanonical(result.thirdParty)).toBe(thirdPartyCanonical([...result.thirdParty].reverse()));
    expect(result.issues).toContainEqual(expect.objectContaining({code:"unknown-node-origin",severity:"confirm"}));
  });
  it("reports remote enum uncertainty without pretending a local list exists",()=>{
    const catalog=normalizeObjectInfo({Remote:{input:{required:{image:["COMBO",{remote:{route:"/internal/files/output"}}]}},output:[],output_node:true,python_module:"nodes"}});
    const result=validateApiPrompt({one:{class_type:"Remote",inputs:{image:"output.png"}}},catalog);
    expect(result.ok).toBe(true);expect(result.issues[0]).toMatchObject({code:"remote-option-unverified",severity:"warn"});
  });
  it("validates selected dynamic-combo dotted inputs and rejects unproved representations",()=>{
    const catalog=normalizeObjectInfo({Dynamic:{input:{required:{sampling_mode:["COMFY_DYNAMICCOMBO_V3",{options:[{key:"on",inputs:{required:{temperature:["FLOAT",{min:0,max:2}]} }},{key:"off",inputs:{required:{}}}]}]}},output:[],output_node:true,python_module:"comfy_extras.nodes_textgen"}});
    expect(validateApiPrompt({one:{class_type:"Dynamic",inputs:{sampling_mode:"on","sampling_mode.temperature":0.7}}},catalog).ok).toBe(true);
    expect(validateApiPrompt({one:{class_type:"Dynamic",inputs:{sampling_mode:"on"}}},catalog).issues).toContainEqual(expect.objectContaining({code:"missing-input",input:"sampling_mode.temperature"}));
    expect(validateApiPrompt({one:{class_type:"Dynamic",inputs:{sampling_mode:{key:"on"}}}},catalog).ok).toBe(false);
  });
  it("keeps prompt random syntax literal and reports derived/zero conditioning",()=>{
    const prompt=corePrompt();prompt["4"].inputs.text="{red|blue}";prompt.zero={class_type:"ConditioningZeroOut",inputs:{conditioning:["4",0]}};prompt["7"].inputs.negative=["zero",0];
    const result=validateApiPrompt(prompt,coreCatalog);expect(result.ok).toBe(true);expect(result.issues.map(issue=>issue.code)).toContain("dynamic-prompt-syntax");expect(result.issues.map(issue=>issue.code)).toContain("negative-zeroed");expect(prompt["4"].inputs.text).toBe("{red|blue}");
  });
  it("fails malformed executable shapes before catalog traversal",()=>{
    expect(()=>assertSubmittablePrompt({})).toThrow();expect(()=>assertSubmittablePrompt({"bad/id":{class_type:"SaveImage",inputs:{}}})).toThrow();
    expect(()=>assertSubmittablePrompt({a:{class_type:"SaveImage",inputs:{},exec:"not data"}})).toThrow();
    expect(()=>assertSubmittablePrompt(corePrompt(),{})).toThrow("not installed");
  });
  it("checks a statically provable primitive value against the downstream input range",()=>{
    const prompt=corePrompt();prompt.steps={class_type:"PrimitiveInt",inputs:{value:0}};prompt["7"].inputs.steps=["steps",0];
    expect(validateApiPrompt(prompt,coreCatalog).issues).toContainEqual(expect.objectContaining({code:"value-range",nodeId:"7",input:"steps"}));
  });
  it("handles a maximum-size DAG without recursive call-stack failure and rejects the next node",()=>{
    const catalog=normalizeObjectInfo({Source:{input:{required:{}},output:["STRING"],python_module:"nodes"},Relay:{input:{required:{text:["STRING",{forceInput:true}]}},output:["STRING"],python_module:"nodes"},Output:{input:{required:{text:["STRING",{forceInput:true}]}},output:[],output_node:true,python_module:"nodes"}});
    const prompt:Record<string,{class_type:string;inputs:Record<string,unknown>}>={};
    for(let index=0;index<4999;index++)prompt[String(index)]={class_type:index===0?"Output":"Relay",inputs:{text:[String(index+1),0]}};
    prompt["4999"]={class_type:"Source",inputs:{}};
    expect(validateApiPrompt(prompt,catalog).ok).toBe(true);
    prompt.extra={class_type:"Source",inputs:{}};expect(()=>assertSubmittablePrompt(prompt)).toThrow("5000");
  });
});
