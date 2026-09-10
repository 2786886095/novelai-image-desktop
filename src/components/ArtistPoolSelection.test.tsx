import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArtistPoolTotalStatus,artistPoolSelectionText} from './ArtistPoolSelection';
import {ArtistPoolStatus} from './ArtistPoolStatus';
it.each(['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const)('provides count, refresh and large-load hint in %s',language=>{
 const t=artistPoolSelectionText(language);expect(t.count).toBeTruthy();expect(t.warning).toMatch(/1000|1,000/);expect(t.refresh).toBeTruthy();
 const html=renderToStaticMarkup(<ArtistPoolTotalStatus language={language} value={{total:738106,checkedAt:10000,lowerBound:false,issue:null}} loading={false}/>);
 expect(html).toContain('738,106');expect(html).not.toContain('undefined');
});
it('keeps unknown totals distinct from zero and candidate counts',()=>{
 const html=renderToStaticMarkup(<ArtistPoolTotalStatus language="zh-CN" value={null} loading={false}/>);
 expect(html).toContain('暂未获取');expect(html).toContain('不影响已加载候选');expect(html).not.toContain('1000');
 expect(renderToStaticMarkup(<ArtistPoolTotalStatus language="zh-CN" value={null} loading/>)).toContain('统计中');
});
it('labels the count ceiling as at least rather than a complete total',()=>{
 expect(renderToStaticMarkup(<ArtistPoolTotalStatus language="zh-CN" value={{total:1000000,checkedAt:10000,lowerBound:true,issue:null}} loading={false}/>)).toContain('至少 1,000,000');
});
it('selected1000 completion never claims full-catalog completion',()=>{
 const html=renderToStaticMarkup(<ArtistPoolStatus language="zh-CN" loading={false} failed={false} snapshot={{items:[],source:'network',requested:1000,rankedCount:1000,complete:true,issue:null,savedAt:10000}}/>);
 expect(html).toContain('本次数量刷新完成');expect(html).not.toContain('全库同步完成');
});
