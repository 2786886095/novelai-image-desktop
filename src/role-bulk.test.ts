import {describe,it,expect} from 'vitest';
import {parseBulkRoles as parse, formatBulkRoles as format, mergeBulkRoles, bulkAiInstructions, makeBulkPreset} from './role-bulk';
describe('role bulk editor',()=>{
 it.each(['【角色1】','角色一：','[Character 1]:','人物1:'])('recognizes PR 93 marker %s',marker=>{
  expect(parse(marker+'silver hair\n负面1：hat\n角色2: glasses\nnegative 2: scarf',6)).toEqual([{prompt:'silver hair',negativePrompt:'hat'},{prompt:'glasses',negativePrompt:'scarf'}]);
 });
 it('supports blank lines, CRLF and multiline positive text',()=>{
  expect(parse('red\r\n\r\nblue',2)).toEqual([{prompt:'red'},{prompt:'blue'}]);
  expect(parse('角色1：A\nB\nnegative: C',6)[0]).toEqual({prompt:'A\nB',negativePrompt:'C'});
 });
 it('normalizes JSON losslessly, including omitted vs empty negative prompts',()=>{
  const rows=[{name:'A',prompt:'she says "Hi"\n1.4::blue::',negativePrompt:''},{prompt:'B'}];
  expect(parse(format(rows),6)).toEqual(rows);
  expect(parse('\x60\x60\x60json\n'+format(rows)+'\n\x60\x60\x60',6)).toEqual(rows);
 });
 it.each(['{"characters":[{"promt":"bad"}]}','[{"prompt":3}]','角色1:A\n角色1:B','角色1:A\n预留\n角色3:C','角色1:A\n负面2:hat','{"oops":1}',''])('rejects invalid draft %s',raw=>expect(()=>parse(raw,6)).toThrow());
 it('never truncates excess roles or copies unsupported fields',()=>{
   expect(()=>parse(Array(7).fill('x').join('\n\n'),6)).toThrow('limit');
   expect(()=>parse('[{"prompt":"A","x":22}]',32)).toThrow('format');
 });
 it('keeps IDs, coordinates, disabled state and omitted fields, including zero coordinates',()=>{
   const existing=[{id:'a',name:'A',prompt:'old',negativePrompt:'hat',useCoords:true,x:0,y:1,enabled:false}];
   const r=mergeBulkRoles(parse('角色1: red\n角色2: blue',6),existing);expect(r[0]).toEqual({...existing[0],prompt:'red'});expect(r[1]).toMatchObject({prompt:'blue',x:.5,y:.5,useCoords:false});expect(existing[0].prompt).toBe('old');
   expect(mergeBulkRoles([{prompt:'red',negativePrompt:''}],existing)[0].negativePrompt).toBe('');
 });
 it('creates uniquely named groups, not instruction templates',()=>{
   const rows=[{name:'Lead',prompt:'smile',negativePrompt:'hat'}];
   const a=makeBulkPreset([],'Cast',rows),b=makeBulkPreset([a],'Cast',rows); expect(a.name).toBe('Cast');expect(b.name).toBe('Cast (1)');expect(a.captions?.[0]).toMatchObject(rows[0]);expect(()=>makeBulkPreset([],' ',rows)).toThrow();
   expect(bulkAiInstructions(6,'rainy',rows)).toContain(format(rows));expect(bulkAiInstructions(6,'rainy')).not.toContain('Lead');
 });
});
