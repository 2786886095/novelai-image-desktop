import subprocess,sys,pathlib,json,re,hashlib
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True);sha=sys.argv[3];device=sys.argv[4];platform=sys.argv[5]
command=['flutter','test','integration_test/native_acceptance_test.dart','-d',device,'--dart-define=ACCEPTANCE_SOURCE_SHA='+sha,'--reporter=expanded']
p=subprocess.run(command,cwd=root/'mobile',text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.PIPE)
(out/'stdout.log').write_text(p.stdout);(out/'stderr.log').write_text(p.stderr);print(p.stdout);print(p.stderr,file=sys.stderr)
cases=[]
for line in p.stdout.splitlines():
 if 'NATIVE_MOBILE_CASE:' in line:
  try: cases.append(json.loads(line.split('NATIVE_MOBILE_CASE:',1)[1]))
  except json.JSONDecodeError: pass
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==sha
before=json.loads((out/'application-lib-hashes.json').read_text());after={str(q.relative_to(root)):hashlib.sha256(q.read_bytes()).hexdigest() for q in (root/'mobile/lib').rglob('*') if q.is_file()};assert after==before['files']
expected={'Real native credential/preferences/path-provider readback','OpenAI real AppState multipart status 200','OpenAI real AppState multipart status 422','Actual native filesystem/group/index/cache transaction','Native loopback MCP authentication/lifecycle','Native renderer expanded records scroll','Native device core-screen responsive text 200 percent'}
pass_=p.returncode==0 and len(cases)==7 and {c['name'] for c in cases}==expected and all(c['pass'] and c['platform']==platform and c['sourceSha']==sha for c in cases)
(out/'execution.json').write_text(json.dumps({'schema':1,'sourceSha':sha,'platform':platform,'device':device,'kind':'device','command':command,'stdout':p.stdout,'stderr':p.stderr,'exitStatus':p.returncode,'cases':cases,'pass':pass_,'paidCalls':0,'applicationLibUnmodified':True,'full39FeatureAcceptance':False},indent=2))
sys.exit(0 if pass_ else 1)
