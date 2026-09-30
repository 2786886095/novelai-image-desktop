import {useLayoutEffect,useRef,useReducer} from 'react';
import {PromptHistory} from './prompt-history';

export function usePromptHistory(value:string,onChange:(next:string)=>void,field:string) {
 const histories=useRef(new Map<string,PromptHistory>()),[,refresh]=useReducer(n=>n+1,0);
 if(!histories.current.has(field))histories.current.set(field,new PromptHistory(value));
 const history=histories.current.get(field)!;
 // Imports, presets and edits from another surface are also undoable.
 useLayoutEffect(()=>{if(history.push(value))refresh();},[value,history]);
 return {
  canUndo:history.canUndo,canRedo:history.canRedo,
  commit(next:string,typing=false){if(history.push(next,typing)){onChange(next);refresh();}},
  undo(){if(history.canUndo){onChange(history.undo());refresh();}},
  redo(){if(history.canRedo){onChange(history.redo());refresh();}},
 };
}
