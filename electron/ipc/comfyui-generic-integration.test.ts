import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeComfyWorkflow } from './comfyui-analysis';
import { corePrompt, rawCoreCatalog } from '../../src/comfyui/core.test-fixtures';
import { COMFY_LIMITS } from '../../src/comfyui/contract';
import { normalizeObjectInfo } from '../../src/comfyui/object-info';
import type { StoredComfyWorkflow } from './comfyui-service';

function record(payload: unknown): StoredComfyWorkflow {
  return { id:'generic-main-fixture', name:'Synthetic generic node integration',
    createdAt:'2026-10-21T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z',
    sourceKind:'api-json',sourceFormat:'api',sourceSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    fileName:null,templateName:null,familyLabel:null,lastAnalysis:null,savedValues:{},payload };
}
function fixture(count=3) {
  const prompt=corePrompt();
  const required:Record<string,unknown>={images:['IMAGE',{}]};
  const inputs:Record<string,unknown>={images:['8',0]};
  for(let i=0;i<count;i++){required['tuning_'+i]=['FLOAT',{min:0,max:2}];inputs['tuning_'+i]=1;}
  const catalog={...rawCoreCatalog,SyntheticAdjustment:{input:{required},input_order:{required:Object.keys(required)},output:['IMAGE'],python_module:'nodes',display_name:'Fixture adjustment'}};
  prompt['10']={class_type:'SyntheticAdjustment',inputs,_meta:{title:'Independent tuning stage'}};
  prompt['9'].inputs.images=['10',0];
  return {prompt,catalog};
}

describe('generic slots through the production main-process compiler',()=>{
  it('reports deterministic generic budget omissions without changing hidden graph values',()=>{
    const {prompt,catalog}=fixture(300),before=structuredClone(prompt),item=record(prompt);
    const first=analyzeComfyWorkflow(item,catalog,'generic-budget',{});
    const second=analyzeComfyWorkflow(item,catalog,'generic-budget',{});
    expect(first.analysis.ok).toBe(true);
    expect(first.analysis.slots).toHaveLength(COMFY_LIMITS.slotCount);
    expect(first.analysis.issues.filter(issue=>issue.code==='generic-slots-limited')).toEqual([
      expect.objectContaining({severity:'info',message:expect.stringContaining('additional generic inputs retain their workflow values')})
    ]);
    expect(first.analysis.slots.map(slot=>slot.id)).toEqual(second.analysis.slots.map(slot=>slot.id));
    expect(first.prompt).toEqual(before);expect(prompt).toEqual(before);
    expect(first.analysis.slots.filter(slot=>slot.classType==='SyntheticAdjustment').every(slot=>slot.nodeTitle==='Independent tuning stage')).toBe(true);
  });
  it('writes one exact generic scalar site and preserves every other graph input',()=>{
    const {prompt,catalog}=fixture(),before=structuredClone(prompt);
    const result=analyzeComfyWorkflow(record(prompt),catalog,'generic-exact-site',{'parameter:10:tuning_1':0});
    expect(result.analysis.ok).toBe(true);
    const expected=structuredClone(before);expected['10'].inputs.tuning_1=0;
    expect(result.prompt).toEqual(expected);expect(prompt).toEqual(before);
    expect(result.values['parameter:10:tuning_1']).toBe(0);
  });
  it('keeps a vanished linked parameter draft visibly blocked until explicit cleanup',()=>{
    const {prompt,catalog}=fixture();
    const linkedCatalog={...catalog,FixtureNumber:{input:{required:{value:['FLOAT',{}]}},output:['FLOAT'],python_module:'nodes'}};
    prompt['11']={class_type:'FixtureNumber',inputs:{value:1}};
    prompt['10'].inputs.tuning_1=['11',0];
    const stale=analyzeComfyWorkflow(record(prompt),linkedCatalog,'generic-stale-link',{'parameter:10:tuning_1':0,'parameter:10:tuning_2':1.5});
    expect(stale.analysis.ok).toBe(false);
    expect(stale.analysis.issues.some(issue=>issue.code==='stale-slot')).toBe(true);
    expect(stale.prompt['10'].inputs.tuning_1).toEqual(['11',0]);
    expect(stale.prompt['10'].inputs.tuning_2).toBe(1.5);
    const cleaned=analyzeComfyWorkflow(record(prompt),linkedCatalog,'generic-stale-link',{'parameter:10:tuning_2':1.5});
    expect(cleaned.analysis.ok).toBe(true);
    expect(cleaned.prompt['10'].inputs.tuning_1).toEqual(['11',0]);
    expect(cleaned.prompt['10'].inputs.tuning_2).toBe(1.5);
  });
  it('does not treat a missing optional widget default as an instruction to add the input',()=>{
    const {prompt,catalog}=fixture();
    const extended={...catalog,SyntheticAdjustment:{...catalog.SyntheticAdjustment,input:{...catalog.SyntheticAdjustment.input,optional:{optional_tuning:['FLOAT',{default:1,min:0,max:2}]}}}};
    const result=analyzeComfyWorkflow(record(prompt),extended,'generic-optional',{});
    expect(result.analysis.ok).toBe(true);
    expect(result.analysis.slots.some(slot=>slot.nodeId==='10'&&slot.input==='optional_tuning')).toBe(false);
    expect(Object.hasOwn(result.prompt['10'].inputs,'optional_tuning')).toBe(false);
  });
  it('reserves final slot budget for a UI branch controller folded out of the API graph',()=>{
    const {prompt,catalog}=fixture(300),definitions=normalizeObjectInfo(catalog);
    prompt['11']={class_type:'PrimitiveBoolean',inputs:{value:true}};
    prompt['12']={class_type:'ComfySwitchNode',inputs:{switch:['11',0],on_false:['8',0],on_true:['10',0]}};
    prompt['9'].inputs.images=['12',0];
    const links:unknown[][]=[];let next=1;
    const nodes=Object.entries(prompt).map(([id,node])=>{
      const def=definitions[node.class_type];
      return {id:Number(id),type:node.class_type,mode:0,
        inputs:Object.entries(node.inputs).map(([name,value],index)=>{
          let link:number|null=null;
          if(Array.isArray(value)){link=next++;links.push([link,Number(value[0]),value[1],Number(id),index,def.inputs[name].type]);}
          return {name,type:def.inputs[name].type,link};
        }),outputs:def.outputs.map(type=>({type})),
        widgets_values_named:Object.fromEntries(Object.entries(node.inputs).filter(([,value])=>!Array.isArray(value)))};
    });
    const ui={nodes,links},item={...record(ui),sourceFormat:'ui' as const,sourceKind:'ui-json' as const};
    const result=analyzeComfyWorkflow(item,catalog,'generic-ui-final-budget',{});
    expect(result.analysis.issues.filter(issue=>issue.severity==='block')).toEqual([]);
    expect(result.analysis.slots).toHaveLength(COMFY_LIMITS.slotCount);
    expect(result.analysis.slots.filter(slot=>slot.kind==='branch')).toHaveLength(1);
    expect(result.prompt['11']).toBeUndefined();
    expect(result.analysis.issues).toContainEqual(expect.objectContaining({code:'generic-slots-limited',severity:'info'}));
  });
});
