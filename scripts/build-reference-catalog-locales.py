#!/usr/bin/env python3
"""Create a cached five-language search/display-name map for the catalog.

Official game titles are maintained by the catalog builder. Character/form names
use the source-library name as the stable key and machine-assisted translations
as search/display aliases. Existing hand-corrected values in the cache are never
overwritten unless --force is supplied.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TARGETS = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "en-US": "en",
}


def translate_lines(lines: list[str], target: str) -> list[str]:
    text = "\n".join(line.replace("\n", " ") for line in lines)
    query = urlencode({"client": "gtx", "sl": "auto", "tl": target, "dt": "t", "q": text})
    request = Request(
        "https://translate.googleapis.com/translate_a/single?" + query,
        headers={"User-Agent": "Langbai-Reference-Catalog/1.0"},
    )
    with urlopen(request, timeout=30) as response:
        data = json.load(response)
    translated = "".join(part[0] for part in data[0] if part and part[0])
    output = translated.splitlines()
    if len(output) != len(lines):
        raise RuntimeError(f"line-count mismatch: expected {len(lines)}, received {len(output)}")
    return [value.strip() or source for value, source in zip(output, lines)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=r"F:\AI\agent\codex\novelai-image-desktop\public\reference-catalog\index.json")
    parser.add_argument("--output", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-locales.json")
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text("utf-8"))
    roles = sorted({asset["roleId"] for asset in manifest["assets"]}, key=str.casefold)
    output = Path(args.output)
    cache = json.loads(output.read_text("utf-8")) if output.exists() else {"schema": "langbai-reference-locales/v1", "names": {}}
    names = cache.setdefault("names", {})
    for role in roles:
        names.setdefault(role, {})

    for language, target in TARGETS.items():
        pending = [role for role in roles if args.force or not names[role].get(language)]
        for offset in range(0, len(pending), args.batch_size):
            batch = pending[offset: offset + args.batch_size]
            for attempt in range(4):
                try:
                    translations = translate_lines(batch, target)
                    break
                except Exception:
                    if attempt == 3:
                        # Preserve functionality without inventing or dropping a name.
                        translations = batch
                    else:
                        time.sleep(1.5 * (attempt + 1))
            for role, translated in zip(batch, translations):
                names[role][language] = translated
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(cache, ensure_ascii=False, indent=2), "utf-8")
            print(f"{language}: {min(offset + len(batch), len(pending))}/{len(pending)}")
            time.sleep(0.08)

    cache["roleCount"] = len(roles)
    cache["note"] = "Machine-assisted multilingual aliases; source-library roleId remains the stable identifier."
    output.write_text(json.dumps(cache, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"roles": len(roles), "languages": list(TARGETS)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
