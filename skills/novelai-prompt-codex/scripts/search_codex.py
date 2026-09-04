#!/usr/bin/env python3
"""Search the compact guidance index and optional full Personal Codex snapshot."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUIDANCE = ROOT / "references" / "guidance.json"
LOCAL_FULL_CODEX = ROOT / "references" / "prompt-codex.json"
REPO_FULL_CODEX = ROOT.parents[1] / "mobile" / "assets" / "prompt_codex.json"
FULL_CODEX = LOCAL_FULL_CODEX if LOCAL_FULL_CODEX.exists() else REPO_FULL_CODEX
ADULT_TRIGGERS = {
    "成人", "性爱", "性交", "裸体", "裸露", "内裤", "内衣", "丝袜", "连裤袜",
    "诱惑", "高潮", "口交", "自慰", "后入", "nsfw", "nude", "nipples",
    "panties", "underwear", "pantyhose", "sex", "fellatio", "masturbation",
    "orgasm", "doggystyle", "cowgirl", "lewd",
}


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower().replace("_", " ").replace("-", " ")).strip()


def terms(value: str) -> set[str]:
    text = normalize(value)
    result = set(re.findall(r"[a-z0-9#]{2,}", text))
    for run in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        if len(run) <= 6:
            result.add(run)
        for size in range(2, min(4, len(run)) + 1):
            result.update(run[i : i + size] for i in range(len(run) - size + 1))
    return result


def score(query: str, fields: list[str]) -> float:
    needle = normalize(query)
    tokens = terms(query)
    haystacks = [normalize(field) for field in fields]
    joined = "\n".join(haystacks)
    total = 60.0 if len(needle) >= 3 and needle in joined else 0.0
    for token in tokens:
        if token not in joined:
            continue
        total += min(12, len(token) * 3) if re.search(r"[\u4e00-\u9fff]", token) else min(8, max(2, len(token) / 2))
    return total


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--mode", choices=("convert", "reverse"), default="convert")
    parser.add_argument("--allow-adult", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    query = args.query
    adult_relevant = args.allow_adult and any(term in normalize(query) for term in ADULT_TRIGGERS)
    guidance = json.loads(GUIDANCE.read_text(encoding="utf-8"))["entries"]
    results: list[dict] = []
    for entry in guidance:
        if args.mode not in entry["modes"] or (entry["adult"] and not adult_relevant):
            continue
        value = score(query, [entry["title"], entry["category"], *entry["keywords"]])
        value += sum(24 for keyword in entry["keywords"] if normalize(keyword) in normalize(query))
        if entry["id"] in {"core-output", "canonical-tag-priority", "conflict-check"}:
            value += 12
        if value >= 10 or entry["id"] in {"core-output", "canonical-tag-priority", "conflict-check"}:
            results.append({
                "id": f"guidance:{entry['id']}",
                "title": entry["title"],
                "section": entry["category"],
                "source": entry["source"],
                "excerpt": entry["text"],
                "adult": entry["adult"],
                "score": value,
            })

    if FULL_CODEX.exists():
        snapshot = json.loads(FULL_CODEX.read_text(encoding="utf-8"))
        books = {book["id"]: book["title"] for book in snapshot["books"]}
        for entry in snapshot["entries"]:
            if entry["category"] == "artist" or (entry["adult"] and not adult_relevant):
                continue
            value = score(query, [entry["title"], entry["section"], entry["category"], entry["prompt"]])
            if value < 18:
                continue
            text = re.sub(r"\s+", " ", entry["prompt"]).strip()
            results.append({
                "id": f"codex:{entry['id']}",
                "title": entry["title"],
                "section": entry["section"],
                "source": books.get(entry["bookId"], "NovelAI 个人法典"),
                "excerpt": text if len(text) <= 260 else text[:259] + "…",
                "adult": entry["adult"],
                "score": value,
            })

    results.sort(key=lambda item: (-item["score"], item["id"]))
    print(json.dumps(results[: max(1, args.limit)], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
