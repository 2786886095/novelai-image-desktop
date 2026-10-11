"""Prepare a fresh disposable CI simulator; keep real Flutter tests unchanged."""
import json, os, pathlib, plistlib, subprocess, sys, time
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();sha=sys.argv[3]
assert os.environ.get('GITHUB_ACTIONS')=='true', 'Never reset or install into a user simulator'
out.mkdir(parents=True,exist_ok=True);steps=[]
def run(label,args,cwd=None,allowed=(0,)):
    p=subprocess.run(args,cwd=cwd,text=True,encoding='utf-8',errors='replace',capture_output=True)
    record={'label':label,'command':args,'cwd':str(cwd) if cwd else None,'exitStatus':p.returncode,'stdout':p.stdout,'stderr':p.stderr};steps.append(record)
    (out/'ios-preparation.json').write_text(json.dumps({'sourceSha':sha,'steps':steps},indent=2))
    print(label,'exit',p.returncode,flush=True);print(p.stdout[-3000:],flush=True);print(p.stderr[-1500:],flush=True)
    assert p.returncode in allowed, label
    return p
assert run('Exact app revision',['git','rev-parse','HEAD'],root).stdout.strip()==sha
inventory=json.loads(run('Runtime inventory',['xcrun','simctl','list','runtimes','-j']).stdout)
runtime=next(r['identifier'] for r in inventory['runtimes'] if r.get('isAvailable') and r.get('version')=='18.5')
device=run('Create fresh CI iPhone',['xcrun','simctl','create','NovelAI Native Acceptance','com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',runtime]).stdout.strip()
(out/'device-id.txt').write_text(device)
run('Boot fresh simulator',['xcrun','simctl','boot',device]);run('Wait for OS boot',['xcrun','simctl','bootstatus',device,'-b'])
# Build outside the test loader's 12-minute deadline. Do not change test timeout,
# skip assertions, disable code signing security on release builds, or touch lib/.
run('Build exact simulator instrumentation',['flutter','build','ios','--simulator','--debug','--target=integration_test/native_acceptance_test.dart','--dart-define=ACCEPTANCE_SOURCE_SHA='+sha],root/'mobile')
application=root/'mobile/build/ios/iphonesimulator/Runner.app'
with (application/'Info.plist').open('rb') as f:bundle=plistlib.load(f)['CFBundleIdentifier']
run('Install actual simulator app',['xcrun','simctl','install',device,str(application)])
ready=False
for attempt in range(15):
    p=run('Read installed bundle '+str(attempt),['xcrun','simctl','get_app_container',device,bundle,'app'],allowed=(0,1))
    if p.returncode==0 and pathlib.Path(p.stdout.strip()).is_dir():ready=True;break
    time.sleep(2)
assert ready,'Application never registered with the simulator; do not report tests as passed'
print('NATIVE_IOS_PREPARED',device,bundle,sha,flush=True)
