const test=require('node:test');
const assert=require('node:assert/strict');
const {installCiGitHubApiAuth,createCiGithubReleaseFetch}=require('./ci-github-api-auth.cjs');
const endpoint='https://api.github.com/repos/2786886095/novelai-image-desktop/releases?per_page=100&page=1';
const token='fixture_ci_token_NOT_A_REAL_CREDENTIAL';
const env={GITHUB_ACTIONS:'true',CI_AGENT_GITHUB_TOKEN:token};

test('CI-only authentication preserves caller headers and signal, forbids redirects',async()=>{
 const calls=[],logs=[];const signal=new AbortController().signal;
 const transport={updateFetch:()=>assert.fail('exact release list must use authenticated fetch')};
 const response=new Response('[]',{headers:{'x-ratelimit-limit':'1000','x-ratelimit-remaining':'999','x-ratelimit-reset':'123','x-github-request-id':'ABCD:0123'}});
 const installed=installCiGitHubApiAuth(transport,{env,log:text=>logs.push(text),nativeFetch:async(...args)=>{calls.push(args);return response;}});
 const options={headers:{Accept:'application/vnd.github+json','User-Agent':'Langbai-Tavern-Agent'},signal};
 assert.equal(await transport.updateFetch(endpoint,options),response);
 assert.equal(installed.enabled,true);assert.equal(calls.length,1);
 const [url,request]=calls[0];assert.equal(url,endpoint);
 assert.equal(request.method,'GET');assert.equal(request.redirect,'error');assert.equal(request.signal,signal);
 assert.equal(request.headers.get('Authorization'),`Bearer ${token}`);
 assert.equal(request.headers.get('Accept'),options.headers.Accept);
 assert.equal(request.headers.get('User-Agent'),options.headers['User-Agent']);
 assert.equal(options.headers.Authorization,undefined);
 assert.equal(logs.length,1);assert.ok(!logs.join('').includes(token));
 assert.deepEqual(JSON.parse(logs[0]),{event:'CI_GITHUB_RELEASE_API',status:200,authenticated:true,limit:'1000',remaining:'999',reset:'123',retryAfter:null,requestId:'ABCD:0123'});
});

for(const disabledEnv of [{...env,CI_AGENT_GITHUB_TOKEN:''},{...env,CI_AGENT_GITHUB_TOKEN:undefined},{...env,GITHUB_ACTIONS:'false'}, {GITHUB_ACTIONS:'true',GH_TOKEN:token}]) {
 test(`missing explicit CI credential/non-Actions context preserves original transport (${JSON.stringify({GITHUB_ACTIONS:disabledEnv.GITHUB_ACTIONS,explicitToken:!!disabledEnv.CI_AGENT_GITHUB_TOKEN})})`,async()=>{
  const original=async(url,options)=>({url,options});const transport={updateFetch:original};
  const result=installCiGitHubApiAuth(transport,{env:disabledEnv,nativeFetch:()=>assert.fail('must not fetch'),log:()=>assert.fail('must not log')});
  assert.equal(result.enabled,false);assert.equal(transport.updateFetch,original);
  assert.equal((await transport.updateFetch(endpoint,{})).url,endpoint);
 });
}

test('only exact HTTPS API origin/repository/release-list GET is authenticated',async()=>{
 const calls=[];const original=async(url,options)=>{calls.push({url,options});return 'original';};
 const transport={updateFetch:original};
 installCiGitHubApiAuth(transport,{env,nativeFetch:()=>assert.fail('non-list requests must not receive token'),log:()=>assert.fail('must not log')});
 const urls=[
  'http://api.github.com/repos/2786886095/novelai-image-desktop/releases',
  'https://api.github.com.attacker.invalid/repos/2786886095/novelai-image-desktop/releases',
  'https://api.github.com:444/repos/2786886095/novelai-image-desktop/releases',
  'https://user:password@api.github.com/repos/2786886095/novelai-image-desktop/releases',
  'https://api.github.com/repos/other/repo/releases',
  'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/123',
  'https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v0.1.2/agent.zip',
  'https://release-assets.githubusercontent.com/asset.zip',
 ];
 for(const url of urls){const options={headers:{Range:'bytes=10-','Cache-Control':'no-cache'}};assert.equal(await transport.updateFetch(url,options),'original');assert.equal(calls.at(-1).options,options);assert.equal(options.headers.Authorization,undefined);}
 const post={method:'POST',headers:{Accept:'application/json'}};
 assert.equal(await transport.updateFetch(endpoint,post),'original');assert.equal(calls.at(-1).options,post);
});

