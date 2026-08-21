#!/usr/bin/env python3
"""Build trusted multilingual base-name overrides from extracted game data.

The output is deliberately game-scoped. A bare role name is not globally
unique, so a flat translation cache can assign one game's name to another.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


LANGUAGES = ("zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US")


def read(path: Path):
    return json.loads(path.read_text("utf-8"))


def complete(values: dict[str, str]) -> dict[str, str] | None:
    english = values.get("en-US", "").strip()
    if not english:
        return None
    return {language: (values.get(language) or english).strip() for language in LANGUAGES}


def add(target: dict, game: str, english: str, values: dict[str, str], source: str) -> None:
    record = complete(values)
    if not english.strip() or not record:
        return
    target.setdefault(game, {})[english.strip()] = {"names": record, "source": source, "status": "verified-game-data"}


def build_genshin(target: dict, root: Path) -> None:
    config = read(root / "ExcelBinOutput" / "AvatarExcelConfigData.json")
    maps = {
        "zh-CN": read(root / "TextMap" / "TextMapCHS.json"),
        "zh-TW": read(root / "TextMap" / "TextMapCHT.json"),
        "ja-JP": read(root / "TextMap" / "TextMapJP.json"),
        "ko-KR": read(root / "TextMap" / "TextMapKR.json"),
        "en-US": read(root / "TextMap" / "TextMapEN.json"),
    }
    for avatar in config:
        key = str(avatar.get("NameTextMapHash", ""))
        values = {language: table.get(key, "") for language, table in maps.items()}
        add(target, "原神", values.get("en-US", ""), values, "Genshin extracted TextMap + AvatarExcelConfigData")


def build_hsr(target: dict, root: Path) -> None:
    maps = {
        "zh-CN": read(root / "TextMap" / "TextMapCHS.json"),
        "zh-TW": read(root / "TextMap" / "TextMapCHT.json"),
        "ja-JP": read(root / "TextMap" / "TextMapJP.json"),
        "en-US": read(root / "TextMap" / "TextMapEN.json"),
    }
    korean = {}
    for name in ("TextMapKR_0.json", "TextMapKR_1.json", "TextMapMainKR.json"):
        korean.update(read(root / "TextMap" / name))
    maps["ko-KR"] = korean
    for avatar in read(root / "ExcelOutput" / "AvatarConfig.json"):
        key = str((avatar.get("AvatarName") or {}).get("Hash", ""))
        values = {language: table.get(key, "") for language, table in maps.items()}
        add(target, "星穹铁道", values.get("en-US", ""), values, "Honkai: Star Rail extracted TextMap + AvatarConfig")


def build_zzz(target: dict, root: Path) -> None:
    maps = {
        "zh-CN": read(root / "TextMap" / "TextMapTemplateTb.json"),
        "zh-TW": read(root / "TextMap" / "TextMap_CHTTemplateTb.json"),
        "ja-JP": read(root / "TextMap" / "TextMap_JATemplateTb.json"),
        "ko-KR": read(root / "TextMap" / "TextMap_KOTemplateTb.json"),
        "en-US": read(root / "TextMap" / "TextMap_ENTemplateTb.json"),
    }
    raw = read(root / "FileCfg" / "AvatarBaseTemplateTb.json")
    avatars = next(value for value in raw.values() if isinstance(value, list))
    for avatar in avatars:
        key = avatar.get("NHCHCCIAPIL", "")
        values = {language: table.get(key, "") for language, table in maps.items()}
        add(target, "绝区零", values.get("en-US", ""), values, "Zenless Zone Zero extracted TextMap + AvatarBaseTemplateTb")


def build_arknights(target: dict, root: Path) -> None:
    tables = {
        "zh-CN": read(root / "cn" / "gamedata" / "excel" / "character_table.json"),
        "zh-TW": read(root / "tw" / "gamedata" / "excel" / "character_table.json"),
        "ja-JP": read(root / "jp" / "gamedata" / "excel" / "character_table.json"),
        "ko-KR": read(root / "kr" / "gamedata" / "excel" / "character_table.json"),
        "en-US": read(root / "en" / "gamedata" / "excel" / "character_table.json"),
    }
    for identifier, english_row in tables["en-US"].items():
        english = (english_row or {}).get("name", "")
        values = {language: (table.get(identifier) or {}).get("name", "") for language, table in tables.items()}
        add(target, "明日方舟", english, values, "Arknights multi-region extracted character_table")


def build_blue_archive(target: dict, root: Path) -> None:
    rows = {language: {row["Id"]: row for row in read(root / folder / "students.json")} for language, folder in {
        "zh-CN": "cn", "zh-TW": "tw", "ja-JP": "jp", "ko-KR": "kr", "en-US": "en"
    }.items()}
    for identifier, english_row in rows["en-US"].items():
        english = english_row.get("Name", "")
        values = {language: (table.get(identifier) or {}).get("Name", "") for language, table in rows.items()}
        add(target, "蔚蓝档案", english, values, "SchaleDB multi-region student data")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default=r"F:\AI\agent\codex\novelai-image-desktop\.tmp\locale-sources")
    parser.add_argument("--output", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-name-overrides.json")
    args = parser.parse_args()
    root = Path(args.sources)
    games: dict = {}
    build_genshin(games, root / "genshin-resources")
    build_hsr(games, root / "hsr-data")
    build_zzz(games, root / "zenless-data")
    build_arknights(games, root / "arknights")
    build_blue_archive(games, root / "schaledb" / "data")
    games.setdefault("原神", {})["Aino"] = {
        "names": {"zh-CN": "爱诺", "zh-TW": "愛諾", "ja-JP": "アイノ", "ko-KR": "아이노", "en-US": "Aino"},
        "source": "released Genshin character localization", "status": "manual-verified",
    }
    games["原神"]["Gaming"] = {
        "names": {"zh-CN": "嘉明", "zh-TW": "嘉明", "ja-JP": "嘉明", "ko-KR": "가명", "en-US": "Gaming"},
        "source": "released Genshin character localization", "status": "manual-verified",
    }
    output = Path(args.output)
    payload = {
        "schema": "langbai-reference-name-overrides/v1",
        "languages": list(LANGUAGES),
        "games": games,
        "counts": {game: len(values) for game, values in games.items()},
        "policy": "Game-scoped extracted names only; no generic machine translation of proper nouns.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(payload["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
