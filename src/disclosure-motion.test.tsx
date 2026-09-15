import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {DISCLOSURE_MOTION,disclosureAttributes} from './components/disclosure-motion';
import {AnimatedCollapse} from './components/CharacterEditing';
const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
it('shares 160/120 timing and disables outgoing controls immediately',()=>{
 expect(DISCLOSURE_MOTION).toEqual({open:160,close:120});
 expect(disclosureAttributes(false)).toEqual({'data-disclosure-open':'false',inert:true,'aria-hidden':true});
 expect(disclosureAttributes(true).inert).toBe(false);
});
it('preserves mounted inputs across character and nested disclosure state',()=>{
 const html=renderToStaticMarkup(<AnimatedCollapse open={false}><input defaultValue="keep"/></AnimatedCollapse>);
 expect(html).toContain('inert=""');expect(html).toContain('value="keep"');
});
it('animates visible menu height rather than the unconstrained long list',()=>{
 const source=readFileSync(new URL('./components/disclosure-motion.ts',import.meta.url),'utf8');
 expect(source).toContain('Number.isFinite(limit) ? limit : Infinity');
 expect(source).toContain('window.clearTimeout(timer)');
 expect(css).toContain('height: var(--disclosure-height, auto)');
 expect(css).toContain('@starting-style');
 expect(css).toContain('html.motion-reduced .disclosure-popover');
});
it('routes all Flutter selectors through the shared height animation',()=>{
 const dart=readFileSync(new URL('../mobile/lib/ui/studio_dropdown.dart',import.meta.url),'utf8');
 expect(dart).toMatch(/SizeTransition\(\s*sizeFactor: curved/);
 expect(dart).toContain('reverseTransitionDuration');
 expect(dart).toContain('MediaQuery.disableAnimationsOf(context)');
});
