import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {describe,expect,it} from 'vitest';

// Parse the actual feature stylesheet and resolve the relevant class selectors
// and viewport media cascade. This is a static layout contract, NOT a browser
// measurement or native UI acceptance; root verifies real rectangles separately.
const css=readFileSync(process.env.COMFY_RESPONSIVE_CSS??fileURLToPath(new URL('./comfyui-local.css',import.meta.url)),'utf8');
const sheet=postcss.parse(css);
type ElementFixture={classes:string[];parent?:ElementFixture};
function mediaMatches(query:string,width:number,height:number){
  const bounds=[...query.matchAll(/\((min|max)-(width|height)\s*:\s*(\d+)px\)/g)];
  return bounds.length>0&&bounds.every(([,kind,axis,raw])=>{
    const size=axis==='width'?width:height,bound=Number(raw);return kind==='min'?size>=bound:size<=bound;
  });
}
function matches(selector:string,node:ElementFixture){
  if(/[\[\]:]/.test(selector))return false;
  const parts=selector.trim().replaceAll('>',' ').split(/\s+/).reverse();
  let current:ElementFixture|undefined=node;
  for(let index=0;index<parts.length;index++){
    const token=parts[index];if(!/^(?:\.[\w-]+)+$/.test(token))return false;
    const classes=[...token.matchAll(/\.([\w-]+)/g)].map(item=>item[1]);
    if(index===0){if(!classes.every(name=>current?.classes.includes(name)))return false;}
    else{current=current?.parent;while(current&&!classes.every(name=>current?.classes.includes(name)))current=current.parent;if(!current)return false;}
  }
  return true;
}
function style(node:ElementFixture,width:number,height:number){
  const result:Record<string,string>={},weights:Record<string,number>={};
  sheet.walkRules(rule=>{
    for(let parent:postcss.AnyNode|undefined=rule.parent;parent;parent=parent.parent){if(parent.type==='atrule'&&parent.name==='media'&&!mediaMatches(parent.params,width,height))return;}
    for(const selector of rule.selectors){
      if(!matches(selector,node))continue;
      const weight=(selector.match(/\.[\w-]+/g)??[]).length;
      rule.walkDecls(declaration=>{if(weight>=(weights[declaration.prop]??-1)){weights[declaration.prop]=weight;result[declaration.prop]=declaration.value;}});
    }
  });
  return result;
}
function fixtures(collapsed=false){
  const tool={classes:['comfy-local']},workbench={classes:['comfy-workbench',collapsed?'library-collapsed':'library-expanded'],parent:tool};
  const library={classes:['comfy-local-library','comfy-local-panel'],parent:workbench},parameters={classes:['comfy-local-parameter-column','comfy-local-panel'],parent:workbench};
  return {tool,workbench,library,parameters,libraryBody:{classes:['comfy-local-library-body'],parent:library},parameterBody:{classes:['comfy-local-parameter-scroll'],parent:parameters}};
}
describe('ComfyUI responsive CSS cascade contract (not native GUI evidence)',()=>{
  it.each([[1120,760],[1120,761],[1024,700]])('keeps useful editing bodies with outer scrolling at %sx%s', (width,height)=>{
    const f=fixtures();
    expect(style(f.tool,width,height).overflow).toBe('auto');
    const grid=style(f.workbench,width,height);
    expect(grid.flex).toBe('0 0 auto');expect(grid.height).toBe('auto');
    expect(grid['grid-template-rows']).toBe('minmax(420px,auto) minmax(540px,auto)');
    expect(style(f.library,width,height)['min-height']).toBe('420px');expect(style(f.parameters,width,height)['min-height']).toBe('540px');
    expect(style(f.libraryBody,width,height)['min-height']).toBe('220px');expect(style(f.libraryBody,width,height).flex).toBe('1 0 220px');
    expect(style(f.parameterBody,width,height)['min-height']).toBe('320px');expect(style(f.parameterBody,width,height).flex).toBe('1 0 320px');
  });
  it('preserves explicit collapse without shrinking the parameter editor into leftover space',()=>{
    const f=fixtures(true),grid=style(f.workbench,1120,760);
    expect(grid['grid-template-rows']).toBe('minmax(540px,auto)');expect(grid.height).toBe('auto');
    expect(style(f.parameters,1120,760)['min-height']).toBe('540px');expect(style(f.parameters,1120,760)['grid-row']).toBe('1');expect(grid['grid-template-columns']).not.toContain('220px');
  });
  it('retains the validated wide and single-column modes',()=>{
    const f=fixtures();
    expect(style(f.workbench,1385,900).flex).toBe('1 1 auto');expect(style(f.workbench,1385,760).height).toBe('480px');
    expect(style(f.workbench,800,760).display).toBe('flex');expect(style(f.workbench,800,760)['flex-direction']).toBe('column');
    expect(style(f.tool,800,760).overflow).toBe('auto');expect(style(f.workbench,800,760).height).not.toBe('480px');
  });
});
