import {it,expect} from 'vitest';
import {validateLocalLibraryImport} from './studio-library-transfer';
it('creates separate identities and preserves sampler token parameters',()=>{
 const original={id:'existing',name:'角色',description:'正文',maxTokens:8000,apiKey:'secret',avatarPath:'private.png',lorebookId:'foreign'};
 const {items}=validateLocalLibraryImport({collection:'characters',items:[original]},()=> 'copy-id');
 expect(items[0]).toMatchObject({id:'copy-id',name:'角色',maxTokens:8000});
 expect(items[0]).not.toHaveProperty('avatarPath');expect(items[0]).not.toHaveProperty('apiKey');expect(items[0]).not.toHaveProperty('lorebookId');
 expect(original.id).toBe('existing');
});
it('rejects partial previews and unsupported imports before writes',()=>{
 for(const args of [{collection:'conversations',items:[{name:'bad'}]},{collection:'characters',items:[{name:'bad',description:{truncated:true}}]},{collection:'styles',items:[{name:'missing prompt'}]},{collection:'characters',items:[]}])expect(()=>validateLocalLibraryImport(args,()=> 'id')).toThrow();
});
