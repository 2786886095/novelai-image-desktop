import {it,expect} from 'vitest';
import fs from 'node:fs';
import {compatibleProposalPrompt} from './compatible-proposal';
const cases=JSON.parse(fs.readFileSync('shared/compatible-proposal-fixtures.json','utf8'));
for(const c of cases)it(`compatible proposal: ${c.name}`,()=>{
 const before=JSON.stringify(c.proposal);
 if(c.error)expect(()=>compatibleProposalPrompt(c.proposal)).toThrow(c.error);
 else {expect(compatibleProposalPrompt(c.proposal)).toBe(c.expected);expect(compatibleProposalPrompt(c.proposal)).toBe(c.expected);}
 expect(JSON.stringify(c.proposal)).toBe(before);
});
