"""ARM64 Linux guest startup gate. Not a substitute for Android device testing."""
import collections
import os
import queue
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

root=sys.argv[1]
env=['DSH_HOME=/studio-home','HOME=/studio-home','DSH_ROLEPLAY_DATA_DIR=/studio-home/roleplay',
     'STUDIO_WORKSPACE=/workspace','STUDIO_BRIDGE_URL=http://127.0.0.1:9',
     'STUDIO_BRIDGE_TOKEN=probe-no-actions','STUDIO_DSH_TOOLS=/opt/agent/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js']
prefix=['sudo','chroot',root,'/usr/bin/env',*env,'/usr/local/bin/node']
subprocess.run([*prefix,'/opt/agent/seed-home.mjs'],check=True,timeout=120)
args=[*prefix,'/opt/agent/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js','web']
for name in ['studio','studio-community','studio-roleplay-default','studio-preview','studio-data']:
    args+=['--patch',f'/studio-home/{name}.patch.yml']
args+=['--no-open','--host','127.0.0.1','--port','0']
process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
lines=queue.Queue();tail=collections.deque(maxlen=18)
def reader():
    for line in process.stdout: lines.put(line)
threading.Thread(target=reader,daemon=True).start()
ready=None;deadline=time.monotonic()+120;fail=False
try:
    while time.monotonic()<deadline:
        try:line=lines.get(timeout=.2)
        except queue.Empty:
            if process.poll() is not None:raise RuntimeError('Guest exited early')
            if ready and time.monotonic()-ready>5:break
            continue
        tail.append(re.sub(r'https?://\S+','[URL]',line.strip()))
        if 'Failed to load plugins' in line or 'entries did not activate' in line:raise RuntimeError('Guest plugin boot failed')
        found=re.search(r'http://127\.0\.0\.1:(\d+)',line)
        if found:
            try:
                urllib.request.urlopen('http://127.0.0.1:'+found[1]+'/',timeout=3).close();ready=time.monotonic()
            except urllib.error.HTTPError as error:
                if error.code==401:ready=time.monotonic()
    if ready is None:raise RuntimeError('Guest readiness timed out')
    print('ARM64 LINUX GUEST STARTUP PASS: full host plugin composition; no model/tool actions sent')
except Exception:
    print('\n'.join(tail));raise
finally:
    # Only this owned probe process group; never kill unrelated processes.
    subprocess.run(['sudo','kill','--','-'+str(process.pid)],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:process.wait(timeout=8)
    except subprocess.TimeoutExpired:subprocess.run(['sudo','kill','-KILL','--','-'+str(process.pid)],check=False)
