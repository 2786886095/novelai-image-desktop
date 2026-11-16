"""Build checksum-bound desktop tag packs from the sorted four-language CSV."""
import csv
import gzip
import hashlib
import json
from datetime import date
import shutil
import sqlite3
import sys
import unicodedata
from pathlib import Path

source=Path(sys.argv[1])
output=Path(sys.argv[2])
manifest=Path(sys.argv[3])
version=date.fromisoformat(sys.argv[4] if len(sys.argv)>4 else '2026-11-15').isoformat()
languages={'zh-CN':6,'zh-TW':7,'ja-JP':8,'ko-KR':9}
def fold(value):
    return " ".join(unicodedata.normalize("NFKC",value).lower().replace("_"," ").split())
def category(row):
    name=row[4]
    if name.startswith("角色"): return 4
    if name.startswith(("作品","動漫","动漫")): return 3
    if "元标签" in name and ("元" in row[5] or "质量" in row[5] or "画质" in row[5]): return 5
    return 0
def sha(path):
    with path.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
packs={}
for lang,column in languages.items():
    file=output/f'tags-{version}-{lang}.sqlite'
    if file.exists(): raise RuntimeError(f'Existing output: {file}')
    db=sqlite3.connect(file)
    db.executescript('''
    PRAGMA journal_mode=OFF;
    PRAGMA synchronous=OFF;
    CREATE TABLE info(language TEXT, updated_at TEXT);
    CREATE TABLE terms(tag TEXT PRIMARY KEY, key TEXT NOT NULL, translated TEXT NOT NULL, translated_key TEXT NOT NULL, category INTEGER NOT NULL, count INTEGER NOT NULL);
    ''')
    with source.open('r',encoding='utf-8-sig',newline='') as f:
        reader=csv.reader(f)
        header=next(reader)
        if len(header)<10 or header[1]!='D站英文标签' or not header[2].startswith('使用量(') or header[column] not in ('简体中文','繁體中文','日语(日本語)','韩语(한국어)'):
            raise ValueError(f'Unexpected tag dataset headers: {header[:10]}')
        db.executemany('INSERT INTO terms VALUES (?,?,?,?,?,?)',(
            (r[1],fold(r[1]),r[column],fold(r[column]),category(r),int(r[2])) for r in reader
        ))
    db.execute('INSERT INTO info VALUES (?,?)',(lang,version))
    db.executescript('CREATE INDEX terms_key ON terms(key,count DESC); CREATE INDEX terms_translation ON terms(translated_key,count DESC); CREATE INDEX tags_popular ON terms(category,count DESC);')
    db.commit()
    total=db.execute('SELECT COUNT(*) FROM terms').fetchone()[0]
    assert total > 500000 and db.execute('PRAGMA quick_check').fetchone()==('ok',)
    db.close()
    zipped=file.with_suffix('.sqlite.gz')
    with file.open('rb') as source_file, zipped.open('xb') as sink:
        with gzip.GzipFile(filename='',fileobj=sink,mode='wb',mtime=0) as gz:
            shutil.copyfileobj(source_file,gz)
    packs[lang]={'file':zipped.name,'size':zipped.stat().st_size,'sha256':sha(zipped),'databaseSize':file.stat().st_size,'databaseSha256':sha(file),'count':total}
    print(lang,total,zipped.stat().st_size,flush=True)
manifest.write_text(json.dumps({'updatedAt':version,'packs':packs},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
