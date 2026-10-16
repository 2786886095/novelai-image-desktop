import {expect,it} from 'vitest';
import {normalizeStudioComposerActions,studioComposerTurn} from './composer-actions';
import type {AppSettings} from '../types';
it.each(['optimize','assistant','convert','reverse'] as const)('preserves all selected template axes in %s read actions',templateKind=>{
 const action={kind:'template-read',templateKind,mode:'tags',templateVersion:'v4.5',skillVersion:'1.0.0'};
 const normalized=normalizeStudioComposerActions([action]);expect(normalized[0]).toMatchObject(action);
 const turn=studioComposerTurn('fixture',[action],{language:'en-US',promptTemplates:[]} as unknown as AppSettings);
 expect(turn.providerText).toContain('"mode":"tags"');expect(turn.providerText).toContain('"templateVersion":"v4.5"');expect(turn.providerText).toContain('"skillVersion":"1.0.0"');
});
