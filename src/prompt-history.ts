/** Bounded, per-field session history. Programmatic actions are separate undo steps. */
export class PromptHistory {
 private values:string[];
 private cursor=0;
 private lastTyping=Number.NEGATIVE_INFINITY;
 constructor(value:string,private readonly limit=100){this.values=[value];}
 get value(){return this.values[this.cursor];}
 get canUndo(){return this.cursor>0;}
 get canRedo(){return this.cursor<this.values.length-1;}
 push(next:string,typing=false,now=Date.now()) {
  if(next===this.value)return false;
  const merge=typing&&now-this.lastTyping<600&&this.cursor===this.values.length-1&&this.cursor>0;
  this.values=this.values.slice(0,this.cursor+1);
  if(merge)this.values[this.cursor]=next;
  else {this.values.push(next);this.cursor++;}
  if(this.values.length>this.limit){this.values.shift();this.cursor--;}
  this.lastTyping=typing?now:Number.NEGATIVE_INFINITY;return true;
 }
 undo(){this.lastTyping=Number.NEGATIVE_INFINITY;if(this.canUndo)this.cursor--;return this.value;}
 redo(){this.lastTyping=Number.NEGATIVE_INFINITY;if(this.canRedo)this.cursor++;return this.value;}
}
