import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateInstalledOutputData } from './output-recovery';
import type { PersistedData } from './store';
let root: string; let install: string; let output: string; let target: string; let backup: string;
beforeEach(()=>{ root=fs.mkdtempSync(path.join(os.tmpdir(),'nai-review-recovery-'));install=path.join(root,'installed');output=path.join(install,'outputs');target=path.join(root,'Pictures','Recovered');backup=path.join(root,'Pictures','Old Backup'); });
afterEach(()=>{ vi.restoreAllMocks(); fs.rmSync(root,{recursive:true,force:true}); });
function write(file:string, content='sentinel'){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
function data(directory=output):PersistedData { return {settings:{outputDir:directory} as PersistedData['settings'],history:[{id:'one',filePath:path.join(directory,'one.png')} as PersistedData['history'][number]],historyGroups:[],convertHistory:[],reverseHistory:[]}; }
describe('verified visible output recovery',()=>{
  it('recovers a configured outputs subtree from the parent installer backup',()=>{
    const source=path.join(output,'我的');const d=data(source);write(path.join(backup,'我的','one.png'));
    const r=migrateInstalledOutputData(d,output,target,backup,install);
    expect(r.data.settings.outputDir).toBe(path.join(target,'我的'));
    expect(r.data.settings.outputMigrationNotice).toMatchObject({status:'recovered',copiedFiles:1});
    expect(fs.readFileSync(r.data.history[0].filePath,'utf8')).toBe('sentinel');
    expect(fs.existsSync(path.join(backup,'我的','one.png'))).toBe(true);
  });
  it('recovers arbitrary install/images output without moving or deleting originals',()=>{
    const source=path.join(install,'images');const d=data(source);write(d.history[0].filePath);
    const r=migrateInstalledOutputData(d,output,target,backup,install);
    expect(r.data.settings.outputDir).toBe(path.join(target,'Recovered','images'));
    expect(fs.readFileSync(r.data.history[0].filePath,'utf8')).toBe('sentinel');
    expect(fs.readFileSync(d.history[0].filePath,'utf8')).toBe('sentinel');
  });
  it('preserves different same-name images and maps history to the recovered content',()=>{
    const d=data();write(d.history[0].filePath,'old-image');write(path.join(target,'one.png'),'new-image');
    const r=migrateInstalledOutputData(d,output,target,backup,install);
    expect(fs.readFileSync(path.join(target,'one.png'),'utf8')).toBe('new-image');
    expect(fs.readFileSync(r.data.history[0].filePath,'utf8')).toBe('old-image');
    expect(r.data.history[0].filePath).toContain('.recovered-');
  });
  it('retains the saved directory on copy failure and persists an actionable notice',()=>{
    const d=data();write(d.history[0].filePath);vi.spyOn(fs,'copyFileSync').mockImplementation(()=>{throw Error('disk full')});
    const r=migrateInstalledOutputData(d,output,target,backup,install);
    expect(r.data.settings.outputDir).toBe(output); expect(r.data.history).toEqual(d.history);
    expect(r.data.settings.outputMigrationNotice).toMatchObject({status:'failed',error:'disk full'});
    expect(fs.readFileSync(d.history[0].filePath,'utf8')).toBe('sentinel');
  });
  it('does not report a missing old folder as a successful recovery or change to an empty directory',()=>{
    const r=migrateInstalledOutputData(data(),output,target,backup,install);
    expect(r.data.settings.outputDir).toBe(output);expect(r.data.settings.outputMigrationNotice?.status).toBe('failed');
  });
  it('retains install-root configuration without attempting to copy the whole application',()=>{
    write(path.join(install,'app.exe'));
    const r=migrateInstalledOutputData(data(install),output,target,backup,install);
    expect(r.data.settings.outputDir).toBe(install);expect(r.data.settings.outputMigrationNotice?.status).toBe('failed');
    expect(fs.existsSync(path.join(target,'app.exe'))).toBe(false);
  });
  it('does not mutate a normal external directory',()=>{
    const d=data(path.join(root,'outside'));const r=migrateInstalledOutputData(d,output,target,backup,install);
    expect(r).toEqual({data:d,changed:false,copied:false});
  });
  it('refuses linked source trees and preserves the linked contents',()=>{
    const external=path.join(root,'outside');write(path.join(external,'private.png'));fs.mkdirSync(output,{recursive:true});
    fs.symlinkSync(external,path.join(output,'alias'),'junction');
    const r=migrateInstalledOutputData(data(),output,target,backup,install);
    expect(r.data.settings.outputDir).toBe(output);expect(r.data.settings.outputMigrationNotice?.status).toBe('failed');
    expect(fs.readFileSync(path.join(external,'private.png'),'utf8')).toBe('sentinel');
  });
});
