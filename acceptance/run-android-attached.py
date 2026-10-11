"""CI-only Android launch/attach with authenticated, observed native VM URI.
Read logs before launch, forward only its actual port, retain every assertion.
No production library, certificate policy or test deadline is changed.
"""
import json,os,pathlib,re,subprocess,sys,threading,time,urllib.parse
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();sha,device=sys.argv[3:5]
assert os.environ.get('GITHUB_ACTIONS')=='true'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==sha
package='com.codex.novelai.novelai_mobile'
assert ('applicationId "'+package+'"') in (root/'mobile/android/app/build.gradle').read_text() or ('applicationId = "'+package+'"') in (root/'mobile/android/app/build.gradle').read_text()
def call(name,cmd,cwd=None):
 p=subprocess.run(cmd,cwd=cwd,text=True,encoding='utf-8',errors='replace',capture_output=True)
 (out/(name+'.json')).write_text(json.dumps({'command':cmd,'exitStatus':p.returncode,'stdout':p.stdout,'stderr':p.stderr},indent=2))
 print(p.stdout,end='',flush=True);print(p.stderr,end='',file=sys.stderr,flush=True)
 assert p.returncode==0,name+' failed'
 return p.stdout
call('android-build',['flutter','build','apk','--debug','--target=integration_test/native_acceptance_test.dart','--no-pub','--dart-define=ACCEPTANCE_SOURCE_SHA='+sha],root/'mobile')
apk=root/'mobile/build/app/outputs/flutter-apk/app-debug.apk';assert apk.is_file()
call('android-install',['adb','-s',device,'install','-r',str(apk)])
call('android-stop-prior-own-app',['adb','-s',device,'shell','am','force-stop',package])
log_file=(out/'attached-android-device.log').open('w',encoding='utf-8');messages=[]
reader=subprocess.Popen(['adb','-s',device,'logcat','-v','threadtime'],text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
def capture():
 for line in reader.stdout:
  messages.append(line);log_file.write(line);log_file.flush()
thread=threading.Thread(target=capture,daemon=True);thread.start();forwarded=None
try:
 time.sleep(2)
 launch_at=len(messages)
 call('android-launch-unpaused',['adb','-s',device,'shell','am','start','-W','-n',package+'/.MainActivity'])
 pid=None;pid_attempts=[];pid_deadline=time.monotonic()+30
 while time.monotonic()<pid_deadline:
  command=['adb','-s',device,'shell','pidof',package]
  probe=subprocess.run(command,text=True,encoding='utf-8',capture_output=True)
  pid_attempts.append({'command':command,'exitStatus':probe.returncode,'stdout':probe.stdout,'stderr':probe.stderr})
  if probe.returncode==0 and re.fullmatch(r'\d+',probe.stdout.strip()):pid=probe.stdout.strip();break
  time.sleep(.2)
 (out/'android-own-pid.json').write_text(json.dumps(pid_attempts,indent=2))
 assert pid,'No owned CI app process after waited activity launch; preserve logs, never count pass'
 uri=None;deadline=time.monotonic()+90
 while time.monotonic()<deadline:
  for line in messages[launch_at:]:
   parts=line.split()
   if len(parts)>3 and parts[2]==pid and 'Dart VM service is listening on' in line:
    m=re.search(r'http://127\.0\.0\.1:\d+/[A-Za-z0-9_=\-]+/',line)
    if m:uri=m[0];break
  if uri:break
  time.sleep(.2)
 assert uri,'No authenticated VM URI from freshly launched native PID; never count pass'
 u=urllib.parse.urlparse(uri);assert u.hostname=='127.0.0.1' and u.port and u.path not in ['', '/']
 host=call('android-owned-port-forward',['adb','-s',device,'forward','tcp:0','tcp:'+str(u.port)]).strip();assert host.isdigit() and 0<int(host)<65536;forwarded='tcp:'+host
 host_uri='http://127.0.0.1:'+host+u.path
 response_path=out/'android-driver-response.json';env={**os.environ,'NATIVE_RESPONSE_PATH':str(response_path)}
 command=['flutter','drive','-d',device,'--no-pub','--use-existing-app='+host_uri,'--driver=test_driver/native_acceptance_driver.dart','--no-keep-app-running']
 p=subprocess.run(command,cwd=root/'mobile',env=env,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=720)
 (out/'android-attached-driver-command.json').write_text(json.dumps({'command':command,'exitStatus':p.returncode,'stdout':p.stdout,'stderr':p.stderr},indent=2))
 print(p.stdout,end='',flush=True);print(p.stderr,end='',file=sys.stderr,flush=True)
 if response_path.exists():
  response=json.loads(response_path.read_text());assert isinstance(response,dict) and isinstance(response.get('cases'),list)
  for case in response['cases']:print('NATIVE_MOBILE_CASE:'+json.dumps(case),flush=True)
 sys.exit(p.returncode)
finally:
 if forwarded:subprocess.run(['adb','-s',device,'forward','--remove',forwarded],capture_output=True)
 reader.terminate()
 try:reader.wait(timeout=10)
 except subprocess.TimeoutExpired:reader.kill();reader.wait()
 thread.join(timeout=5);log_file.close()
