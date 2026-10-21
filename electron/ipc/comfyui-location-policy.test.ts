import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { assertSafeComfyLocation, defaultComfyEnvironmentRoot } from './comfyui-location-policy';
const roots: string[] = [];
async function fixture() { const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-location-'))); roots.push(root); await fs.mkdir(path.join(root, 'app')); await fs.mkdir(path.join(root, 'profile')); return {root, policy:{installDirectories:[path.join(root,'app')],temporaryDirectories:[],userDataDirectory:path.join(root,'profile'),forbiddenDirectories:[]}}; }
afterEach(async()=>{for(const root of roots.splice(0)) await fs.rm(root,{recursive:true,force:true});});
it('proposes an independent child of the supplied safe parent',()=>{expect(defaultComfyEnvironmentRoot('D:/Studio')).toBe(path.join('D:/Studio','ComfyUI 环境'));});
it('accepts an absent independent sibling, preserving app/profile sentinels',async()=>{const f=await fixture(); expect((await assertSafeComfyLocation(path.join(f.root,'ComfyUI 环境'),f.policy)).existingEmpty).toBe(false);});
it('rejects protected roots and their descendants and ancestors',async()=>{const f=await fixture();for(const target of [f.root,path.join(f.root,'app'),path.join(f.root,'app','child'),path.join(f.root,'profile','env')]) await expect(assertSafeComfyLocation(target,f.policy)).rejects.toThrow('COMFY_LOCATION_PROTECTED');});
it('does not confuse same-prefix sibling paths',async()=>{const f=await fixture();expect((await assertSafeComfyLocation(path.join(f.root,'application-data'),f.policy)).existingEmpty).toBe(false);});
it('rejects nonempty and permits empty target without changing it',async()=>{const f=await fixture(); const target=path.join(f.root,'env');await fs.mkdir(target);expect((await assertSafeComfyLocation(target,f.policy)).existingEmpty).toBe(true);await fs.writeFile(path.join(target,'.hidden'),'keep');await expect(assertSafeComfyLocation(target,f.policy)).rejects.toThrow('COMFY_LOCATION_NOT_EMPTY');expect(await fs.readFile(path.join(target,'.hidden'),'utf8')).toBe('keep');});
it('rejects junction/symbolic-link ancestors',async()=>{const f=await fixture();await fs.mkdir(path.join(f.root,'real'));await fs.symlink(path.join(f.root,'real'),path.join(f.root,'alias'),'junction');await expect(assertSafeComfyLocation(path.join(f.root,'alias','env'),f.policy)).rejects.toThrow('COMFY_LOCATION_LINK');});
it.each(['relative/path','//server/share/env','C:relative','\\env','/env','bad\u0000name'])('rejects nonlocal absolute input %s',async(target)=>{const f=await fixture();await expect(assertSafeComfyLocation(target,f.policy)).rejects.toThrow();});
