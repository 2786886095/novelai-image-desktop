import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adaptSessionSources} from './session-v4.mjs';
import {releasedV4SessionFormatCodec as codec} from '../../.tmp/harness-component012/runtime/node_modules/@deepseek-ai/dsh-session-format-v3-to-v4/lib/index.js';

for(const producer of ['rp-core','rp-conversation-summary','mindspace-session-memory']) {
  test(`${producer}: actual V4 codec accepts adapted source and preserves metadata`,()=>{
    const original=`({kind: 'plugin', plugin: '${producer}', form: 'writer-ready', rpRun: {turn: 1}})`;
    const event=source=>({seq:0,type:'user/message',timestamp:1,data:{id:'test-message',role:'user',content:[{type:'text',text:'test'}],source}});
    assert.throws(()=>codec.encodeEvent(event(Function('return '+original)())),/producer-owned/);
    const adapted=adaptSessionSources(original);
    const source=Function('return '+adapted)();
    assert.equal(source.kind,`plugin:${producer}`);
    assert.deepEqual(source.rpRun,{turn:1});assert.equal(source.form,'writer-ready');
    assert.doesNotThrow(()=>codec.encodeEvent(event(source)));
    assert.equal(adaptSessionSources(adapted),adapted);
  });
}
test('does not modify user text, non-plugin sources or unknown third-party producers',()=>{
  for(const text of ["{kind:'model',provider:'test'}","{kind:'plugin',plugin:'unknown-custom'}",'user conversation']) assert.equal(adaptSessionSources(text),text);
});
