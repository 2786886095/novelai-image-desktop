import {describe,expect,it} from 'vitest';
import {convertUiWorkflow,isUiWorkflow,UI_VIRTUAL_TYPES} from './ui-workflow';
import {normalizeObjectInfo,type ComfyCatalog} from './object-info';
import type {ComfyIssueCode} from './contract';

type Node=Record<string,unknown>;
const port=(name:string,type:string,link:number|null=null)=>({name,type,link});
const node=(id:number,type:string,values:unknown[]=[],inputs:unknown[]=[],extra:Node={}):Node=>({id,type,mode:0,inputs,outputs:[{name:'output',type:'IMAGE',links:[]}],widgets_values:values,...extra});
const link=(id:number,source:number,output:number,target:number,input:number,type='IMAGE')=>[id,source,output,target,input,type];
const save=(id=2,linkId=1)=>node(id,'Save',['fixture'],[port('images','IMAGE',linkId)]);
const graph=(nodes:Node[],links:unknown[],extra:Node={})=>({nodes,links,...extra});
const definition=(required:Record<string,unknown>,outputs:string[],output_node=false)=>({input:{required},input_order:{required:Object.keys(required)},output:outputs,python_module:'nodes',output_node});
function catalog():ComfyCatalog {
  return normalizeObjectInfo({
    Image:definition({},['IMAGE']),
    Save:definition({images:['IMAGE'],filename_prefix:['STRING',{default:'fixture'}]},[],true),
    StringImage:definition({text:['STRING',{multiline:true}]},['IMAGE']),
    IntImage:definition({seed:['INT',{control_after_generate:true}]},['IMAGE']),
    FloatImage:definition({value:['FLOAT']},['IMAGE']),
    ImageIdentity:definition({images:['IMAGE']},['IMAGE']),
    ImagePair:definition({first:['IMAGE'],second:['IMAGE']},['IMAGE','IMAGE']),
    PrimitiveBoolean:definition({value:['BOOLEAN']},['BOOLEAN']),
    PrimitiveInt:definition({value:['INT']},['INT']),
    PrimitiveString:definition({value:['STRING']},['STRING']),
    UnknownBoolean:definition({},['BOOLEAN']),
    ComfySwitchNode:definition({on_false:['*'],on_true:['*'],switch:['BOOLEAN']},['*']),
    Upload:definition({image:[['fixture.png'],{image_upload:true}]},['IMAGE']),
    Loader:definition({ckpt_name:[['present.safetensors']]},['IMAGE']),
    Dynamic:definition({mode:['COMFY_DYNAMICCOMBO_V3']},['IMAGE']),
  });
}
function basic(first=node(1,'Image')){return graph([first,save()],[link(1,1,0,2,0)]);}
const codes=(value:ReturnType<typeof convertUiWorkflow>)=>value.issues.filter(item=>item.severity==='block').map(item=>item.code);
function blocked(value:ReturnType<typeof convertUiWorkflow>,code:ComfyIssueCode){expect(value.prompt).toBeNull();expect(codes(value)).toContain(code);}
function accounted(value:ReturnType<typeof convertUiWorkflow>,count:number){expect(value.conversion.totals).toEqual({input:count,accounted:count});expect(value.conversion.nodes).toHaveLength(count);expect(Object.values(value.conversion.fates).reduce((a,b)=>a+(b??0),0)).toBe(count);expect(value.conversion.verified).toBe(false);expect(value.unverified).toBe(true);}

function subgraphFixture(){
  const inner={id:'subgraph',inputs:[{name:'text',label:'positive_prompt',type:'STRING'}],outputs:[{name:'image',type:'IMAGE'}],nodes:[node(10,'StringImage',['inside'],[port('text','STRING',11)])],links:[{id:11,origin_id:-10,origin_slot:0,target_id:10,target_slot:0,type:'STRING'},{id:12,origin_id:10,origin_slot:0,target_id:-20,target_slot:0,type:'IMAGE'}]};
  const instance=node(1,'subgraph',['outside'],[port('text','STRING')]);
  return {inner,instance,ui:graph([instance,save()],[link(1,1,0,2,0)],{definitions:{subgraphs:[inner]}})};
}
function branchFixture(){
  return graph([
    node(1,'PrimitiveBoolean',[false],[],{outputs:[{type:'BOOLEAN'}]}),node(2,'Image'),node(3,'Image'),
    node(4,'ComfySwitchNode',[false],[port('on_false','IMAGE',1),port('on_true','IMAGE',2),port('switch','BOOLEAN',3)]),save(5,4),
  ],[link(1,2,0,4,0),link(2,3,0,4,1),link(3,1,0,4,2,'BOOLEAN'),link(4,4,0,5,0)]);
}

