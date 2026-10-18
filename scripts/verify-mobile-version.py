from pathlib import Path
import argparse, json, re, sys
parser=argparse.ArgumentParser(description="Check package, build and displayed mobile versions before compilation.")
parser.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1])
root=parser.parse_args().root.resolve()
pkg=json.loads((root/"package.json").read_text(encoding="utf-8"))
lock=json.loads((root/"package-lock.json").read_text(encoding="utf-8"))
spec=(root/"mobile/pubspec.yaml").read_text(encoding="utf-8")
models=(root/"mobile/lib/models/nai_models.dart").read_text(encoding="utf-8")
mobile=re.search(r"^version:\s*([^\s+]+)\+(\d+)\s*$",spec,re.M)
display=re.search(r"^const appVersion = '([^']+)';\s*$",models,re.M)
values={"package":pkg["version"],"lock":lock["version"],"lockRoot":lock["packages"][""]["version"],"mobile":mobile[1] if mobile else None,"display":display[1] if display else None}
errors=[name for name,value in values.items() if value!=pkg["version"]]
result={"versions":values,"buildNumber":mobile[2] if mobile else None,"consistent":not errors,"mismatchedFields":errors}
print(json.dumps(result,ensure_ascii=False))
sys.exit(1 if errors else 0)
