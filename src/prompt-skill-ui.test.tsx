import {expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {PromptSkillControls} from './components/PromptSkillControls';
import {SelectMenu} from './components/ui';
const walk=(value:any):ReactElement<Record<string,any>>[]=>Array.isArray(value)?value.flatMap(walk):value&&typeof value==='object'&&'props'in value?[value,...walk(value.props.children)]:[];
it('uses the shared custom menu, with edition and target model separate',()=>{
 const change=vi.fn(),nodes=walk(PromptSkillControls({model:'v5',edition:'2.0.0',language:'zh-CN',onChange:change}));
 const menus=nodes.filter(n=>n.type===SelectMenu);expect(menus).toHaveLength(2);
 expect(menus[0].props.value).toBe('v5');expect(menus[1].props.value).toBe('2.0.0');
 menus[0].props.onChange('v4.5');expect(change).toHaveBeenLastCalledWith('v4.5','1.0.0');
 menus[1].props.onChange('1.0.0');expect(change).toHaveBeenLastCalledWith('v5','1.0.0');
 expect(nodes.some(n=>n.type==='select')).toBe(false);
});
it('blocks V2 for V4.5 both in the visible option and the event handler',()=>{
 const change=vi.fn(),nodes=walk(PromptSkillControls({model:'v4.5',edition:'2.0.0',onChange:change})),menu=nodes.filter(n=>n.type===SelectMenu)[1];
 expect(menu.props.value).toBe('1.0.0');expect(menu.props.options.find((o:any)=>o.value==='2.0.0').disabled).toBe(true);
 menu.props.onChange('2.0.0');expect(change).toHaveBeenLastCalledWith('v4.5','1.0.0');
});
it('provides model/edition names and Full-only compatibility guidance',()=>{
 const nodes=walk(PromptSkillControls({model:'v5',edition:'2.0.0',language:'zh-CN',disabled:true,onChange:vi.fn()}));
 for(const menu of nodes.filter(n=>n.type===SelectMenu)){expect(menu.props.ariaLabel).toBeTruthy();expect(menu.props.disabled).toBe(true);}
 expect(nodes.filter(n=>n.type==='small').map(n=>n.props.children).join(' ')).toContain('V5 Full');
});
