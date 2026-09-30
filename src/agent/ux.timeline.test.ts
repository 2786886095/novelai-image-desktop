import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('../store',()=>({useAppStore:vi.fn()}));
import {AgentWebSources} from '../PiAgentPage';
import {studioWebSources} from './ux';
const tool={id:'web',name:'langbai_search_web',title:'Web search',status:'completed' as const};
it('renders actual page source citations as visible links and text, not diagnostic JSON',()=>{
 const preview=studioWebSources({...tool,output:JSON.stringify({sources:[{title:'Official source',url:'https://example.org/article',snippet:'Useful snippet <script>not executable</script>'}],fetchedAt:'2026-10-01T01:00:00Z',warning:'External snippet, not verified'})});
 const html=renderToStaticMarkup(createElement(AgentWebSources,{preview,language:'en-US',onOpen:vi.fn()}));
 expect(html).toContain('href="https://example.org/article"');
 expect(html).toContain('Official source');
 expect(html).toContain('Useful snippet &lt;script&gt;');
 expect(html).not.toContain('<script>');
 expect(html).toContain('2026-10-01T01:00:00Z');
 expect(html).toContain('External snippet, not verified');
 expect(html).not.toContain('<details');
});
it('does not render unsafe links and distinguishes empty from malformed source data',()=>{
 const render=(output:string)=>renderToStaticMarkup(createElement(AgentWebSources,{preview:studioWebSources({...tool,output}),language:'en-US',onOpen:vi.fn()}));
 const blocked=render(JSON.stringify({sources:[{title:'Bad',url:'javascript:alert(1)',snippet:'Bad'}]}));
 expect(blocked).not.toContain('href=');
 expect(blocked).toContain('were blocked');
 expect(render(JSON.stringify({sources:[]}))).toContain('No usable sources');
 expect(render('broken')).toContain('Unable to parse sources');
});
