import ast
import hashlib
import json
import math
import os
import random
import re
import shutil
import stat
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace

source = Path(__file__).with_name("artist-detective-live.py")
tree = ast.parse(source.read_text(encoding="utf-8"))
tree.body = [item for item in tree.body if isinstance(item, ast.FunctionDef)
             and item.name in {"search_with_locked_artists", "copy_selected_result"}]
from hashlib import sha256
def file_sha256(file):
    return sha256(file.read_bytes()).hexdigest()
def atomic_json(file,value):
    file.write_text(json.dumps(value,ensure_ascii=False),encoding="utf-8")
exec(compile(tree,str(source),"exec"))

lock = [{"tag":"patzzi","weight":1.25}]
class FakeGenerator:
    def __init__(self):
        names=["patzzi","a","b","c","d","e"]
        rows=[{"canonical_tag":tag} for tag in names]
        self.store=SimpleNamespace(catalog=rows,lookup=dict(zip(names,rows)))
        self.manifest={}
        self.paid=0
    def generate(self,requests):
        images=[]
        for r in requests:
            assert [a for a in r["artists"] if a["tag"]=="patzzi"]==lock
            assert len(r["artists"])==len({a["tag"] for a in r["artists"]})<=12
            key=sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()
            if key not in self.manifest:
                self.manifest[key]={"image":str(root/(key+".png")),"image_sha256":key,"request_hash":key}
                self.paid+=1
            images.append(self.manifest[key])
        return images

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp).resolve()
    target={"content_tags":"fixture","style_tags":"","width":32,"height":32,"image_sha256":"fixture"}
    cfg=SimpleNamespace(random_seed=42,search_seeds=2,final_seeds=4,extra_final_seeds=0,
        render_budget=56,finalists=4,rounds=2,population=16,weight_sigma=.22,
        proposal_pool_multiplier=3,proposal_exploration_fraction=.25)
    fake=FakeGenerator()
    args=(target,[[{"tag":"a","weight":1}]],["a","b","c"],lock,fake,
          lambda files:[float(int(file.stem[0],16))/16 for file in files],
          root/"search",cfg,lambda recipes:[0.2]*len(recipes),lambda *a,**k:None)
    first=search_with_locked_artists(*args)
    assert fake.paid==56
    assert len(first["history"])==20 and len(first["finalists"])==4
    assert search_with_locked_artists(*args)==first and fake.paid==56
    print("locked patzzi@1.25 in all 56 search/finalist requests; repeat reused 56 cached results")
    image=root/"original.png"; image.write_bytes(b"reference PNG bytes")
    dest=root/"user-selected";dest.mkdir()
    key="a"*64
    copy_selected_result(dest,key,image,file_sha256(image))
    copy_selected_result(dest,key,image,file_sha256(image))
    assert (dest/(key+".png")).read_bytes()==image.read_bytes()
    collision=dest/("b"*64+".png");collision.write_bytes(b"user-owned unrelated file")
    try:
        copy_selected_result(dest,"b"*64,image,file_sha256(image))
    except FileExistsError:
        pass
    else:
        raise AssertionError("Expected a name collision to be refused")
    assert collision.read_bytes()==b"user-owned unrelated file"
    print("selected folder received identical bytes; repeat was idempotent; existing file not overwritten")
