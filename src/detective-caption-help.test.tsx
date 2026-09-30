import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./feature-i18n',()=>({useFeatureText:()=>((key:string,params:Record<string,unknown>={})=>key.replace(/\{(\w+)\}/g,(_,k)=>String(params[k]??`{${k}}`)))}));
vi.mock('./store',()=>({useAppStore:(select:(value:unknown)=>unknown)=>select({applyParams:()=>{}})}));
import DetectiveArtistLab from './DetectiveArtistLab';
let saved:Record<string,unknown>;
beforeEach(()=>{
 saved={prompt:'existing content',style:'existing style',budget:300};
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(saved)});
});
afterEach(()=>vi.unstubAllGlobals());
const render=()=>renderToStaticMarkup(<DetectiveArtistLab onBack={()=>{}}/>);
it('offers an optional target hint and opt-in character tags for old drafts',()=>{
 const html=render();expect(html).toContain('目标/角色提示（可选）');
 expect(html).toContain('网络角色：优先使用角色 Tag');expect(html).not.toContain('checked=""');
 expect(html).toContain('existing content');expect(html).toContain('existing style');
});
it('restores saved hint and character preference',()=>{
 saved.subjectHint='这是芙宁娜，只反推右侧角色';saved.knownCharacter=true;
 const html=render();expect(html).toContain('这是芙宁娜，只反推右侧角色');expect(html).toContain('checked=""');
});
it('does not enable identity inference from malformed saved values',()=>{
 saved.subjectHint={bad:true};saved.knownCharacter='false';
 const html=render();expect(html).toContain('目标/角色提示（可选）');
 expect(html).not.toContain('[object Object]');expect(html).not.toContain('checked=""');
});
it.each([[300,284,9],[304,288,9],[24,8,1]])('explains the linked image budget %i', (budget,search,rounds)=>{
 saved.budget=budget;const html=render();
 expect(html).toContain(`本次最多生成 ${budget} 张图片`);
 expect(html).toContain(`搜索阶段：最多 ${search} 张，分 ${rounds} 轮。`);
 expect(html).toContain('最终复测：最多 16 张');
 expect(html).toContain('修改轮数会更新图片上限');
});

it('defaults old drafts to mixed and offers explicit output mode selection',()=>{
 expect(render()).toContain('反推模式: 混合模式');
});
it('retains a saved natural-language choice',()=>{
 saved.reverseMode='natural';expect(render()).toContain('反推模式: 自然语言');
});
