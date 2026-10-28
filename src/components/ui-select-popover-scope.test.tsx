import {describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
vi.mock('react',async original=>({...await original<typeof import('react')>(),useMemo:(factory:()=>unknown)=>factory(),useId:()=>':scope-fixture:',useState:(initial:unknown)=>[typeof initial==='function'?initial():initial,()=>{}],useLayoutEffect:()=>{}}));
import {SelectMenu,SelectMenuCompat} from './ui';

type Props={popoverClassName?:string;className:string;value:string;options:Array<{label:string;value:string}>;onChange:(value:string)=>void};
describe('SelectMenuCompat optional popover scope (actual adapter, deterministic hook fixture)',()=>{
  it('leaves default consumers without a custom popover class or changed trigger class',()=>{
    const result=SelectMenuCompat({value:'one','aria-label':'Default selector',children:<option value="one">One</option>}) as ReactElement<Props>;
    expect(result.type).toBe(SelectMenu);expect(result.props.popoverClassName).toBeUndefined();expect(result.props.className).toBe('select-menu-compat');expect(result.props.options).toEqual([{value:'one',label:'One',disabled:false}]);
  });
  it('passes an explicit scope only to the popover and preserves the ordinary trigger class',()=>{
    const result=SelectMenuCompat({value:'one',className:'consumer-trigger',popoverClassName:'scoped-select-options','aria-label':'Scoped selector',children:<option value="one">One</option>}) as ReactElement<Props>;
    expect(result.props.popoverClassName).toBe('scoped-select-options');expect(result.props.className).toBe('select-menu-compat consumer-trigger');expect(result.props.className).not.toContain('scoped-select-options');
  });
  it('retains controlled option change tokens with the optional scope enabled',()=>{
    const change=vi.fn(),result=SelectMenuCompat({value:'combo:0',popoverClassName:'scoped-select-options','aria-label':'Typed option',onChange:change,children:[<option key="a" value="combo:0">true</option>,<option key="b" value="combo:1">false</option>]}) as ReactElement<Props>;
    result.props.onChange('combo:1');expect(change).toHaveBeenCalledTimes(1);expect(change.mock.calls[0][0].target.value).toBe('combo:1');expect(result.props.value).toBe('combo:0');
  });
});
