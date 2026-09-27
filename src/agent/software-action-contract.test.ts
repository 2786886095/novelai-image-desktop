import {it,expect} from 'vitest';
import {validateSoftwareAction,SOFTWARE_ACTIONS} from './software-action-contract';
it('exposes exact declared commands and rejects invalid/injected mutations',()=>{
 expect(Object.keys(SOFTWARE_ACTIONS)).toHaveLength(18);
 expect(validateSoftwareAction({action:'history.items.list'}).effect).toBe('read');
 expect(()=>validateSoftwareAction({action:'history.groups.delete',id:'x'})).toThrow(/expectedRevision/);
 expect(()=>validateSoftwareAction({action:'history.groups.delete',id:'x',expectedRevision:'r',confirmed:true})).toThrow(/未知/);
 expect(()=>validateSoftwareAction({action:'shell.exec'})).toThrow();
 expect(()=>validateSoftwareAction({action:'history.items.list',limit:500})).toThrow();
 expect(validateSoftwareAction({action:'history.groups.create',name:'New',expectedRevision:'r'}).effect).toBe('write');
});
