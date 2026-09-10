import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const env=vi.hoisted(()=>({install:'',userData:''}));
vi.mock('electron',()=>({app:{isPackaged:true,getPath:(key:string)=>key==='exe'?path.join(env.install,'app.exe'):env.userData},shell:{openPath:vi.fn()},dialog:{}}));
vi.mock('./store',()=>({getSettings:()=>({agentContextWindow:128000,agentAutoCompactThreshold:0.8}),atomicWriteFileSync:vi.fn(),readWithBackupRecoverySync:vi.fn(),rotateBackupsSync:vi.fn()}));
vi.mock('./local-media-protocol',()=>({toLocalMediaUrl:(file:string)=>'nai-local://'+file}));
import { snapshotLegacyWorkspace } from './agent-workspace-migration';
import { getAgentWorkspaceLocation, resetAgentWorkspaceLocationForTests, rebaseAgentWorkspaceFile } from './agent-workspace-location';
import { normalizeAgentWorkspace } from './agent-store';
import { AGENT_WORKSPACE_VERSION } from '../../src/agent/types';
const tempRoot=fs.realpathSync.native(os.tmpdir());
let root='';
afterEach(()=>{resetAgentWorkspaceLocationForTests();if(root){if(path.dirname(root)!==tempRoot||!path.basename(root).startsWith('nai-upgrade-read-'))throw Error('fixture');fs.rmSync(root,{recursive:true,force:true});root='';}});
it('normalizes actual conversation/draft/tool/swipe attachments after uninstall without losing prompt text or touching external images',()=>{
  root=fs.mkdtempSync(path.join(tempRoot,'nai-upgrade-read-'));env.install=path.join(root,'installed');env.userData=path.join(root,'profile');
  const source=path.join(env.install,'LangbaiWorkspace'),file=path.join(source,'attachments','image.webp'),external=path.join(root,'external.webp');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'webp sentinel');fs.writeFileSync(external,'external');
  const attachment={id:'image',name:'image.webp',filePath:file,kind:'image',mime:'image/webp',size:13,createdAt:new Date().toISOString()};
  const raw={version:AGENT_WORKSPACE_VERSION,conversations:[{id:'chat',title:'My title',draftAttachments:[attachment],messages:[{id:'message',role:'assistant',content:'Alice: red coat. Bob: blue jacket. '+file,status:'complete',attachments:[attachment],swipeAttachments:[[attachment]],tools:[{id:'tool',name:'image',status:'completed',generatedImages:[attachment]}]}]}]};
  fs.writeFileSync(path.join(source,'agent-workspace.json'),JSON.stringify(raw));snapshotLegacyWorkspace(source,env.userData);
  expect(env.install.startsWith(root+path.sep)).toBe(true);fs.rmSync(env.install,{recursive:true});
  const loc=getAgentWorkspaceLocation(),normalized=normalizeAgentWorkspace(raw),chat=normalized.conversations[0],message=chat.messages[0];
  expect(chat.title).toBe('My title');expect(message.content).toBe(raw.conversations[0].messages[0].content);
  for(const image of [chat.draftAttachments[0],message.attachments[0],message.swipeAttachments![0][0],message.tools[0].generatedImages![0]]){
    expect(image.filePath).toBe(path.join(loc.path,'attachments','image.webp'));expect(image.fileUrl).toContain(loc.path);expect(fs.readFileSync(image.filePath,'utf8')).toBe('webp sentinel');
  }
  expect(rebaseAgentWorkspaceFile(external)).toBe(external);
});
