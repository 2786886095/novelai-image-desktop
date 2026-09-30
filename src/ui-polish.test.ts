import {expect,it} from 'vitest';import {readFileSync} from 'node:fs';
const app=readFileSync('src/App.tsx','utf8'),assistant=readFileSync('src/components/PromptAssistant.tsx','utf8'),nav=readFileSync('src/app/AppTabBar.tsx','utf8'),css=readFileSync('src/prompt-editor.css','utf8');
it('removes notices and template labels from both assistants',()=>{expect(assistant).not.toContain('{text.notice}');expect(assistant).not.toContain('{text.template}');});
it('blocks requests and offers API setup before assistance',()=>expect(assistant).toContain('isPromptApiConfigured'));
it('weights use a secondary panel',()=>expect(app).toContain('<PromptWeightPanel'));
it('advanced controls have dedicated spacing',()=>expect(app).toContain('full prompt-advanced-button'));
it('top navigation measures available space and exposes overflow',()=>{expect(nav).toContain('countTabsThatFit');expect(nav).toContain('tab-overflow-control');});
it('collapsed prompt trigger has transparent background',()=>expect(css).toContain('.prompt-toolbar-dock[data-open=false] .prompt-toolbar-toggle'));
