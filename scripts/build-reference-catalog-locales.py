#!/usr/bin/env python3
"""Build safe game-scoped five-language character names.

Proper nouns are never sent to generic machine translation. Trusted game data
is applied when available; otherwise the canonical role ID remains visible.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


LANGUAGES = ("zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US")
REDUNDANT_TAGS = re.compile(r"\s*\[(?:game|in-game|full-wish)\]\s*", re.IGNORECASE)
CITY_TAG = re.compile(r"\s*\[in-game city\]\s*", re.IGNORECASE)
CITY_LABELS = {"zh-CN": "（城市场景）", "zh-TW": "（城市場景）", "ja-JP": "（市街）", "ko-KR": " (도시)", "en-US": " (City)"}


def clean_role(role: str) -> tuple[str, bool]:
    city = bool(CITY_TAG.search(role))
    value = CITY_TAG.sub(" ", role)
    value = REDUNDANT_TAGS.sub(" ", value)
    return re.sub(r"\s+", " ", value).strip(" -"), city


def match_override(role: str, records: dict) -> tuple[str | None, dict | None]:
    folded = role.casefold()
    for key, row in records.items():
        if key.casefold() == folded:
            return key, row
    candidates = []
    for key, row in records.items():
        key_folded = key.casefold()
        if folded.startswith(key_folded) and (len(folded) == len(key_folded) or folded[len(key_folded)] in " ([•-–—"):
            candidates.append((len(key), key, row))
    if not candidates:
        return None, None
    _, key, row = max(candidates)
    return key, row


def localized_role(role: str, records: dict) -> tuple[dict[str, str], dict]:
    clean, city = clean_role(role)
    key, row = match_override(clean, records)
    if row:
        suffix = clean[len(key):].strip() if key else ""
        names = {}
        for language in LANGUAGES:
            base = row["names"].get(language) or row["names"].get("en-US") or key
            value = f"{base} {suffix}".strip() if suffix else base
            if city:
                value += CITY_LABELS[language]
            names[language] = value
        return names, {"status": row.get("status", "verified"), "source": row.get("source", "trusted override"), "matchedBase": key}
    fallback = clean or role
    if city:
        return {language: fallback + CITY_LABELS[language] for language in LANGUAGES}, {"status": "canonical-fallback", "source": "source-library roleId"}
    return {language: fallback for language in LANGUAGES}, {"status": "canonical-fallback", "source": "source-library roleId"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=r"F:\AI\agent\codex\novelai-image-desktop\public\reference-catalog\index.json")
    parser.add_argument("--overrides", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-name-overrides.json")
    parser.add_argument("--output", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-locales.json")
    parser.add_argument("--audit", default=r"F:\AI\agent\codex\novelai-image-desktop\.tmp\reference-catalog-locale-audit.json")
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text("utf-8"))
    overrides = json.loads(Path(args.overrides).read_text("utf-8")).get("games", {})
    roles_by_game: dict[str, set[str]] = {}
    for asset in manifest["assets"]:
        roles_by_game.setdefault(asset["game"], set()).add(asset["roleId"])
    names_by_game = {}
    provenance_by_game = {}
    counts = {"verified": 0, "fallback": 0}
    for game, roles in sorted(roles_by_game.items()):
        records = overrides.get(game, {})
        names_by_game[game] = {}
        provenance_by_game[game] = {}
        for role in sorted(roles, key=str.casefold):
            names, provenance = localized_role(role, records)
            names_by_game[game][role] = names
            provenance_by_game[game][role] = provenance
            counts["verified" if provenance["status"] != "canonical-fallback" else "fallback"] += 1
    payload = {
        "schema": "langbai-reference-locales/v2",
        "languages": list(LANGUAGES),
        "namesByGame": names_by_game,
        "provenanceByGame": provenance_by_game,
        "roleCount": sum(len(roles) for roles in roles_by_game.values()),
        "counts": counts,
        "policy": "Verified game-scoped proper names; canonical fallback when unverified; no generic machine translation.",
    }
    output = Path(args.output)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    audit = {
        "schema": payload["schema"], "roleCount": payload["roleCount"], "counts": counts,
        "fallbackByGame": {game: [role for role, row in provenance_by_game[game].items() if row["status"] == "canonical-fallback"] for game in provenance_by_game},
        "knownBadTranslationsAbsent": all(
            value not in {"这里[游戏]", "反照率[游戏]", "游戏[游戏]", "琥珀色", "除夕夜"}
            for game in names_by_game.values() for names in game.values() for value in names.values()
        ),
    }
    Path(args.audit).parent.mkdir(parents=True, exist_ok=True)
    Path(args.audit).write_text(json.dumps(audit, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"roles": payload["roleCount"], **counts, "knownBadTranslationsAbsent": audit["knownBadTranslationsAbsent"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
