"""Produce a bounded, ranked capsule browse preview from the source's 00–16 CSVs."""
import csv
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

source, output = map(Path, sys.argv[1:3])
updated_at = date.fromisoformat(sys.argv[3]).isoformat()
suffix = updated_at.replace("-", "")
tag_version = Path(__file__).resolve().parents[1] / "shared/multilingual-tag-packs.json"
if json.loads(tag_version.read_text(encoding="utf-8"))["updatedAt"] != updated_at:
    raise ValueError("Browse categories must match the installed dictionary version.")
groups = []
for index in range(17):
    key = f"{index:02d}"
    (path,) = tuple(source.glob(f"{key}_*_{suffix}.csv"))
    items = []
    seen = set()
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = csv.DictReader(stream)
        if not {"D站英文标签", "全站使用量排名", f"使用量(作品数_截至{updated_at})"} <= set(rows.fieldnames or []):
            raise ValueError(f"Unexpected source layout: {path.name}")
        previous_rank = 0
        for row in rows:
            rank = int(row["全站使用量排名"])
            if rank < previous_rank:
                raise ValueError(f"Unsorted tag source: {path.name}")
            previous_rank = rank
            tag = row["D站英文标签"]
            if tag and tag not in seen:
                seen.add(tag)
                items.append(tag)
            if len(items) >= 96:
                break
    if not items:
        raise ValueError(f"Empty tag group: {path.name}")
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    groups.append({"id": key, "source": path.name, "sha256": digest, "tags": items})
with output.open("x", encoding="utf-8", newline="\n") as stream:
    stream.write(json.dumps({"updatedAt": updated_at, "previewLimit": 96, "groups": groups}, ensure_ascii=False, separators=(",", ":")) + "\n")
print(json.dumps({"groups": len(groups), "previewRows": sum(len(g["tags"]) for g in groups)}, ensure_ascii=False))
