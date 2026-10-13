// CI smoke-test adapter only. Never add credentials to the production redirecting
// download transport, public asset requests, application settings or artifacts.
function createCiGithubReleaseFetch(originalFetch, {token,ci=false,nativeFetch=globalThis.fetch,log=console.log}={}) {
 if(!ci||!token)return originalFetch;
 if(typeof token!=='string'||/\s/.test(token))throw Error('Invalid CI GitHub credential');
 if(typeof originalFetch!=='function'||typeof nativeFetch!=='function')throw Error('Missing CI fetch transport');
 return async function(url,options={}) {
  let target;try{target=new URL(String(url));}catch{return originalFetch(url,options);}
  const method=String(options.method??'GET').toUpperCase();
  if(target.origin!=='https://api.github.com'||target.username||target.password||
     target.pathname!=='/repos/2786886095/novelai-image-desktop/releases'||method!=='GET')return originalFetch(url,options);
  const headers=new Headers(options.headers);
  headers.set('Authorization',`Bearer ${token}`);
  let response;
  try {
   // native fetch rejects a redirect before following it with the CI credential.
   response=await nativeFetch(target.href,{...options,method:'GET',headers,redirect:'error'});
  } catch {
   // Do not propagate an adapter/HTTP-client error that could contain headers.
   throw Error('CI authenticated GitHub release-list request failed (redirects forbidden)');
  }
  const safeNumber=name=>/^\d+$/.test(response.headers.get(name)??'')?response.headers.get(name):null;
  const requestId=response.headers.get('x-github-request-id');
  const diagnostic={event:'CI_GITHUB_RELEASE_API',status:response.status,authenticated:true,
   limit:safeNumber('x-ratelimit-limit'),remaining:safeNumber('x-ratelimit-remaining'),
   reset:safeNumber('x-ratelimit-reset'),retryAfter:safeNumber('retry-after'),
   requestId:/^[a-f0-9:]{1,100}$/i.test(requestId??'')?requestId:null};
  log(JSON.stringify(diagnostic).replaceAll(token,'[REDACTED]'));
  // Preserve every HTTP failure for queryCompatibleHarness's existing gate.
  return response;
 };
}

function installCiGitHubApiAuth(transport, {env=process.env,nativeFetch=globalThis.fetch,log=console.log}={}) {
 const original=transport.updateFetch;
 transport.updateFetch=createCiGithubReleaseFetch(original,{token:env.CI_AGENT_GITHUB_TOKEN,ci:env.GITHUB_ACTIONS==='true',nativeFetch,log});
 return {enabled:transport.updateFetch!==original,restore(){transport.updateFetch=original;}};
}
module.exports={createCiGithubReleaseFetch,installCiGitHubApiAuth};
