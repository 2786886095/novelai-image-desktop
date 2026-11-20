"""v3.0.1 only: verify original native jobs plus the two same-SHA Android retries.
Rebuild the production matrix from immutable raw artifacts, without requiring a second iOS run.
"""
import concurrent.futures, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, zipfile
from datetime import datetime, timedelta

REPO = "2786886095/novelai-image-desktop"
RUN = 44746230248
SHA = "a3cd315029c2bc4314d5a112d3e132806392c693"
IOS = "ios-components (os)"
GPU = "windows-artist-local-proof"
MATRIX = "full-client-feature-matrix"
parts = "core text library os metadata gallery japanese generation ui workflows".split()
jobs = {f"{p}-components ({g})" for p in ("android","ios") for g in parts} | {f"desktop-components ({p})" for p in ("windows-latest","macos-15","ubuntu-24.04")} | {GPU,MATRIX}
android = {f"android-components ({k})":v for k,v in (("core",136322153826),("gallery",136322152242))}
original = {"Windows":14634275630,"Linux":14634104235,"macOS":14634556223,"android-library":14634510081,"android-ui":14633851986,"android-text":14633797300,"android-workflows":14633617879,"android-generation":14633372587,"android-os":14632974163,"android-japanese":14632954589,"android-metadata":14632834676,"ios-text":14637315719,"ios-generation":14636995872,"ios-metadata":14636699038,"ios-core":14636162162,"ios-library":14636004970,"ios-japanese":14635864182,"ios-ui":14635785955,"ios-os":14635311395,"ios-gallery":14634893717,"ios-workflows":14634494416}

def require(ok, why):
    if not ok: raise ValueError(why)
def api(path):
    return json.loads(subprocess.check_output(["gh","api",f"repos/{REPO}/actions/{path}"]))
def identity(j):
    return j["id"], j["conclusion"], [s["name"] for s in j["steps"] if s["conclusion"]=="failure"]
def time(v): return datetime.fromisoformat(v.replace("Z","+00:00"))
def audit():
    r=api(f"runs/{RUN}/attempts/1")
    require((r["head_sha"],r["status"],r["conclusion"],r["run_attempt"])==(SHA,"completed","failure",1),"unrecognized original run")
    items=api(f"runs/{RUN}/attempts/1/jobs?per_page=100")["jobs"]
    require(len(items)==len(jobs) and {j["name"] for j in items}==jobs,"original job inventory")
    exceptional={IOS:(136322152169,"failure",["Run independently counted component and client-scenario entries"]),MATRIX:(136354445320,"failure",["Verify all required cloud cells and preserve the exact matrix"]),GPU:(136322154217,"skipped",[]),**{k:(v,"failure",["Fresh disposable Android Emulator journeys"]) for k,v in android.items()}}
    for j in items:
        require(j["status"]=="completed" and j["head_sha"]==SHA and j["run_id"]==RUN and j["run_attempt"]==1,j["name"])
        require(identity(j)==exceptional.get(j["name"],(j["id"],"success",[])),j["name"]+" original result")
    latest=api(f"runs/{RUN}/jobs?per_page=100")["jobs"]
    selected={}
    for name in android:
        matching=[j for j in latest if j["name"]==name]
        require(len(matching)==1,name)
        j=matching[0]
        require(j["head_sha"]==SHA and j["run_id"]==RUN and j["run_attempt"]>=2 and j["id"]!=android[name],name+" retry identity")
        require(j["status"]=="completed" and j["conclusion"]=="success",name+" retry: "+j["status"]+"/"+str(j["conclusion"]))
        for step in ("Fresh disposable Android Emulator journeys","Run actions/upload-artifact@v4"):
            require(any(s["name"]==step and s["conclusion"]=="success" for s in j["steps"]),name+": "+step)
        selected["android-"+name.split("(")[1][:-1]]=j
    arts=api(f"runs/{RUN}/artifacts?per_page=100")["artifacts"]
    eligible=[a for a in arts if not a["expired"] and a["workflow_run"]["head_sha"]==SHA and a["workflow_run"]["id"]==RUN]
    ids=dict(original)
    for key,j in selected.items():
        candidates=[a for a in eligible if a["name"]==f"native-components-{key}-{SHA}" and time(j["started_at"])<=time(a["created_at"])<=time(j["completed_at"])+timedelta(seconds=30)]
        require(len(candidates)==1,key+" fresh upload identity")
        ids[key]=candidates[0]["id"]
    receipts={}
    for k,id in ids.items():
        a=next((a for a in eligible if a["id"]==id and a["name"]==f"native-components-{k}-{SHA}"),None)
        require(a is not None and a["digest"].startswith("sha256:") and len(a["digest"])==71,k+" artifact")
        receipts[k]={"id":id,"digest":a["digest"]}
    return {"run":RUN,"sourceSha":SHA,"originalAttempt":1,"originalIosOsJob":136322152169,"androidRetries":{k:{"id":j["id"],"attempt":j["run_attempt"]} for k,j in selected.items()},"artifacts":receipts}

def prepare(record):
    root=pathlib.Path(tempfile.mkdtemp(prefix="v301-native-"))
    def unpack(pair):
        key,a=pair
        dest=root/key
        dest.mkdir()
        with tempfile.TemporaryFile() as f:
            subprocess.run(["gh","api",f"repos/{REPO}/actions/artifacts/{a['id']}/zip"],stdout=f,check=True)
            f.seek(0)
            require("sha256:"+hashlib.file_digest(f,"sha256").hexdigest()==a["digest"],key+" digest")
            f.seek(0)
            with zipfile.ZipFile(f) as z:
                for i in z.infolist():
                    require((dest/i.filename).resolve().is_relative_to(dest) and not i.filename.startswith(("/","\\")) and ".." not in pathlib.PurePosixPath(i.filename).parts,"unsafe archive member")
                z.extractall(dest)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(unpack,record["artifacts"].items()))
    require(not pathlib.Path("release-evidence").exists(),"refuse stale matrix")
    shutil.copytree(root/"ios-os","reviewed-ios-os")
    subprocess.run(["node","scripts/feature-acceptance/build-full-feature-matrix.mjs",str(root),"release-evidence",SHA,"3.0.1"],check=True)
    pathlib.Path("release-evidence/native-attempts.json").write_text(json.dumps(record,sort_keys=True))
if __name__=="__main__":
    record=audit()
    if sys.argv[1:]==["prepare"]: prepare(record)
    else: require(sys.argv[1:]==["verify"],"expected prepare or verify")
    print(json.dumps(record,sort_keys=True))