test('public asset range transfer still uses the unchanged production transport',async()=>{
 const signal=new AbortController().signal;const options={signal,headers:{Range:'bytes=123-',Accept:'application/octet-stream'}};
 const url='https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v0.1.2/agent.zip?cacheBust=nonce';
 const response=new Response('asset',{status:206});
 const original=async(actualUrl,actualOptions)=>{assert.equal(actualUrl,url);assert.equal(actualOptions,options);assert.equal(actualOptions.headers.Authorization,undefined);return response;};
 const transport={updateFetch:original};installCiGitHubApiAuth(transport,{env,nativeFetch:()=>assert.fail('asset must not use CI API fetch')});
 assert.equal(await transport.updateFetch(url,options),response);
});

test('redirect is not followed and credential-bearing client errors are not exposed',async()=>{
 let count=0;const logs=[];const transport={updateFetch:()=>assert.fail('must not fall back after failure')};
 installCiGitHubApiAuth(transport,{env,log:text=>logs.push(text),nativeFetch:async(url,options)=>{count++;assert.equal(options.redirect,'error');throw Error(`mock forbidden redirect header ${token}`);}});
 await assert.rejects(()=>transport.updateFetch(endpoint),error=>{assert.match(error.message,/redirects forbidden/);assert.ok(!error.stack.includes(token));assert.equal(error.cause,undefined);return true;});
 assert.equal(count,1);assert.equal(logs.length,0);
});

test('HTTP 403 remains fatal at the caller gate; safe rate headers do not leak token',async()=>{
 const response=new Response('{"message":"API rate limit exceeded"}',{status:403,headers:{'x-ratelimit-limit':'1000','x-ratelimit-remaining':'0','x-ratelimit-reset':'123','retry-after':'60','x-github-request-id':token}});
 const logs=[];const transport={updateFetch:()=>assert.fail('no fallback or retry')};
 installCiGitHubApiAuth(transport,{env,log:text=>logs.push(text),nativeFetch:async()=>response});
 const observed=await transport.updateFetch(endpoint);
 assert.equal(observed,response);assert.equal(observed.ok,false);assert.equal(observed.status,403);
 assert.ok(!logs.join('').includes(token));const diagnostic=JSON.parse(logs[0]);
 assert.equal(diagnostic.remaining,'0');assert.equal(diagnostic.retryAfter,'60');assert.equal(diagnostic.requestId,null);
 await assert.rejects(async()=>{if(!observed.ok)throw Error(`Agent 更新源 HTTP ${observed.status}`);},/HTTP 403/);
});

test('restore removes only the CI adapter',()=>{
 const original=()=>{};const transport={updateFetch:original};
 const installed=installCiGitHubApiAuth(transport,{env});assert.notEqual(transport.updateFetch,original);
 installed.restore();assert.equal(transport.updateFetch,original);
});

test('invalid credentials fail without echoing credential contents',()=>{
 const invalid=`${token}\nmalicious`;assert.throws(()=>installCiGitHubApiAuth({updateFetch(){}},{env:{...env,CI_AGENT_GITHUB_TOKEN:invalid}}),error=>{assert.equal(error.message,'Invalid CI GitHub credential');assert.ok(!error.stack.includes(token));return true;});
});

test('public factory exposes the same authenticated request, without production-module edits',async()=>{
 const original=async()=>new Response('unauthenticated',{status:403});
 const nativeFetch=async(url,options)=>{assert.equal(url,endpoint);assert.equal(options.headers.get('Authorization'),`Bearer ${token}`);assert.equal(options.redirect,'error');return new Response('[]');};
 const input={token,ci:true,nativeFetch,log:()=>{}};
 const wrapped=createCiGithubReleaseFetch(original,input);
 assert.equal((await original(endpoint)).status,403);
 assert.equal((await wrapped(endpoint)).status,200);
 assert.equal((await createCiGithubReleaseFetch(original,{...input,ci:false})(endpoint)).status,403);
});
