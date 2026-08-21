#!/usr/bin/env python3
"""Build trusted multilingual base-name overrides from extracted game data.

The output is deliberately game-scoped. A bare role name is not globally
unique, so a flat translation cache can assign one game's name to another.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from reference_catalog_manual_names import build_manual_names


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


def add_aliases(target: dict, game: str, aliases: set[str], values: dict[str, str], source: str) -> None:
    """Store one localized record under every authoritative spelling/alias."""
    record = complete(values)
    if not record:
        return
    row = {"names": record, "source": source, "status": "verified-game-data"}
    for alias in sorted({str(value).strip() for value in aliases if str(value).strip()}):
        target.setdefault(game, {})[alias] = row


def alias_variants(value: str) -> set[str]:
    """Return only spelling-equivalent separator variants, never translations."""
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    if not value:
        return set()
    variants = {value}
    variants.add(re.sub(r"\s*:\s*", " - ", value))
    variants.add(re.sub(r"\s+-\s+", ": ", value))
    variants.add(value.replace("：", ": ").replace("－", " - "))
    return {re.sub(r"\s+", " ", item).strip() for item in variants if item.strip()}


def build_fandom_multilingual(target: dict, game: str, path: Path, source: str) -> None:
    """Load cached Other Languages tables from a game-specific wiki."""
    if not path.exists():
        return
    language_fields = {"zh-CN": "zhs", "zh-TW": "zht", "ja-JP": "ja", "ko-KR": "ko", "en-US": "en"}
    for item in read(path):
        raw = item.get("names") or {}
        values = {language: str(raw.get(field, "")).strip() for language, field in language_fields.items()}
        aliases = {item.get("page", "")}
        for value in raw.values():
            aliases.update(alias_variants(value))
        for value in list(aliases):
            aliases.update(alias_variants(value))
        add_aliases(target, game, aliases, values, source)


def build_nikke(target: dict, root: Path) -> None:
    path = root / "character_names.json"
    if not path.exists():
        return
    for item in read(path).get("names", []):
        values = {
            "zh-CN": item.get("zh", ""),
            "zh-TW": item.get("zh", ""),
            "ja-JP": item.get("ja", ""),
            "ko-KR": item.get("ko", ""),
            "en-US": item.get("en", ""),
        }
        aliases = set()
        for value in values.values():
            aliases.update(alias_variants(value))
        add_aliases(target, "妮姬", aliases, values, "NikkeModSelector multi-region official character names")


def build_endfield(target: dict, root: Path) -> None:
    table_path = root / "tables" / "CharacterTable.json"
    if not table_path.exists():
        return
    tables = {
        "zh-CN": read(root / "i18n" / "CN.json"),
        "zh-TW": read(root / "i18n" / "TC.json"),
        "ja-JP": read(root / "i18n" / "JP.json"),
        "ko-KR": read(root / "i18n" / "KR.json"),
        "en-US": read(root / "i18n" / "EN.json"),
    }
    for row in read(table_path).values():
        key = str((row.get("name") or {}).get("id", ""))
        values = {language: table.get(key, "") for language, table in tables.items()}
        aliases = {row.get("engName", ""), row.get("charId", "")}
        aliases.update(values.values())
        add_aliases(target, "终末地", aliases, values, "EndFieldGameData extracted five-region CharacterTable + i18n")


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


def build_genshin_db(target: dict, root: Path) -> None:
    """Use genshin-db's current official game strings for characters/outfits."""
    folders = {
        "zh-CN": "ChineseSimplified", "zh-TW": "ChineseTraditional",
        "ja-JP": "Japanese", "ko-KR": "Korean", "en-US": "English",
    }
    character_rows: dict[str, dict[str, dict]] = {}
    for language, folder in folders.items():
        base = root / "src" / "data" / folder / "characters"
        character_rows[language] = {path.stem: read(path) for path in base.glob("*.json")}
    stems = set.intersection(*(set(rows) for rows in character_rows.values()))
    for stem in stems:
        values = {language: rows[stem].get("name", "") for language, rows in character_rows.items()}
        aliases = {stem, *(row.get("name", "") for row in (rows[stem] for rows in character_rows.values()))}
        add_aliases(target, "原神", aliases, values, "genshin-db current multi-language character data")

    outfit_rows: dict[str, dict[str, dict]] = {}
    for language, folder in folders.items():
        base = root / "src" / "data" / folder / "outfits"
        outfit_rows[language] = {path.stem: read(path) for path in base.glob("*.json")}
    stems = set.intersection(*(set(rows) for rows in outfit_rows.values()))
    for stem in stems:
        values = {}
        aliases = {stem}
        for language, rows in outfit_rows.items():
            row = rows[stem]
            combined = " ".join(part for part in (row.get("characterName", ""), row.get("name", "")) if part).strip()
            values[language] = combined
            aliases.update({row.get("name", ""), combined})
        add_aliases(target, "原神", aliases, values, "genshin-db current multi-language outfit data")


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
    def merged(*names: str) -> dict:
        result = {}
        for name in names:
            path = root / "TextMap" / name
            if path.exists():
                result.update(read(path))
        return result
    maps = {
        "zh-CN": merged("TextMapTemplateTb.json", "TextMapOverwriteTemplateTb.json"),
        "zh-TW": merged("TextMap_CHTTemplateTb.json", "TextMap_CHTOverwriteTemplateTb.json"),
        "ja-JP": merged("TextMap_JATemplateTb.json", "TextMap_JAOverwriteTemplateTb.json"),
        "ko-KR": merged("TextMap_KOTemplateTb.json", "TextMap_KOOverwriteTemplateTb.json"),
        "en-US": merged("TextMap_ENTemplateTb.json", "TextMap_ENOverwriteTemplateTb.json"),
    }
    raw = read(root / "FileCfg" / "AvatarBaseTemplateTb.json")
    avatars = next(value for value in raw.values() if isinstance(value, list))
    for avatar in avatars:
        # Field names are obfuscated and change between game versions. Resolve
        # every avatar value that is a real TextMap key instead of hard-coding
        # the old field name; this covers both short and full character names.
        keys = []
        for raw_value in avatar.values():
            key = str(raw_value)
            if key in maps["en-US"] and maps["en-US"].get(key, "").strip():
                keys.append(key)
        for key in dict.fromkeys(keys):
            values = {language: table.get(key, "") for language, table in maps.items()}
            add_aliases(target, "绝区零", set(values.values()), values, "Zenless Zone Zero current extracted TextMap + AvatarBaseTemplateTb")


