import {expect,it} from 'vitest';
import {Type,validateToolArguments} from '@earendil-works/pi-ai';
import {agentQuestionToolSchema,initialAgentQuestionAnswers,normalizeAgentQuestions,validateAgentQuestionAnswers} from './questions';
it('actual Pi validator accepts empty optional prompt_note and drops it from the UI contract',()=>{
 const input={questions:[{prompt:'Choose',prompt_note:'',options:[{label:'First',description:'',recommended:true},{label:'Second'}]}]};
 const tool={name:'langbai_ask_question',description:'question',parameters:Type.Object({args:Type.Unsafe(agentQuestionToolSchema)},{additionalProperties:false})};
 expect(()=>validateToolArguments(tool,{type:'toolCall',id:'test',name:tool.name,arguments:{args:input}})).not.toThrow();
 const questions=normalizeAgentQuestions(input);expect(JSON.stringify(questions)).not.toContain('prompt_note');expect(questions[0].options[0].description).toBeUndefined();
 const request={id:'fixture',conversationId:'fixture',questions,messageId:'fixture'};expect(()=>validateAgentQuestionAnswers(request,initialAgentQuestionAnswers(request))).toThrow();
 expect(validateAgentQuestionAnswers(request,[{questionId:'q1',optionId:'o1'}])).toEqual([{questionId:'q1',optionId:'o1'}]);
});
it('metadata tolerance does not permit extra tool authority or unknown choices',()=>{
 const tool={name:'langbai_ask_question',description:'question',parameters:Type.Object({args:Type.Unsafe(agentQuestionToolSchema)},{additionalProperties:false})};
 expect(()=>validateToolArguments(tool,{type:'toolCall',id:'test',name:tool.name,arguments:{args:{questions:[{prompt:'Q',approvePaid:true,options:[{label:'A'},{label:'B'}]}]}}})).toThrow();
 expect(()=>normalizeAgentQuestions({questions:[{prompt:'Q',options:[{label:'A',recommended:true},{label:'B',recommended:true}]}]})).toThrow();
});
