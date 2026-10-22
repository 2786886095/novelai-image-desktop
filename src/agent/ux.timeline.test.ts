import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('../store',()=>({useAppStore:vi.fn()}));
import {AgentWebSources, AgentMessageFiles, AgentAttachmentIcon} from '../PiAgentPage';
import {LuFileText, LuImage} from 'react-icons/lu';
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

it('renders sent plaintext attachment-only message metadata visibly and safely, without image or native path',()=>{
 const attachment={id:'txt',name:'小说正文 (2).txt <script>bad</script>',kind:'text' as const,mime:'text/plain',size:12,filePath:'C:/PRIVATE_SENTINEL/novel.txt',createdAt:'2026-10-22T00:00:00Z'};
 const html=renderToStaticMarkup(createElement(AgentMessageFiles,{attachments:[attachment],language:'zh-CN'}));
 expect(html).toContain('小说正文 (2).txt');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('PRIVATE_SENTINEL');expect(html).toContain('pi-attachments');
 const missing=renderToStaticMarkup(createElement(AgentMessageFiles,{attachments:[{...attachment,unavailable:'missing'}],language:'en-US'}));expect(missing).toContain('role="status"');expect(missing).toContain('Reattach');
 expect(renderToStaticMarkup(createElement(AgentMessageFiles,{attachments:[{...attachment,kind:'image'}],language:'zh-CN'}))).toBe('');
});
it('uses a real file icon for text/document/other chips and keeps the existing image icon',()=>{
 for(const kind of ['text','document','other'] as const)expect(renderToStaticMarkup(createElement(AgentAttachmentIcon,{kind}))).toBe(renderToStaticMarkup(createElement(LuFileText,{'aria-hidden':true})));
 expect(renderToStaticMarkup(createElement(AgentAttachmentIcon,{kind:'image'}))).toBe(renderToStaticMarkup(createElement(LuImage,{'aria-hidden':true})));
});
