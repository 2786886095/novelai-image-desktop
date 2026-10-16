import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../../mobile/android/app/src/androidTest/kotlin/com/codex/novelai/novelai_mobile/agent/AgentInstrumentation.kt',import.meta.url),'utf8');
test('non-QA instrumentation is rejected before the evidence writer or runtime exists (source contract, not device execution)',()=>{
 const start=source.indexOf('override fun onStart()');
 const rejection=source.indexOf('QA package isolation required',start);
 const evidence=source.indexOf('val evidence=',start);
 assert(rejection>start&&rejection<evidence,'Non-QA rejection must precede the evidence try/catch');
 const guard=source.slice(start,evidence);
 assert(guard.includes('com.codex.novelai.novelai_mobile.agenttest'));
 assert(guard.includes('return'));
 assert(!guard.includes('writeText')&&!guard.includes('LocalAgentRuntime.get'));
});
