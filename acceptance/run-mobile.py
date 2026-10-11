import subprocess,sys,pathlib,json,re,hashlib,threading,os,signal
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True);sha=sys.argv[3];device=sys.argv[4];platform=sys.argv[5];suite=sys.argv[6] if len(sys.argv)>6 else 'core'
command=['flutter','test','integration_test/native_acceptance_test.dart','-d',device,'--dart-define=ACCEPTANCE_SOURCE_SHA='+sha,'--reporter=expanded']
if suite=='flows':command += ['--plain-name','native flows']
elif suite=='breadth':command += ['--plain-name','native breadth']
elif suite=='core':command += ['--name','^(?!native breadth)']
else:assert suite=='all'
device_logs=None
if platform=='android':
 assert suite=='all', 'Run all native assertions through official integrationDriver'
 driver=root/'mobile/test_driver/native_acceptance_driver.dart';driver.parent.mkdir(exist_ok=True)
 driver.write_text("import 'dart:convert';\nimport 'dart:io';\nimport 'package:integration_test/integration_test_driver.dart';\nFuture<void> main() async { await integrationDriver(timeout: const Duration(minutes:12),writeResponseOnFailure:true,responseDataCallback:(data) async {await File(Platform.environment['NATIVE_RESPONSE_PATH']!).writeAsString(jsonEncode(data));});}\n")
 import os
 os.environ['NATIVE_RESPONSE_PATH']=str(out/'android-driver-response.json')
 command=['flutter','drive','--no-start-paused','--target=integration_test/native_acceptance_test.dart','--driver=test_driver/native_acceptance_driver.dart','-d',device,'--no-pub','--dart-define=ACCEPTANCE_SOURCE_SHA='+sha]
 log=(out/'android-native-logcat.log').open('w')
 device_logs=subprocess.Popen(['adb','-s',device,'logcat','-v','threadtime'],stdout=log,stderr=subprocess.STDOUT)
if platform=='ios':
 assert suite=='all', 'Attached iOS fixture executes every assertion, never filter cases'
 command=[sys.executable,str(pathlib.Path(__file__).with_name('run-ios-attached.py')),str(root),str(out),sha,device]
 log=(out/'simulator-device.log').open('w')
 device_logs=subprocess.Popen(['xcrun','simctl','spawn',device,'log','stream','--style','compact','--level','debug','--predicate','process == "Runner" OR eventMessage CONTAINS[c] "Dart"'],stdout=log,stderr=subprocess.STDOUT)
p=subprocess.Popen(command,cwd=root/'mobile',text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
streams={}
def copy_stream(key,stream,destination):
 lines=[]
 with destination.open('w',encoding='utf-8') as output:
  for line in stream:
   lines.append(line);output.write(line);output.flush();print(line,end='',file=sys.stderr if key=='stderr' else sys.stdout,flush=True)
 streams[key]=''.join(lines)
threads=[threading.Thread(target=copy_stream,args=(key,getattr(p,key),out/(key+'.log'))) for key in ['stdout','stderr']]
for thread in threads:thread.start()
try:p.wait(timeout=720)
except subprocess.TimeoutExpired:
 print('NATIVE_COMMAND_DEADLINE_EXCEEDED_12_MINUTES',file=sys.stderr,flush=True)
 os.killpg(p.pid,signal.SIGTERM)
 try:p.wait(timeout=15)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
for thread in threads:thread.join()
if device_logs is not None:
 device_logs.terminate()
 try:device_logs.wait(timeout=10)
 except subprocess.TimeoutExpired:device_logs.kill();device_logs.wait()
 log.close()
stdout=streams['stdout'];stderr=streams['stderr']
cases=[]
for line in stdout.splitlines():
 if 'NATIVE_MOBILE_CASE:' in line:
  try: cases.append(json.loads(line.split('NATIVE_MOBILE_CASE:',1)[1]))
  except json.JSONDecodeError: pass
response_path=out/({'android':'android-driver-response.json','ios':'attached-driver-response.json'}[platform])
if response_path.exists():
 response=json.loads(response_path.read_text());assert isinstance(response,dict) and isinstance(response.get('cases'),list)
 cases=response['cases']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==sha
before=json.loads((out/'application-lib-hashes.json').read_text());after={str(q.relative_to(root)):hashlib.sha256(q.read_bytes()).hexdigest() for q in (root/'mobile/lib').rglob('*') if q.is_file()};assert after==before['files']
expected={'Real native credential/preferences/path-provider readback','OpenAI real AppState multipart status 200','OpenAI real AppState multipart status 422','Actual native filesystem/group/index/cache transaction','Native loopback MCP authentication/lifecycle','Native renderer expanded records scroll','Native device core-screen responsive text 200 percent'}
expected |= {'Native NovelAI generation '+x for x in ['high','medium','503','401']}
expected |= {'Native image action '+x for x in ['img2img','inpaint','colorize','upscale']}
expected |= {'Native cold '+k+' '+str(s) for k in ['convert','reverse'] for s in [200,401]}
expected |= {'Native WebP '+n for n in ['lossy', 'lossless', 'alpha', 'animated', 'novelai-exif-v5', 'novelai-exif-v5-be']}
expected.add('Native clipboard text roundtrip')
metadata={'Native official metadata '+f['name'] for f in json.loads((root/'shared/official-image-metadata-fixtures/manifest.json').read_text())}
expected |= metadata
issueCases={'Native issue70 reopened pair '+x for x in ['en','auto']} | {'Native issue71 geometry scale '+str(x) for x in [1.0,1.5,2.0]} | {'Native issue69 preflight single submit stream '+str(x).lower() for x in [False,True]} | {'Native issue68 exact fullwidth comma caller'}
expected |= issueCases

breadth=set(['Native negative library cold CRUD and exact export', 'Native negative preview search and explicit append', 'Native named characters positive/style cold persistence', 'Native precise reference archive/apply/delete', 'Native vibe reference archive/apply/delete', 'Native favorites actual copy dedup rename and removal', 'Native font import engine readback and 200 percent persistence', 'Native backup archive restore rescue and idempotency', 'Native corrupt backup rejects without state mutation', 'Native comic batch agent state cold recovery'])
breadth.add('Native backup distinct characters repeat-import identity')
if suite=="breadth":expected=breadth
elif suite=="all":expected |= breadth
flows={'Native translation '+s for s in ['200','401','empty']} | {'Native gallery '+s for s in ['200','retry','timeout']} | {'Native update '+s for s in ['manifest','fallback','unavailable']} | {'Native durable generation '+s for s in ['batch','batch-cancel','comic-503','artist-promote']}
flows |= {'Native phone all15 navigation reduced='+str(x).lower() for x in [False,True]}
flows.add('Native routed TLS validated and unknown host blocked')
flows |= {'Native AppState enhance '+x for x in ['normal','medium-max','503']}
if suite=='flows':expected=flows
elif suite=='all':expected |= flows
pass_=p.returncode==0 and len(cases)==len(expected) and {c['name'] for c in cases}==expected and all(c['pass'] and c['platform']==platform and c['sourceSha']==sha for c in cases)
(out/'execution.json').write_text(json.dumps({'schema':1,'sourceSha':sha,'platform':platform,'device':device,'kind':'device','command':command,'stdout':stdout,'stderr':stderr,'exitStatus':p.returncode,'cases':cases,'pass':pass_,'paidCalls':0,'applicationLibUnmodified':True,'full39FeatureAcceptance':False,'suite':suite,'expectedCaseCount':len(expected)},indent=2))
sys.exit(0 if pass_ else 1)
