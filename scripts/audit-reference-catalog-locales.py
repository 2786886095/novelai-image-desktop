#!/usr/bin/env python3
"""Fail the build when catalog localization regresses."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


LANGUAGES = ("zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US")
KNOWN_BAD = {"这里[游戏]", "反照率[游戏]", "游戏[游戏]", "琥珀色", "除夕夜", "New Year's Eve"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=r"F:\AI\agent\codex\novelai-image-desktop\public\reference-catalog\index.json")
    parser.add_argument("--locales", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-locales.json")
    parser.add_argument("--output", default=r"F:\AI\agent\codex\novelai-image-desktop\.tmp\reference-catalog-locales-final-qa.json")
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text("utf-8"))
    locales = json.loads(Path(args.locales).read_text("utf-8"))
    errors = []
    ids = set()
    for asset in manifest["assets"]:
        identity = (asset["game"], asset["category"], asset["roleId"])
        if identity in ids:
            errors.append(f"duplicate asset identity: {identity}")
        ids.add(identity)
        names = asset.get("names") or {}
        for language in LANGUAGES:
            if not str(names.get(language, "")).strip():
                errors.append(f"missing {language}: {identity}")
            if names.get(language) in KNOWN_BAD:
                errors.append(f"known bad translation {language}: {identity} -> {names[language]}")
        if asset["roleId"] not in (asset.get("searchAliases") or []):
            errors.append(f"canonical alias missing: {identity}")
    scoped_roles = sum(len(roles) for roles in locales.get("namesByGame", {}).values())
    if scoped_roles != locales.get("roleCount"):
        errors.append(f"locale roleCount mismatch: {scoped_roles} != {locales.get('roleCount')}")
    if locales.get("counts", {}).get("fallback") != 0:
        errors.append(f"unverified canonical fallbacks remain: {locales.get('counts', {}).get('fallback')}")
    provenance = locales.get("provenanceByGame", {})
    for game, roles in locales.get("namesByGame", {}).items():
        for role_id in roles:
            status = (provenance.get(game, {}).get(role_id) or {}).get("status")
            if status == "canonical-fallback" or not status:
                errors.append(f"unverified localization provenance: {(game, role_id)} -> {status!r}")
    checks = {
        "genshinAino": next(a["names"] for a in manifest["assets"] if a["game"] == "原神" and a["roleId"] == "Aino [game]"),
        "genshinAmber": next(a["names"] for a in manifest["assets"] if a["game"] == "原神" and a["roleId"] == "Amber"),
        "genshinGaming": next(a["names"] for a in manifest["assets"] if a["game"] == "原神" and a["roleId"] == "Gaming"),
        "genshinAlhaitham": next(a["names"] for a in manifest["assets"] if a["game"] == "原神" and a["roleId"] == "Alhaitham"),
        "genshinAlyosha": next(a["names"] for a in manifest["assets"] if a["game"] == "原神" and a["roleId"] == "Alyosha"),
        "blueArchiveAruNewYear": next(a["names"] for a in manifest["assets"] if a["game"] == "蔚蓝档案" and a["roleId"] == "Aru (New Year)"),
    }
    expected = {
        "genshinAino": {"zh-CN": "爱诺", "en-US": "Aino"},
        "genshinAmber": {"zh-CN": "安柏", "en-US": "Amber"},
        "genshinGaming": {"zh-CN": "嘉明", "en-US": "Gaming"},
        "genshinAlhaitham": {"zh-CN": "艾尔海森", "zh-TW": "艾爾海森", "ja-JP": "アルハイゼン", "ko-KR": "알하이탐", "en-US": "Alhaitham"},
        "genshinAlyosha": {"zh-CN": "阿罗夏", "zh-TW": "阿羅夏", "ja-JP": "アリョーシャ", "ko-KR": "알료샤", "en-US": "Alyosha"},
        "blueArchiveAruNewYear": {"zh-CN": "爱露（新年）", "en-US": "Aru (New Year)"},
    }
    for key, values in expected.items():
        for language, value in values.items():
            if checks[key].get(language) != value:
                errors.append(f"spot check failed: {key}.{language}={checks[key].get(language)!r}")
    report = {
        "schema": "langbai-reference-locales-qa/v1",
        "assets": len(manifest["assets"]),
        "scopedRoles": scoped_roles,
        "languages": list(LANGUAGES),
        "localeCounts": locales.get("counts"),
        "knownBadTranslationsAbsent": not any(value in KNOWN_BAD for check in checks.values() for value in check.values()),
        "spotChecks": checks,
        "errors": errors,
        "pass": not errors,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({key: report[key] for key in ("assets", "scopedRoles", "localeCounts", "errors", "pass")}, ensure_ascii=False))
    raise SystemExit(0 if not errors else 1)


if __name__ == "__main__":
    main()
