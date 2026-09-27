import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {descriptions,parameterHelp} from './parameter-help.js';
test('every named parameter has a Chinese explanation rather than its internal key',()=>{
 const source=fs.readFileSync(new URL('./parameter-panel.js',import.meta.url),'utf8');
 const labels=Function('return '+source.match(/export const labels=(\{[^;]+\});/)[1])();
 for(const key of Object.keys(labels)){assert.ok(descriptions[key]?.length>8,key);assert.match(parameterHelp(key),/[\u4e00-\u9fff]/);}
 assert.match(parameterHelp('steps',{type:'number',min:1,max:50,step:1}),/1～50；步长：1/);
 assert.match(parameterHelp('seed',{persistence:'session'}),/重启后不保留/);
});
