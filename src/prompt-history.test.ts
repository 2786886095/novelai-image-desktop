import {expect,it} from 'vitest';
import {PromptHistory} from './prompt-history';
it('undo and redo include initial empty text and full replacement actions',()=>{
 const h=new PromptHistory('');h.push('original');h.push('optimized');expect(h.undo()).toBe('original');expect(h.undo()).toBe('');expect(h.undo()).toBe('');expect(h.redo()).toBe('original');expect(h.redo()).toBe('optimized');
});
it('groups typing but keeps actions as separate steps',()=>{
 const h=new PromptHistory('');h.push('a',true,100);h.push('ab',true,200);h.push('abc',true,300);h.push('translated');expect(h.undo()).toBe('abc');expect(h.undo()).toBe('');
});
it('typing after a pause and after undo creates a new branch',()=>{
 const h=new PromptHistory('start');h.push('one',true,100);h.push('two',true,900);expect(h.undo()).toBe('one');h.push('new',true,950);expect(h.canRedo).toBe(false);expect(h.undo()).toBe('one');
});
it('duplicate sync does not create an extra step or erase redo',()=>{
 const h=new PromptHistory('a');h.push('b');h.undo();expect(h.push('a')).toBe(false);expect(h.canRedo).toBe(true);expect(h.redo()).toBe('b');
});
it('separate fields do not share text',()=>{
 const a=new PromptHistory('positive'),b=new PromptHistory('negative');a.push('edited');expect(b.canUndo).toBe(false);expect(b.value).toBe('negative');
});
it('bounds memory to the latest hundred snapshots',()=>{
 const h=new PromptHistory('0');for(let n=1;n<=110;n++)h.push(String(n));for(let n=0;n<150;n++)h.undo();expect(h.value).toBe('11');
});
