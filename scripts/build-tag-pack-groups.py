"""Build a versioned row-id index for the source's semantic categories (no second copy of translations)."""
import csv, json, sqlite3, struct, sys
from pathlib import Path

src, packs, out = map(Path, sys.argv[1:4])
manifest=json.loads((packs/"manifest.json").read_text("utf8"))
version=manifest["updatedAt"]
dbs=sorted(packs.glob("tags-"+version+"-*.sqlite"))
if len(dbs)!=4: raise ValueError("Four matched dictionaries required")
conns=[sqlite3.connect(p.as_uri()+"?mode=ro",uri=True) for p in dbs]
try:
    rows=conns[0].execute("select rowid,tag from terms order by rowid").fetchall()
    for db in conns[1:]:
        if any(a!=b for a,b in zip(rows,db.execute("select rowid,tag from terms order by rowid"),strict=True)):
            raise ValueError("Canonical row identifiers differ between translations")
    ids={tag:idx for idx,tag in rows}
    import re
    def site(tag):
        key=re.sub(r"\s+"," ",tag.replace("_"," ").strip().lower())
        return bool(re.match(r"^rating\s*:",key) or key in {"commentary","commentary request","translated","partially translated","translation request","check translation","copyright name","tagme"})
    excluded={idx for idx,tag in rows if site(tag)}
    ordered=[idx for (idx,) in conns[0].execute("select rowid from terms order by count desc, tag") if idx not in excluded]
    groups={"all":ordered}
    suffix=version.replace("-","")
    for i in range(17):
        key=f"{i:02d}"
        (p,)=tuple(src.glob(f"{key}_*_{suffix}.csv"))
        with p.open(encoding="utf-8-sig",newline="") as f:
            reader=csv.DictReader(f)
            if "D站英文标签" not in reader.fieldnames: raise ValueError(p)
            groups[key]=list(dict.fromkeys(ids[row["D站英文标签"]] for row in reader if row["D站英文标签"] in ids and ids[row["D站英文标签"]] not in excluded))
    meta=json.dumps({"version":version,"rows":len(rows),"counts":{k:len(v) for k,v in groups.items()}},separators=(",",":")).encode()
    with out.open("xb") as f:
        f.write(b"LBT1"+struct.pack("<I",len(meta))+meta)
        for values in groups.values():f.write(struct.pack("<"+"I"*len(values),*values))
    print(meta.decode())
finally:
    for db in conns:db.close()