describe('untrusted UI workflow conversion, not official graphToPrompt equivalence',()=>{
  it('detects UI format without treating an API dictionary as UI',()=>{expect(isUiWorkflow(basic())).toBe(true);expect(isUiWorkflow({'1':{class_type:'Image',inputs:{}}})).toBe(false);expect([...UI_VIRTUAL_TYPES]).toEqual(['Reroute','PrimitiveNode','Note','MarkdownNote']);});
  it('serializes common API inputs with old array links and marks conversion unverified',()=>{
    const value=convertUiWorkflow(basic(node(1,'StringImage',['a tree'])),catalog());expect(value.prompt).toEqual({'1':{class_type:'StringImage',inputs:{text:'a tree'}},'2':{class_type:'Save',inputs:{images:['1',0],filename_prefix:'fixture'}}});accounted(value,2);expect(codes(value)).toEqual([]);expect(value.issues.some(item=>item.code==='conversion-unverified'&&item.severity==='confirm')).toBe(true);
  });
  it('accepts new object-form links using exact source/target slots',()=>{
    const ui=basic();ui.links=[{id:1,origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:'IMAGE'}];expect(convertUiWorkflow(ui,catalog()).prompt?.['2'].inputs.images).toEqual(['1',0]);
  });
  it('preserves prompt literals and warns rather than emulating random prompt expansion',()=>{
    const result=convertUiWorkflow(basic(node(1,'StringImage',['{red|blue} bird'])),catalog());expect(result.prompt?.['1'].inputs.text).toBe('{red|blue} bird');expect(result.issues.some(item=>item.code==='dynamic-prompt-syntax'&&item.severity==='warn')).toBe(true);
  });
  it('consumes seed control placeholders but never forwards them to the API',()=>{
    const result=convertUiWorkflow(basic(node(1,'IntImage',[123,'randomize'])),catalog());expect(result.prompt?.['1'].inputs).toEqual({seed:123});expect(codes(result)).toEqual([]);
    expect(convertUiWorkflow(basic(node(1,'IntImage',[123])),catalog()).prompt?.['1'].inputs.seed).toBe(123);
    expect(convertUiWorkflow(basic(node(1,'IntImage',[],[],{widgets_values_named:{seed:123,control_after_generate:'randomize'}})),catalog()).prompt?.['1'].inputs).toEqual({seed:123});
    blocked(convertUiWorkflow(basic(node(1,'IntImage',[],[],{widgets_values_named:{seed:123,control_after_generate:'arbitrary'}})),catalog()),'widget-mapping');
  });
  it('consumes the known image upload placeholder only when the schema permits it',()=>{
    expect(convertUiWorkflow(basic(node(1,'Upload',['fixture.png','image'])),catalog()).prompt?.['1'].inputs).toEqual({image:'fixture.png'});
    blocked(convertUiWorkflow(basic(node(1,'Upload',['fixture.png','unrecognized-placeholder'])),catalog()),'widget-mapping');
  });
  it('supports exact named widget dictionaries and rejects unknown keys',()=>{
    const good=node(1,'StringImage',[],[],{widgets_values:{text:'named'}});expect(convertUiWorkflow(basic(good),catalog()).prompt?.['1'].inputs.text).toBe('named');
    blocked(convertUiWorkflow(basic(node(1,'StringImage',[],[],{widgets_values:{other:'text'}})),catalog()),'widget-mapping');
  });
  it('does not auto-fill missing widgets, coerce types, or silently drop extra widget values',()=>{
    for(const values of [[],[true],['text','extra']])blocked(convertUiWorkflow(basic(node(1,'StringImage',values)),catalog()),'widget-mapping');
  });
  it('leaves missing model options visible for the analysis/repair flow',()=>{
    const result=convertUiWorkflow(basic(node(1,'Loader',['not-installed.safetensors'])),catalog());expect(result.prompt?.['1'].inputs.ckpt_name).toBe('not-installed.safetensors');expect(codes(result)).toEqual([]);
  });
  it('warns if input_order is absent while using deterministic object key order',()=>{
    const raw={input:{required:{text:['STRING']}},output:['IMAGE'],output_node:false,python_module:'nodes'};const live={...catalog(),...normalizeObjectInfo({StringImage:raw})};const result=convertUiWorkflow(basic(node(1,'StringImage',['captured'])),live);expect(result.prompt?.['1'].inputs.text).toBe('captured');expect(result.issues.some(item=>item.code==='node-unverified')).toBe(true);
  });
  it('resolves frontend Reroute and accounts for it',()=>{
    const ui=graph([node(1,'Image'),node(3,'Reroute',[],[port('input','IMAGE',1)]),save(2,2)],[link(1,1,0,3,0),link(2,3,0,2,0)]);const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['2'].inputs.images).toEqual(['1',0]);expect(result.prompt?.['3']).toBeUndefined();accounted(result,3);expect(result.conversion.fates['reroute-resolved']).toBe(1);
  });
  it('inlines only the frontend PrimitiveNode into an actual widget',()=>{
    const ui=graph([node(9,'PrimitiveNode',['from primitive']),node(1,'StringImage',['old'],[port('text','STRING',2)]),save()],[link(2,9,0,1,0,'STRING'),link(1,1,0,2,0)]);const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['1'].inputs.text).toBe('from primitive');expect(result.prompt?.['9']).toBeUndefined();accounted(result,3);
    const wrong=graph([node(9,'PrimitiveNode',['not image']),save(2,1)],[link(1,9,0,2,0)]);blocked(convertUiWorkflow(wrong,catalog()),'widget-mapping');
  });
  it('does not mistake new backend PrimitiveString nodes for frontend PrimitiveNode',()=>{
    const ui=graph([node(9,'PrimitiveString',['backend']),node(1,'StringImage',['old'],[port('text','STRING',2)]),save()],[link(2,9,0,1,0,'STRING'),link(1,1,0,2,0)]);const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['9'].class_type).toBe('PrimitiveString');expect(result.prompt?.['1'].inputs.text).toEqual(['9',0]);
  });
  it('drops Note/MarkdownNote explicitly and accounts for every node',()=>{
    const ui=basic();ui.nodes.push(node(8,'Note',['annotation']),node(9,'MarkdownNote',['markdown']));const result=convertUiWorkflow(ui,catalog());accounted(result,4);expect(result.conversion.fates['virtual-dropped']).toBe(2);
  });
  it('rejects unknown frontend extension virtual nodes rather than pretending to install or convert them',()=>{
    const ui=basic();ui.nodes.push(node(7,'SetNode'));const result=convertUiWorkflow(ui,catalog());blocked(result,'missing-node-type');accounted(result,3);expect(result.issues.some(item=>item.message.includes('SetNode'))).toBe(true);
  });
  it('rejects legacy groupNodes and unsupported execution modes',()=>{
    blocked(convertUiWorkflow({...basic(),extra:{groupNodes:{custom:{}}}},catalog()),'group-node');for(const mode of [1,3])blocked(convertUiWorkflow(basic(node(1,'Image',[],[],{mode})),catalog()),'unsupported-mode');
  });
  it('removes muted nodes and reports a required downstream dependency',()=>{
    const result=convertUiWorkflow(basic(node(1,'Image',[],[],{mode:2})),catalog());blocked(result,'muted-dependency');accounted(result,2);expect(result.conversion.fates.muted).toBe(1);
  });
  it('bypasses by matching output order and type rather than arbitrary first input',()=>{
    const ui=graph([node(1,'Image'),node(2,'Image'),node(3,'ImagePair',[],[port('first','IMAGE',1),port('second','IMAGE',2)],{mode:4,outputs:[{type:'IMAGE'},{type:'IMAGE'}]}),save(4,3)],[link(1,1,0,3,0),link(2,2,0,3,1),link(3,3,1,4,0)]);const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['4'].inputs.images).toEqual(['2',0]);expect(result.prompt?.['3']).toBeUndefined();accounted(result,4);
  });
  it('rejects dangling references, bad output indices and incompatible link types',()=>{
    const ui=basic();ui.links=[link(1,99,0,2,0)];blocked(convertUiWorkflow(ui,catalog()),'invalid-link');
    const out=basic();out.links=[link(1,1,4,2,0)];blocked(convertUiWorkflow(out,catalog()),'invalid-link');
    blocked(convertUiWorkflow(basic(node(1,'PrimitiveInt',[2])),catalog()),'link-type-mismatch');
  });
  it('rejects API dependency cycles and routing cycles without recursion overflow',()=>{
    const ui=graph([node(1,'ImageIdentity',[],[port('images','IMAGE',1)]),node(2,'ImageIdentity',[],[port('images','IMAGE',2)]),save(3,3)],[link(1,2,0,1,0),link(2,1,0,2,0),link(3,1,0,3,0)]);blocked(convertUiWorkflow(ui,catalog()),'cycle');
    const reroute=graph([node(1,'Reroute',[],[port('input','IMAGE',1)]),node(2,'Reroute',[],[port('input','IMAGE',2)]),save(3,3)],[link(1,2,0,1,0),link(2,1,0,2,0),link(3,1,0,3,0)]);blocked(convertUiWorkflow(reroute,catalog()),'cycle');
  });
  it('expands subgraph inputs/outputs with namespaced ids and parent values',()=>{
    const {ui}=subgraphFixture();const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['1:10'].inputs.text).toBe('outside');expect(result.prompt?.['2'].inputs.images).toEqual(['1:10',0]);expect(result.slotHints['1:10:text']).toMatchObject({label:'positive_prompt',kind:'positive'});accounted(result,3);
  });
  it('honors named parent values over stale array and inner defaults',()=>{
    const {ui,instance}=subgraphFixture();instance.widgets_values_named={text:'named parent'};const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['1:10'].inputs.text).toBe('named parent');
  });
  it('gives connected external input priority over captured parent widgets',()=>{
    const {ui,instance}=subgraphFixture();instance.inputs=[port('text','STRING',2)];ui.nodes.push(node(9,'PrimitiveNode',['connected parent']));ui.links.push(link(2,9,0,1,0,'STRING'));expect(convertUiWorkflow(ui,catalog()).prompt?.['1:10'].inputs.text).toBe('connected parent');
  });
  it('expands nested subgraphs while preserving explicit boundary values and ids',()=>{
    const {inner}=subgraphFixture();
    const middle={id:'middle',inputs:[{name:'text',type:'STRING'}],outputs:[{name:'image',type:'IMAGE'}],nodes:[node(4,'subgraph',['stale middle'],[port('text','STRING',21)])],links:[{id:21,origin_id:-10,origin_slot:0,target_id:4,target_slot:0,type:'STRING'},{id:22,origin_id:4,origin_slot:0,target_id:-20,target_slot:0,type:'IMAGE'}]};
    const ui=graph([node(1,'middle',['outermost'],[port('text','STRING')]),save()],[link(1,1,0,2,0)],{definitions:{subgraphs:[inner,middle]}});
    const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['1:4:10'].inputs.text).toBe('outermost');expect(result.prompt?.['2'].inputs.images).toEqual(['1:4:10',0]);accounted(result,4);
  });
  it('fails closed at recursive subgraph depth limits without unbounded expansion',()=>{
    const inner={id:'recursive',inputs:[],outputs:[{name:'image',type:'IMAGE'}],nodes:[node(1,'recursive')],links:[{id:1,origin_id:1,origin_slot:0,target_id:-20,target_slot:0,type:'IMAGE'}]};
    const result=convertUiWorkflow(graph([node(1,'recursive'),save()],[link(1,1,0,2,0)],{definitions:{subgraphs:[inner]}}),catalog());blocked(result,'conversion-error');expect(result.conversion.nodes.length).toBeLessThan(25);
  });
  it('maps explicit proxyWidgets without guessing and retains inner values for an empty proxy capture',()=>{
    const {ui,instance}=subgraphFixture();instance.properties={proxyWidgets:[['10','text']]};instance.widgets_values=['proxy parent'];expect(convertUiWorkflow(ui,catalog()).prompt?.['1:10'].inputs.text).toBe('proxy parent');
    instance.widgets_values=[];const inner=convertUiWorkflow(ui,catalog());expect(inner.prompt?.['1:10'].inputs.text).toBe('inside');expect(inner.issues.some(item=>item.code==='inner-value-used')).toBe(true);
    instance.properties={proxyWidgets:[['missing','text']]};instance.widgets_values=['new'];blocked(convertUiWorkflow(ui,catalog()),'subgraph-values');
  });
  it('accounts for muted subgraph descendants, never silently loses their existence',()=>{
    const {ui,instance}=subgraphFixture();instance.mode=2;const result=convertUiWorkflow(ui,catalog());blocked(result,'muted-dependency');accounted(result,3);expect(result.conversion.fates.muted).toBe(2);
  });
  it('rejects a subgraph output with multiple sources and ambiguous proxy values',()=>{
    const {ui,inner}=subgraphFixture();inner.links.push({id:13,origin_id:10,origin_slot:0,target_id:-20,target_slot:0,type:'IMAGE'});blocked(convertUiWorkflow(ui,catalog()),'subgraph-values');
    const fixture=subgraphFixture();fixture.instance.properties={proxyWidgets:[['10','text']]};fixture.instance.widgets_values=['one','extra'];blocked(convertUiWorkflow(fixture.ui,catalog()),'widget-mapping');
  });
  it('folds only proven boolean ComfySwitchNode branches and exposes the actual control slot',()=>{
    const result=convertUiWorkflow(branchFixture(),catalog());expect(Object.keys(result.prompt??{}).sort()).toEqual(['2','5']);expect(result.prompt?.['5'].inputs.images).toEqual(['2',0]);expect(result.branchSlots).toMatchObject([{id:'branch:1:value',kind:'branch',defaultValue:false,controls:['4']}]);expect(result.prunedNodes).toContainEqual({nodeId:'4',classType:'ComfySwitchNode',reason:'switch-collapsed'});accounted(result,5);
  });
  it('recompiles branch overrides from source rather than patching a pruned graph',()=>{
    const result=convertUiWorkflow(branchFixture(),catalog(),{slotValues:{'branch:1:value':true}});expect(Object.keys(result.prompt??{}).sort()).toEqual(['3','5']);expect(result.prompt?.['5'].inputs.images).toEqual(['3',0]);
    blocked(convertUiWorkflow(branchFixture(),catalog(),{slotValues:{'branch:1:value':'true'}}),'slot-value');
  });
  it('exposes a direct switch widget and does not evaluate unknown boolean backend code',()=>{
    const ui=branchFixture();(ui.nodes[3].inputs as ReturnType<typeof port>[])[2].link=null;ui.links=ui.links.filter(item=>(item as number[])[0]!==3);expect(convertUiWorkflow(ui,catalog()).branchSlots[0]?.id).toBe('branch:4:switch');
    const unknown=branchFixture();unknown.nodes[0]=node(1,'UnknownBoolean');blocked(convertUiWorkflow(unknown,catalog()),'switch-unresolved');
  });
  it('does not let an unselected dynamic widget branch break an explicitly false branch',()=>{
    const ui=branchFixture();ui.nodes[2]=node(3,'Dynamic',[]);const result=convertUiWorkflow(ui,catalog());expect(result.prompt?.['2']).toBeTruthy();expect(codes(result)).toEqual([]);expect(result.prunedNodes.some(item=>item.nodeId==='3')).toBe(true);
    blocked(convertUiWorkflow(ui,catalog(),{slotValues:{'branch:1:value':true}}),'widget-mapping');
  });
  it('rejects poisoned, cyclic or non-UI input before conversion',()=>{
    blocked(convertUiWorkflow(JSON.parse('{"nodes":[],"links":[],"__proto__":{}}'),catalog()),'forbidden-key');const cyclic:Record<string,unknown>={nodes:[],links:[]};cyclic.self=cyclic;blocked(convertUiWorkflow(cyclic,catalog()),'invalid-json');blocked(convertUiWorkflow({nodes:[]},catalog()),'unknown-format');
  });
  it('accounts for malformed and duplicate nodes in its failed report',()=>{
    const ui=basic();ui.nodes.push(node(1,'Image'),{type:'Image'});const result=convertUiWorkflow(ui,catalog());blocked(result,'conversion-error');accounted(result,4);
  });
  it('limits raw malformed nodes as well as valid expanded nodes',()=>{
    const result=convertUiWorkflow(graph(Array.from({length:5001},()=>({type:'Image'})),[]),catalog());blocked(result,'too-large');expect(result.conversion.nodes.length).toBe(0);expect(result.conversion.totals.input).toBe(5001);
  });
});
