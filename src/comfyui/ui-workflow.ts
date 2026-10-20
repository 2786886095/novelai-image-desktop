import {COMFY_LIMITS,type ComfyIssue,type ComfyIssueCode,type ComfyConversionSummary,type ComfyConversionNode,type ComfySlot,type ComfySlotValue,type ComfyPrunedNode,type ComfySlotKind} from './contract';
import {assertUntrustedValue,isPlainRecord,ComfyValidationError} from './format-detect';
import type {ComfyCatalog,ComfyInputSpec,ComfyNodeDef} from './object-info';
import type {ComfyApiPrompt} from './api-prompt';
import type {ComfySlotHints} from './slots';

/** Only these four are frontend-only. PrimitiveInt/String/etc remain real nodes. */
export const UI_VIRTUAL_TYPES=new Set(['Reroute','PrimitiveNode','Note','MarkdownNote']);
type Dict=Record<string,unknown>;
type UiLink={id:string;from:string;output:number;to:string;input:number;type:string};
type Resolved={link?:[string,number];value?:ComfySlotValue;type:string;unbound?:boolean;label?:string};
type Context={prefix:string;nodes:Map<string,Entry>;links:Map<string,UiLink>;definitions:Map<string,Dict>;depth:number;parent?:{entry:Entry;definition:Dict};subValues?:Map<string,ComfySlotValue>;proxyValues?:Map<string,ComfySlotValue>};
type Entry={id:string;raw:Dict;ctx:Context;type:string;def?:ComfyNodeDef;child?:Context;mode:number;report:ComfyConversionNode;widgets?:Map<string,ComfySlotValue>};
export interface ComfyConversionReport {
  prompt:ComfyApiPrompt|null;
  issues:ComfyIssue[];
  conversion:ComfyConversionSummary;
  unverified:true;
  slotHints:ComfySlotHints;
  branchSlots:ComfySlot[];
  prunedNodes:ComfyPrunedNode[];
}
export type ComfyUiConversionOptions={slotValues?:Record<string,ComfySlotValue>};
const rec=(value:unknown):Dict=>isPlainRecord(value)?value:{};
const arr=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const scalar=(value:unknown):value is ComfySlotValue=>typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);
const idText=(value:unknown):string|null=>(typeof value==='string'||typeof value==='number'&&Number.isInteger(value))&&/^[A-Za-z0-9_-]{1,64}$/.test(String(value))?String(value):null;
const typesMatch=(a:string,b:string)=>a==='*'||b==='*'||a===b;
const widgetType=(type:string)=>['STRING','INT','FLOAT','BOOLEAN','COMBO'].includes(type);
function valueMatches(value:unknown,type:string):value is ComfySlotValue {
  if(type==='INT')return typeof value==='number'&&Number.isFinite(value)&&Number.isInteger(value);
  if(type==='FLOAT')return typeof value==='number'&&Number.isFinite(value);
  if(type==='BOOLEAN')return typeof value==='boolean';
  if(type==='STRING')return typeof value==='string';
  if(type==='COMBO')return typeof value==='string'||typeof value==='number'&&Number.isFinite(value);
  return false;
}
export function isUiWorkflow(value:unknown):value is Dict&{nodes:unknown[];links:unknown[]} {return isPlainRecord(value)&&Array.isArray(value.nodes)&&Array.isArray(value.links);}

/**
 * Converts captured data, never executes frontend extensions. Widget association
 * must have one unambiguous serialization; unsupported data is an explicit block.
 * This is not an official frontend golden comparison and never sets verified=true.
 */
