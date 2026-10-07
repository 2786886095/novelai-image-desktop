import {expect,it} from 'vitest';
import {typographyRoleScale} from './typography-hierarchy';
import {typographyHierarchyHint} from './typography-hierarchy-text';
it('keeps default exactly 1, full body growth and responsive unclamped role growth',()=>{
 for(const r of ['body','title','control','secondary'] as const)expect(typographyRoleScale(100,r)).toBe(1);
 expect(typographyRoleScale(200,'body')).toBe(2);expect(typographyRoleScale(200,'title')).toBe(1.55);expect(typographyRoleScale(200,'control')).toBe(1.45);
 for(const r of ['title','control','secondary'] as const){let previous=0;for(const p of [80,100,125,150,175,200]){const f=typographyRoleScale(p,r);expect(f).toBeGreaterThan(previous);previous=f;}}
 expect(typographyRoleScale(NaN,'body')).toBe(1);
});
it('explains full body and gentle chrome in all supported languages',()=>{for(const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(typographyHierarchyHint(l).length).toBeGreaterThan(20);});
