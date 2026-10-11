import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {defaultPanel,clampPanel,changePanel} from './panel-geometry.js';
import {createPanelLayoutStore} from './panel-layout-store.js';
test('defaults compact, fit phones/tablets/desktop/keyboard and visible offsets',()=>{
 for(const [width,height,x,y] of [[1400,1000,0,0],[320,568,0,0],[390,844,0,0],[768,1024,0,0],[844,390,0,0],[390,240,0,120],[320,180,20,80]]){
  const v={width,height,x,y},r=defaultPanel(v);assert.ok(r.width<=420);assert.ok(r.height<=660);
  for(const c of [r,clampPanel({x:9999,y:-888,width:920,height:2000},v),changePanel(r,999,999,false,v),changePanel(r,999,999,true,v),changePanel(r,-999,-999,true,v)]){
   assert.ok(c.x>=x&&c.y>=y);assert.ok(c.x+c.width<=x+width&&c.y+c.height<=y+height);assert.ok(c.width>0&&c.height>0);
  }
 }
});
test('drag, resize anchor and reset return exact defaults',()=>{
 const v={width:1400,height:1000,x:0,y:0},r=defaultPanel(v),m=changePanel(r,-400,80,false,v);
 assert.equal(m.x,r.x-400);assert.equal(m.y,r.y+80);assert.equal(m.width,r.width);
 const s=changePanel(m,100,100,true,v);assert.equal(s.x,m.x);assert.equal(s.y,m.y);assert.equal(s.width,m.width+100);assert.equal(s.height,m.height+100);
 assert.deepEqual(defaultPanel(v),r);
});
test('layout is durable across host restart, isolated per screen class, no arbitrary file writes',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'studio-layout-'));
 try{const store=createPanelLayoutStore(home),r={x:20,y:30,width:420,height:640};
 assert.deepEqual(await store.get({profile:'desktop'}),{rect:null});
 await store.set({profile:'desktop',rect:r});assert.deepEqual(await createPanelLayoutStore(home).get({profile:'desktop'}),{rect:r});
 await Promise.all([store.set({profile:'phone',rect:{...r,width:300}}),store.set({profile:'desktop',rect:{...r,x:50}})]);
 assert.equal((await store.get({profile:'phone'})).rect.width,300);assert.equal((await store.get({profile:'desktop'})).rect.x,50);
 await store.set({profile:'desktop',rect:null});assert.deepEqual(await store.get({profile:'desktop'}),{rect:null});assert.equal((await store.get({profile:'phone'})).rect.width,300);
 assert.throws(()=>store.set({profile:'../escape',rect:r}));
 for(const width of [NaN,Infinity,-1,'400',100001])assert.throws(()=>store.set({profile:'desktop',rect:{...r,width}}));
 assert.deepEqual(await fs.readdir(home),['studio-panel-layout.json']);
 }finally{await fs.rm(home,{recursive:true,force:true})}
});