def build_arknights(target: dict, root: Path) -> None:
    tables = {
        "zh-CN": read(root / "cn" / "gamedata" / "excel" / "character_table.json"),
        "zh-TW": read(root / "tw" / "gamedata" / "excel" / "character_table.json"),
        "ja-JP": read(root / "jp" / "gamedata" / "excel" / "character_table.json"),
        "ko-KR": read(root / "kr" / "gamedata" / "excel" / "character_table.json"),
        "en-US": read(root / "en" / "gamedata" / "excel" / "character_table.json"),
    }
    # CN data often contains announced operators months before other regions.
    # Iterate the union and use the game-provided English appellation as the
    # stable alias while keeping every already-released regional name.
    identifiers = set().union(*(set(table) for table in tables.values()))
    for identifier in identifiers:
        rows = {language: table.get(identifier) or {} for language, table in tables.items()}
        aliases = {identifier}
        for row in rows.values():
            aliases.update({row.get("name", ""), row.get("appellation", "")})
        english_row = rows["en-US"]
        english = english_row.get("name", "") or english_row.get("appellation", "")
        if not english:
            english = next((row.get("appellation", "") for row in rows.values() if row.get("appellation")), "")
        values = {language: row.get("name", "") for language, row in rows.items()}
        values["en-US"] = values["en-US"] or english
        add_aliases(target, "明日方舟", aliases | {english}, values, "Arknights multi-region extracted character_table")


def build_blue_archive(target: dict, root: Path) -> None:
    def indexed(path: Path) -> dict:
        raw = read(path)
        values = raw.values() if isinstance(raw, dict) else raw
        return {int(row["Id"]): row for row in values}
    rows = {language: indexed(root / folder / "students.json") for language, folder in {
        "zh-CN": "cn", "zh-TW": "tw", "ja-JP": "jp", "ko-KR": "kr", "en-US": "en"
    }.items()}
    for identifier, english_row in rows["en-US"].items():
        english = english_row.get("Name", "")
        values = {language: (table.get(identifier) or {}).get("Name", "") for language, table in rows.items()}
        aliases = {english}
        for table in rows.values():
            row = table.get(identifier) or {}
            aliases.update({row.get("Name", ""), row.get("PathName", ""), row.get("DevName", ""), row.get("PersonalName", "")})
        add_aliases(target, "蔚蓝档案", aliases, values, "SchaleDB current multi-region student data")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default=r"F:\AI\agent\codex\novelai-image-desktop\.tmp\locale-sources")
    parser.add_argument("--output", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-name-overrides.json")
    args = parser.parse_args()
    root = Path(args.sources)
    games: dict = {}
    build_genshin_db(games, root / "genshin-db")
    build_hsr(games, root / "hsr-data")
    build_zzz(games, root / "zenless-current")
    build_arknights(games, root / "arknights")
    build_blue_archive(games, root / "schaledb-live")
    build_nikke(games, root / "nikke")
    build_endfield(games, root / "endfield" / "extracted")
    build_fandom_multilingual(
        games, "崩坏三", root / "honkai3-fandom.json",
        "Honkai Impact 3 Wiki game-specific Other Languages tables",
    )
    build_fandom_multilingual(
        games, "鸣潮", root / "wuwa-fandom.json",
        "Wuthering Waves Wiki game-specific Other Languages tables",
    )
    build_fandom_multilingual(
        games, "异环", root / "nte-fandom.json",
        "Neverness to Everness Wiki game-specific Other Languages tables",
    )
    games.setdefault("原神", {})["Aino"] = {
        "names": {"zh-CN": "爱诺", "zh-TW": "愛諾", "ja-JP": "アイノ", "ko-KR": "아이노", "en-US": "Aino"},
        "source": "released Genshin character localization", "status": "manual-verified",
    }
    games["原神"]["Gaming"] = {
        "names": {"zh-CN": "嘉明", "zh-TW": "嘉明", "ja-JP": "嘉明", "ko-KR": "가명", "en-US": "Gaming"},
        "source": "released Genshin character localization", "status": "manual-verified",
    }
    # Last-mile aliases that are absent from the extracted regional tables
    # (collaboration characters, protagonist variants, and announced forms).
    # These rows are reviewed proper names, not generic UI translation.
    for game, roles in build_manual_names().items():
        for alias, names in roles.items():
            add_aliases(games, game, {alias}, names, "reviewed game-specific manual alias")
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