export function convertUiWorkflow(value:unknown,catalog:ComfyCatalog,options:ComfyUiConversionOptions={}):ComfyConversionReport {
  const issues:ComfyIssue[]=[],records:ComfyConversionNode[]=[],entries=new Map<string,Entry>();let inputTotal=0;
  const prompt:Record<string,{class_type:string;inputs:Record<string,unknown>;_meta?:{title:string}}>=Object.create(null);
  const slotHints:ComfySlotHints={},branchById=new Map<string,ComfySlot>(),prunedNodes:ComfyPrunedNode[]=[];
  const built=new Set<string>(),building=new Set<string>(),resolved=new Map<string,Resolved|undefined>();
  const issue=(code:ComfyIssueCode,message:string,entry?:Entry,severity:ComfyIssue['severity']='block',input?:string)=>{
    issues.push({code,severity,message,...(entry?{nodeId:entry.id,classType:entry.type}:{}),...(input?{input}:{})});
  };
  const fail=(entry:Entry,code:ComfyIssueCode,message:string,input?:string)=>{entry.report.fate='failed';entry.report.reason=message;issue(code,message,entry,'block',input);};
  const result=():ComfyConversionReport=>{
    const fates:ComfyConversionSummary['fates']={};for(const item of records)fates[item.fate]=(fates[item.fate]??0)+1;
    return {prompt:issues.some(item=>item.severity==='block')?null:prompt as ComfyApiPrompt,issues,conversion:{verified:false,totals:{input:inputTotal,accounted:records.length},fates,nodes:records},unverified:true,slotHints,branchSlots:[...branchById.values()],prunedNodes};
  };
  try {assertUntrustedValue(value);assertUntrustedValue(options.slotValues??{});}catch(error){
    if(error instanceof ComfyValidationError)issues.push(...error.issues);else issue('invalid-json',String(error));return result();
  }
  if(!isUiWorkflow(value)){issue('unknown-format','Expected a UI workflow with nodes and links. Export API format if this graph uses frontend extensions.');return result();}

  function parseLink(raw:unknown):UiLink|null {
    const source=Array.isArray(raw)?{id:raw[0],origin_id:raw[1],origin_slot:raw[2],target_id:raw[3],target_slot:raw[4],type:raw[5]}:rec(raw);
    const id=idText(source.id),from=idText(source.origin_id),to=idText(source.target_id);
    if(!id||!from||!to||!Number.isInteger(source.origin_slot)||Number(source.origin_slot)<0||!Number.isInteger(source.target_slot)||Number(source.target_slot)<0){issue('invalid-link','Malformed UI link; link ids and node/slot references must be explicit.');return null;}
    return {id,from,output:Number(source.origin_slot),to,input:Number(source.target_slot),type:typeof source.type==='string'?source.type:'*'};
  }
  function register(graph:Dict,prefix:string,depth:number,inheritedMode=0,parent?:Context['parent'],inheritedDefinitions=new Map<string,Dict>()):Context {
    const ctx:Context={prefix,nodes:new Map(),links:new Map(),definitions:new Map(inheritedDefinitions),depth,...(parent?{parent}:{})};
    inputTotal+=arr(graph.nodes).length;
    if(inputTotal>COMFY_LIMITS.workflowNodes){issue('too-large',`Expanded workflow exceeds ${COMFY_LIMITS.workflowNodes} nodes.`);return ctx;}
    const legacy=rec(graph.extra).groupNodes;
    if(legacy&&Object.keys(rec(legacy)).length||Array.isArray(legacy)&&legacy.length)issue('group-node','Legacy groupNodes are unsupported. Export the graph in API format.');
    for(const raw of arr(rec(graph.definitions).subgraphs)){
      const definition=rec(raw);const key=typeof definition.id==='string'?definition.id:null;
      if(!key||!Array.isArray(definition.nodes)||!Array.isArray(definition.links)){issue('conversion-error','Malformed subgraph definition.');continue;}
      if(ctx.definitions.has(key)&&ctx.definitions.get(key)!==definition)issue('conversion-error',`Duplicate subgraph definition ${key}.`);
      ctx.definitions.set(key,definition);
    }
    for(const raw of arr(graph.links)){const link=parseLink(raw);if(!link)continue;if(ctx.links.has(link.id))issue('invalid-link',`Duplicate UI link id ${prefix}${link.id}.`);else ctx.links.set(link.id,link);}
    let ordinal=0;
    for(const raw of arr(graph.nodes)){
      ordinal++;
      const node=rec(raw),localId=idText(node.id),type=typeof node.type==='string'?node.type:'';
      if(!localId||!type){records.push({execId:`${prefix}[invalid-${ordinal}]`,uiPath:prefix||'root',uiId:String(node.id??''),type,fate:'failed',reason:'Invalid id or type'});issue('conversion-error','Every UI node needs a valid unique id and a type.');continue;}
      const id=prefix+localId;
      if(entries.has(id)){records.push({execId:`${id}[duplicate-${ordinal}]`,uiPath:prefix||'root',uiId:localId,type,fate:'failed',reason:'Duplicate execution id'});issue('conversion-error',`Duplicate execution id ${id}.`);continue;}
      if(entries.size>=COMFY_LIMITS.workflowNodes){issue('too-large',`Expanded workflow exceeds ${COMFY_LIMITS.workflowNodes} nodes.`);break;}
      const mode=inheritedMode||Number(node.mode??0);
      const report:ComfyConversionNode={execId:id,uiPath:prefix||'root',uiId:localId,type,fate:'converted'};
      const entry:Entry={id,raw:node,type,ctx,mode,report,def:catalog[type]};entries.set(id,entry);ctx.nodes.set(localId,entry);records.push(report);
      if(mode===2){report.fate='muted';const definition=ctx.definitions.get(type);if(definition){if(depth>=COMFY_LIMITS.subgraphDepth)fail(entry,'conversion-error','Muted subgraph nesting exceeds the limit.');else entry.child=register(definition,id+':',depth+1,2,{entry,definition},ctx.definitions);}continue;}
      if(mode!==0&&mode!==4){fail(entry,'unsupported-mode',`Node mode ${mode} is unsupported. Export API format.`);continue;}
      if(localId==='-10'||localId==='-20'){report.fate='virtual-dropped';continue;}
      const definition=ctx.definitions.get(type);
      if(definition){
        report.fate=mode===4?'bypassed':'expanded-subgraph';
        if(depth>=COMFY_LIMITS.subgraphDepth){fail(entry,'conversion-error','Subgraph nesting exceeds the limit.');continue;}
        entry.child=register(definition,id+':',depth+1,mode===4?4:0,{entry,definition},ctx.definitions);
      }else if(mode===4)report.fate='bypassed';
      else if(type==='Note'||type==='MarkdownNote')report.fate='virtual-dropped';
      else if(type==='Reroute')report.fate='reroute-resolved';
      else if(type==='PrimitiveNode')report.fate='primitive-inlined';
      else if(!entry.def)fail(entry,'missing-node-type',`Node type ${type} is not in the local object_info and is not a supported virtual node. Install it manually or export API format.`);
    }
    for(const link of ctx.links.values()){
      if(!ctx.nodes.has(link.from)&&!(ctx.parent&&link.from==='-10'))issue('invalid-link',`Link ${prefix}${link.id} has unknown source ${link.from}.`);
      if(!ctx.nodes.has(link.to)&&!(ctx.parent&&link.to==='-20'))issue('invalid-link',`Link ${prefix}${link.id} has unknown destination ${link.to}.`);
    }
    return ctx;
  }

  function widgetMap(entry:Entry,specs:ComfyInputSpec[],source=entry.raw):Map<string,ComfySlotValue> {
    const named=source.widgets_values_named??(isPlainRecord(source.widgets_values)?source.widgets_values:undefined);
    if(named!==undefined&&named!==null){
      if(!isPlainRecord(named)){fail(entry,'widget-mapping','Named widget keys do not match this node schema. Export API format.');return new Map();}
      // Official captured widgets_values_named may include this frontend-only
      // companion. It is not an API input; accept only an unambiguous seed owner.
      const companions=new Set<string>();
      if(Object.prototype.hasOwnProperty.call(named,'control_after_generate')&&!specs.some(spec=>spec.name==='control_after_generate')&&specs.filter(spec=>spec.controlAfterGenerate||spec.type==='INT'&&/seed/i.test(spec.name)).length===1&&['fixed','randomize','increment','decrement'].includes(String(named.control_after_generate)))companions.add('control_after_generate');
      if(Object.keys(named).some(key=>!specs.some(spec=>spec.name===key)&&!companions.has(key))){fail(entry,'widget-mapping','Named widget keys do not match this node schema. Export API format.');return new Map();}
      const map=new Map<string,ComfySlotValue>();
      for(const [key,item]of Object.entries(named)){
        if(companions.has(key))continue;
        const spec=specs.find(candidate=>candidate.name===key)!;
        if(!valueMatches(item,spec.type)){fail(entry,'widget-mapping',`Named widget ${key} has the wrong type.`,key);continue;}map.set(key,item);
      }
      return map;
    }
    const values=source.widgets_values===undefined?[]:source.widgets_values;
    if(!Array.isArray(values)){fail(entry,'widget-mapping','widgets_values must be an array or an exact-name object.');return new Map();}
    const solutions:Map<string,ComfySlotValue>[]=[];
    const visit=(index:number,position:number,map:Map<string,ComfySlotValue>)=>{
      if(solutions.length>1)return;
      if(index===specs.length){if(position===values.length)solutions.push(new Map(map));return;}
      const spec=specs[index],item=values[position];
      if(spec.dynamic||spec.multiselect||!valueMatches(item,spec.type))return;
      map.set(spec.name,item);visit(index+1,position+1,map);
      const extra=values[position+1];
      if((spec.controlAfterGenerate||spec.type==='INT'&&/seed/i.test(spec.name))&&['fixed','randomize','increment','decrement'].includes(String(extra)))visit(index+1,position+2,map);
      if(spec.imageUpload&&(extra===null||['image','video','audio','file','upload'].includes(String(extra))))visit(index+1,position+2,map);
      map.delete(spec.name);
    };
    visit(0,0,new Map());
    if(solutions.length!==1){fail(entry,'widget-mapping',`Widget mapping is ${solutions.length?'ambiguous':'unsupported'}: expected ${specs.map(spec=>`${spec.name}:${spec.type}`).join(', ')}, received ${values.length} values. Export API format.`);return new Map();}
    return solutions[0];
  }

  function widgets(entry:Entry):Map<string,ComfySlotValue>{
    if(entry.widgets)return entry.widgets;
    const def=entry.def;if(!def)return new Map();
    if(!def.inputOrderExplicit)issue('node-unverified','object_info has no complete input_order; natural key order was used.',entry,'warn');
    const specs=def.inputOrder.map(name=>def.inputs[name]).filter(spec=>spec?.widget);
    entry.widgets=widgetMap(entry,specs);return entry.widgets;
  }

  function portSpec(port:Dict,name:string):ComfyInputSpec {
    return {name,type:typeof port.type==='string'?port.type:'*',required:true,widget:true,remote:false,controlAfterGenerate:false,imageUpload:false,multiline:false,forceInput:false,socketless:false,rawOptions:{},dynamic:false,multiselect:false};
  }
  function subValues(ctx:Context):void {
    if(ctx.subValues||!ctx.parent)return;
    const {entry,definition}=ctx.parent;ctx.subValues=new Map();ctx.proxyValues=new Map();
    const ports=arr(definition.inputs).map(rec),named=entry.raw.widgets_values_named??(isPlainRecord(entry.raw.widgets_values)?entry.raw.widgets_values:undefined);
    if(named!==undefined&&named!==null){
      const specs=ports.filter(port=>widgetType(String(port.type))).map(port=>portSpec(port,String(port.name)));
      ctx.subValues=widgetMap(entry,specs,{widgets_values_named:named});return;
    }
    const proxy=rec(entry.raw.properties).proxyWidgets;
    if(proxy!==undefined){
      if(!Array.isArray(proxy)){fail(entry,'subgraph-values','proxyWidgets has an unsupported shape. Export API format.');return;}
      const values=arr(entry.raw.widgets_values);
      if(!values.length){issue('inner-value-used','Subgraph has no parent proxy values; captured inner widget values are retained.',entry,'warn');return;}
      const specs:ComfyInputSpec[]=[];
      for(const item of proxy){
        if(!Array.isArray(item)||item.length!==2||typeof item[0]!=='string'&&typeof item[0]!=='number'||typeof item[1]!=='string') {fail(entry,'subgraph-values','Ambiguous proxyWidgets reference. Export API format.');return;}
        const target=entries.get(ctx.prefix+String(item[0])),spec=target?.def?.inputs[item[1]];
        if(!target||!spec?.widget){fail(entry,'subgraph-values',`Proxy ${String(item[0])}.${item[1]} is not an identifiable widget. Export API format.`);return;}
        specs.push({...spec,name:`${target.id}:${item[1]}`});
      }
      ctx.proxyValues=widgetMap(entry,specs,{widgets_values:values});return;
    }
    const specs=ports.filter(port=>widgetType(String(port.type))).map(port=>portSpec(port,String(port.name)));
    ctx.subValues=widgetMap(entry,specs);
  }
  function ownInput(entry:Entry,name:string):{port:Dict;index:number}|undefined {
    const ports=arr(entry.raw.inputs).map(rec),index=ports.findIndex(port=>port.name===name);
    return index<0?undefined:{port:ports[index],index};
  }
  function parentInput(ctx:Context,index:number,stack:Set<string>):Resolved|undefined {
    if(!ctx.parent)return undefined;
    const {entry,definition}=ctx.parent,port=rec(arr(definition.inputs)[index]);
    if(typeof port.name!=='string'){fail(entry,'subgraph-values',`Unknown subgraph input port ${index}.`);return undefined;}
    const external=ownInput(entry,port.name),label=typeof port.label==='string'?port.label:port.name;
    if(external&&external.port.link!==null&&external.port.link!==undefined){const source=linkedInput(entry,external,stack);return source?{...source,label}:undefined;}
    subValues(ctx);
    if(ctx.subValues?.has(port.name))return {type:String(port.type??'*'),value:ctx.subValues.get(port.name)!,label};
    return {type:String(port.type??'*'),unbound:true,label};
  }
  function linkedInput(entry:Entry,input:{port:Dict;index:number},stack:Set<string>):Resolved|undefined {
    const link=entry.ctx.links.get(String(input.port.link));
    if(!link||link.to!==String(entry.raw.id)||link.input!==input.index){fail(entry,'invalid-link',`Input ${String(input.port.name)} points at an inconsistent or absent link.`,String(input.port.name));return undefined;}
    return resolveOutput(entry.ctx,link.from,link.output,stack);
  }
  function inputValue(entry:Entry,name:string,stack:Set<string>):Resolved|undefined {
    const spec=entry.def?.inputs[name],input=ownInput(entry,name);
    const type=spec?.type??String(input?.port.type??'*');
    if(input&&input.port.link!==null&&input.port.link!==undefined){
      const source=linkedInput(entry,input,stack);
      if(source&&!source.unbound)return source;
      if(source?.unbound){
        subValues(entry.ctx);
        const proxy=entry.ctx.proxyValues?.get(`${entry.id}:${name}`),inner=widgets(entry).get(name);
        const fallback=proxy??inner;
        if(fallback!==undefined){issue('inner-value-used',`Subgraph input ${source.label??name} has no parent value; captured inner value is used.`,entry,'warn',name);return {type,value:fallback,label:source.label};}
      }
      return source;
    }
    subValues(entry.ctx);
    const proxy=entry.ctx.proxyValues?.get(`${entry.id}:${name}`);
    if(proxy!==undefined)return {type,value:proxy};
    const captured=widgets(entry).get(name);
    if(captured!==undefined)return {type,value:captured};
    if(spec?.defaultValue!==undefined&&!spec.required)return {type,value:spec.defaultValue};
    return undefined;
  }
  function primitive(entry:Entry):Resolved|undefined {
    const named=rec(entry.raw.widgets_values_named??entry.raw.widgets_values),values=arr(entry.raw.widgets_values),item=named.value??values[0];
    if(!scalar(item)||values.length>2||values.length===2&&!['fixed','randomize','increment','decrement'].includes(String(values[1]))){fail(entry,'widget-mapping','PrimitiveNode must have one unambiguous scalar value.');return undefined;}
    return {value:item,type:typeof item==='boolean'?'BOOLEAN':typeof item==='string'?'STRING':Number.isInteger(item)?'INT':'FLOAT'};
  }
  function branch(entry:Entry,input:string,current:boolean,control:string,label?:string):boolean {
    const id=`branch:${entry.id}:${input}`,previous=branchById.get(id);
    if(previous){if(!previous.controls!.includes(control))previous.controls!.push(control);}
    else branchById.set(id,{id,kind:'branch',nodeId:entry.id,input,classType:entry.type,label:label??String(entry.raw.title??entry.type),valueType:'boolean',defaultValue:current,controls:[control]});
    if(Object.prototype.hasOwnProperty.call(options.slotValues??{},id)){
      const chosen=options.slotValues![id];if(typeof chosen!=='boolean'){fail(entry,'slot-value',`Branch ${id} needs a boolean.`,input);return current;}return chosen;
    }
    return current;
  }
  function booleanValue(source:Resolved|undefined,control:Entry,stack:Set<string>):boolean|undefined {
    if(!source||source.unbound)return undefined;
    if(typeof source.value==='boolean')return branch(control,'switch',source.value,control.id,source.label);
    if(!source.link)return undefined;
    const entry=entries.get(source.link[0]);if(!entry||source.link[1]!==0||entry.type!=='PrimitiveBoolean')return undefined;
    const token=`bool:${entry.id}`;if(stack.has(token)){fail(entry,'cycle','Cycle in boolean branch controls.');return undefined;}
    const next=new Set(stack);next.add(token);const captured=inputValue(entry,'value',next);
    if(typeof captured?.value!=='boolean')return undefined;
    return branch(entry,'value',captured.value,control.id,captured.label);
  }
  function bypass(entry:Entry,slot:number,stack:Set<string>):Resolved|undefined {
    const ports=arr(entry.raw.inputs).map(rec),out=rec(arr(entry.raw.outputs)[slot]);
    const type=typeof out.type==='string'?out.type:entry.def?.outputs[slot]??'*';
    const matching=ports.map((port,index)=>({port,index})).filter(item=>typesMatch(String(item.port.type??entry.def?.inputs[String(item.port.name)]?.type??'*'),type));
    const ordered=[...matching.filter(item=>item.index===slot),...matching.filter(item=>item.index!==slot)];
    for(const input of ordered){
      if(input.port.link!==null&&input.port.link!==undefined)return linkedInput(entry,input,stack);
      if(entry.def){const value=inputValue(entry,String(input.port.name),stack);if(value&&!value.unbound)return value;}
    }
    issue('muted-dependency',`Bypassed node has no compatible input for output ${slot}.`,entry,'warn');return undefined;
  }
  function resolveOutput(ctx:Context,localId:string,slot:number,stack=new Set<string>()):Resolved|undefined {
    if(localId==='-10')return parentInput(ctx,slot,stack);
    const entry=ctx.nodes.get(localId);
    if(!entry){issue('invalid-link',`Unknown output source ${ctx.prefix}${localId}.`);return undefined;}
    if(entry.mode===2)return undefined;
    const key=`${entry.id}:${slot}`;
    if(stack.has(key)){fail(entry,'cycle','Cycle in UI routing or subgraph boundaries.');return undefined;}
    if(resolved.has(key))return resolved.get(key);
    const next=new Set(stack);next.add(key);let output:Resolved|undefined;
    if(entry.mode===4)output=bypass(entry,slot,next);
    else if(entry.child){
      const outgoing=[...entry.child.links.values()].filter(link=>link.to==='-20'&&link.input===slot);
      if(outgoing.length!==1)fail(entry,'subgraph-values',`Subgraph output ${slot} must have exactly one source.`);
      else output=resolveOutput(entry.child,outgoing[0].from,outgoing[0].output,next);
    }else if(entry.type==='Reroute'){
      const incoming=[...ctx.links.values()].filter(link=>link.to===localId);
      if(incoming.length!==1)fail(entry,'invalid-link','Reroute must have exactly one incoming source.');else output=resolveOutput(ctx,incoming[0].from,incoming[0].output,next);
    }else if(entry.type==='PrimitiveNode')output=primitive(entry);
    else if(entry.type==='Note'||entry.type==='MarkdownNote')fail(entry,'invalid-link','Annotation nodes cannot feed executable inputs.');
    else if(entry.type==='ComfySwitchNode'&&entry.def){
      const condition=booleanValue(inputValue(entry,'switch',next),entry,next);
      if(condition===undefined)fail(entry,'switch-unresolved','ComfySwitchNode has no statically proven boolean switch. Export API format for dynamic branches.');
      else {
        output=inputValue(entry,condition?'on_true':'on_false',next);entry.report.reason=`Static switch selected ${condition?'on_true':'on_false'}.`;
        if(!prunedNodes.some(node=>node.nodeId===entry.id))prunedNodes.push({nodeId:entry.id,classType:entry.type,reason:'switch-collapsed'});
      }
    }else if(entry.def){
      if(slot>=entry.def.outputs.length)fail(entry,'invalid-link',`Output slot ${slot} is outside object_info outputs.`);
      else output={link:[entry.id,slot],type:entry.def.outputs[slot]};
    }
    resolved.set(key,output);return output;
  }

  function hintKind(label:string):ComfySlotKind|undefined {
    if(/negative|negative_prompt/i.test(label))return 'negative';
    if(/positive|positive_prompt|^prompt$/i.test(label))return 'positive';
    if(/^width$|^height$|^seed$|^steps$|^cfg$|^sampler$|^scheduler$|^denoise$/i.test(label))return label.toLowerCase() as ComfySlotKind;
    return undefined;
  }
  function buildNode(entry:Entry):void {
    if(built.has(entry.id)||entry.mode===2||entry.mode===4||entry.child||UI_VIRTUAL_TYPES.has(entry.type))return;
    if(building.has(entry.id)){fail(entry,'cycle','Executable node dependency cycle.');return;}
    const def=entry.def;if(!def)return;
    building.add(entry.id);
    const inputs:Record<string,unknown>=Object.create(null);
    for(const port of arr(entry.raw.inputs).map(rec))if(typeof port.name==='string'&&!def.inputs[port.name])fail(entry,'unknown-input',`UI input ${port.name} is absent from object_info. Export API format.`,port.name);
    for(const name of def.inputOrder){
      const spec=def.inputs[name];if(!spec)continue;
      if(spec.dynamic||spec.multiselect){fail(entry,'widget-mapping',`Input ${name} uses dynamic or multiselect widgets that require an API export.`,name);continue;}
      const source=inputValue(entry,name,new Set());
      if(!source||source.unbound){
        if(spec.required){const wired=ownInput(entry,name)?.port.link;fail(entry,wired!==null&&wired!==undefined?'muted-dependency':'missing-input',`Required input ${name} has no executable source or captured widget value.`,name);}continue;
      }
      if(source.label){const kind=hintKind(source.label);slotHints[`${entry.id}:${name}`]={label:source.label,...(kind?{kind}:{})};}
      if(source.link){
        if(!typesMatch(source.type,spec.type)){fail(entry,'link-type-mismatch',`Link type ${source.type} does not match ${spec.type} for ${name}.`,name);continue;}
        const dependency=entries.get(source.link[0]);if(!dependency){fail(entry,'invalid-link',`Missing expanded node ${source.link[0]}.`,name);continue;}
        buildNode(dependency);inputs[name]=source.link;
      }else if(source.value!==undefined){
        if(!spec.widget||!valueMatches(source.value,spec.type)){fail(entry,'widget-mapping',`A primitive scalar cannot replace non-widget input ${name}:${spec.type}.`,name);continue;}
        inputs[name]=source.value;
        if(typeof source.value==='string'&&/\{[^{}]*\|[^{}]*\}/.test(source.value))issue('dynamic-prompt-syntax','Dynamic prompt syntax is preserved literally; frontend random expansion is not emulated.',entry,'warn',name);
      }
    }
    prompt[entry.id]={class_type:entry.type,inputs,...(typeof entry.raw.title==='string'?{_meta:{title:entry.raw.title}}:{})};
    built.add(entry.id);building.delete(entry.id);
  }

  register(value,'',0);
  const outputs=[...entries.values()].filter(entry=>entry.def?.outputNode&&entry.mode===0&&!entry.child);
  if(!outputs.length)issue('no-output-node','No active output node is known to local object_info.');
  for(const output of outputs)buildNode(output);
  for(const entry of entries.values()){
    if(entry.def&&!entry.child&&entry.mode===0&&!built.has(entry.id)&&!UI_VIRTUAL_TYPES.has(entry.type)){
      if(!prunedNodes.some(item=>item.nodeId===entry.id))prunedNodes.push({nodeId:entry.id,classType:entry.type,reason:'unselected-branch'});
      entry.report.reason??='Not reachable from an active output after static branch selection.';
    }
  }
  // A serializer is never silently considered equivalent to graphToPrompt.
  issue('conversion-unverified','UI conversion has not been compared with an official frontend API export. Review it before execution.',undefined,'confirm');
  if(inputTotal!==records.length)issue('conversion-error',`Node accounting incomplete: ${records.length}/${inputTotal}.`);
  return result();
}
