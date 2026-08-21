#!/usr/bin/env python3
"""Build the public character catalog and stage its downloadable image assets.

The source library remains authoritative.  For each character/form this script:
1. collapses duplicate precise sizes to one best canvas;
2. links one original and one processed image when a trustworthy filename match exists;
3. generates a real small WebP thumbnail;
4. stages files in the separate GitHub asset repository; and
5. emits a backwards-compatible v1 manifest with optional v2 file metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

from PIL import Image


LEGAL_SIZES = ((1024, 1536), (1472, 1472), (1536, 1024))
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
LANGUAGES = ("zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US")
SINGLE_CATEGORY_GAMES = {"妮姬", "明日方舟", "蔚蓝档案"}
GAME_SLUGS = {
    "崩坏三": "honkai3",
    "绝区零": "zenless-zone-zero",
    "明日方舟": "arknights",
    "鸣潮": "wuthering-waves",
    "妮姬": "nikke",
    "蔚蓝档案": "blue-archive",
    "星穹铁道": "honkai-star-rail",
    "异环": "neverness-to-everness",
    "原神": "genshin-impact",
    "终末地": "arknights-endfield",
}
GAME_NAMES = {
    "崩坏三": {"zh-CN": "崩坏3", "zh-TW": "崩壞3rd", "ja-JP": "崩壊3rd", "ko-KR": "붕괴3rd", "en-US": "Honkai Impact 3rd"},
    "绝区零": {"zh-CN": "绝区零", "zh-TW": "絕區零", "ja-JP": "ゼンレスゾーンゼロ", "ko-KR": "젠레스 존 제로", "en-US": "Zenless Zone Zero"},
    "明日方舟": {"zh-CN": "明日方舟", "zh-TW": "明日方舟", "ja-JP": "アークナイツ", "ko-KR": "명일방주", "en-US": "Arknights"},
    "鸣潮": {"zh-CN": "鸣潮", "zh-TW": "鳴潮", "ja-JP": "鳴潮", "ko-KR": "명조: 워더링 웨이브", "en-US": "Wuthering Waves"},
    "妮姬": {"zh-CN": "胜利女神：妮姬", "zh-TW": "勝利女神：妮姬", "ja-JP": "勝利の女神：NIKKE", "ko-KR": "승리의 여신: 니케", "en-US": "GODDESS OF VICTORY: NIKKE"},
    "蔚蓝档案": {"zh-CN": "蔚蓝档案", "zh-TW": "蔚藍檔案", "ja-JP": "ブルーアーカイブ", "ko-KR": "블루 아카이브", "en-US": "Blue Archive"},
    "星穹铁道": {"zh-CN": "崩坏：星穹铁道", "zh-TW": "崩壞：星穹鐵道", "ja-JP": "崩壊：スターレイル", "ko-KR": "붕괴: 스타레일", "en-US": "Honkai: Star Rail"},
    "异环": {"zh-CN": "异环", "zh-TW": "異環", "ja-JP": "Neverness to Everness", "ko-KR": "Neverness to Everness", "en-US": "Neverness to Everness"},
    "原神": {"zh-CN": "原神", "zh-TW": "原神", "ja-JP": "原神", "ko-KR": "원신", "en-US": "Genshin Impact"},
    "终末地": {"zh-CN": "明日方舟：终末地", "zh-TW": "明日方舟：終末地", "ja-JP": "アークナイツ：エンドフィールド", "ko-KR": "명일방주: 엔드필드", "en-US": "Arknights: Endfield"},
}
PROVENANCE_TAGS = re.compile(
    r"\s*\[(?:生成过程原图|full-wish|AI[^\]]*|ai_[^\]]*|official[^\]]*|splash-art[^\]]*|game[^\]]*|evidence[^\]]*)\]\s*",
    re.IGNORECASE,
)
SIZE_SUFFIX = re.compile(r"__(1024x1536|1472x1472|1536x1024)$", re.IGNORECASE)


@dataclass(frozen=True)
class Precise:
    path: Path
    relative: Path
    game: str
    category: str
    role: str
    size: tuple[int, int]
    score: float


def image_files(root: Path) -> list[Path]:
    return sorted((p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS), key=lambda p: str(p).casefold())


def role_from(path: Path) -> str:
    return SIZE_SUFFIX.sub("", path.stem).strip()


def canonical_stage_name(path: Path) -> str:
    stem = SIZE_SUFFIX.sub("", path.stem)
    return re.sub(r"\s+", " ", PROVENANCE_TAGS.sub(" ", stem)).strip()


def category_for(relative: Path) -> str:
    parts = relative.parts
    if "游戏内角色图" in parts:
        return "游戏内角色图"
    if "角色立绘" in parts:
        return "角色立绘"
    return "角色资源"


def rgba_bbox_score(path: Path) -> tuple[tuple[int, int], float]:
    with Image.open(path) as image:
        size = image.size
        if size not in LEGAL_SIZES:
            return size, -1.0
        if "A" in image.getbands():
            bbox = image.getchannel("A").getbbox()
            if bbox:
                occupied = ((bbox[2] - bbox[0]) / size[0]) * ((bbox[3] - bbox[1]) / size[1])
            else:
                occupied = 0.0
        else:
            occupied = 1.0
        # Prefer fuller subjects, then square, portrait, landscape on a tie.
        tie = {(1472, 1472): 0.003, (1024, 1536): 0.002, (1536, 1024): 0.001}[size]
        return size, occupied + tie


def choose_stage_file(directory: Path, role: str, *, original: bool) -> Path | None:
    if not directory.exists():
        return None
    candidates = [p for p in image_files(directory) if canonical_stage_name(p) == role]
    if not candidates:
        candidates = [p for p in image_files(directory) if p.stem == role or p.stem.startswith(role + " [") or p.stem.startswith(role + "__")]
    if not candidates and role == "anby-in-game":
        candidates = [p for p in image_files(directory) if p.stem.startswith("Anby Demara [In-Game]")]
    if not candidates:
        return None

    def rank(path: Path) -> tuple[int, int, str]:
        stem = path.stem.casefold()
        if path.stem == role:
            preference = 0
        elif original and "full-wish" in stem:
            preference = 1
        elif original and "official" in stem:
            preference = 2
        elif original and "生成过程原图" in stem:
            preference = 3
        else:
            preference = 4
        return preference, len(path.name), str(path).casefold()

    return sorted(candidates, key=rank)[0]


def encoded(relative: Path) -> str:
    return "/".join(quote(part) for part in relative.as_posix().split("/"))


def copy_if_needed(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size == source.stat().st_size:
        return
    shutil.copy2(source, target)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def make_thumbnail(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_mtime_ns >= source.stat().st_mtime_ns:
        return
    with Image.open(source) as image:
        image = image.convert("RGBA")
        image.thumbnail((360, 480), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (360, 480), (0, 0, 0, 0))
        canvas.alpha_composite(image, ((360 - image.width) // 2, (480 - image.height) // 2))
        # Method 2 keeps the 2k+ thumbnail build fast while preserving clean UI previews.
        canvas.save(target, "WEBP", quality=78, method=2)


def file_entry(path: Path, source_root: Path, asset_repo: Path, game: str, gitee_repo: str) -> dict:
    relative = path.relative_to(source_root)
    target = asset_repo / "assets" / relative
    copy_if_needed(path, target)
    width, height = image_dimensions(path)
    rel_url = encoded(Path("assets") / relative)
    github = f"https://media.githubusercontent.com/media/2786886095/novelai-reference-assets/main/{rel_url}"
    # Per-game Gitee mirrors contain only precise references and thumbnails.
    gitee = f"https://gitee.com/langbai666/{gitee_repo}/raw/main/{encoded(Path('assets') / Path(*relative.parts[1:]))}"
    return {
        "storagePath": relative.as_posix(),
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "sha256": sha256(path),
        "url": github,
        "mirrors": {"github": github, "gitee": gitee},
    }


def load_names(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text("utf-8"))
    return data.get("names", data)


def build(args: argparse.Namespace) -> dict:
    source_root = Path(args.source_root).resolve()
    asset_repo = Path(args.asset_repo).resolve()
    output = Path(args.output).resolve()
    names = load_names(Path(args.names))

    precise_files = [p for p in image_files(source_root) if p.parent.name == "NovelAI精准参考"]
    grouped: dict[tuple[str, str, str], list[Precise]] = {}
    invalid: list[str] = []
    for file in precise_files:
        relative = file.relative_to(source_root)
        game = relative.parts[0]
        category = category_for(relative)
        role = role_from(file)
        size, score = rgba_bbox_score(file)
        if size not in LEGAL_SIZES:
            invalid.append(str(file))
            continue
        grouped.setdefault((game, category, role), []).append(Precise(file, relative, game, category, role, size, score))

    selected = [max(items, key=lambda item: item.score) for items in grouped.values()]
    selected.sort(key=lambda item: (item.game, item.category, item.role.casefold()))
    assets: list[dict] = []
    missing_processed: list[str] = []
    missing_original: list[str] = []

    for order, item in enumerate(selected):
        if item.category == "角色资源":
            scope_root = source_root / item.game
        else:
            scope_root = source_root / item.game / item.category
        processed = choose_stage_file(scope_root / "处理好的原图", item.role, original=False)
        original = choose_stage_file(scope_root / "原始图", item.role, original=True)
        gitee_repo = f"novelai-ref-{GAME_SLUGS[item.game]}"
        precise_entry = file_entry(item.path, source_root, asset_repo, item.game, gitee_repo)
        processed_entry = file_entry(processed, source_root, asset_repo, item.game, gitee_repo) if processed else None
        original_entry = file_entry(original, source_root, asset_repo, item.game, gitee_repo) if original else None
        if not processed:
            missing_processed.append(f"{item.game}/{item.category}/{item.role}")
        if not original:
            missing_original.append(f"{item.game}/{item.category}/{item.role}")

        thumb_rel = Path("thumbnails") / item.relative.with_suffix(".webp")
        thumb_path = asset_repo / thumb_rel
        make_thumbnail(item.path, thumb_path)
        thumb_encoded = encoded(thumb_rel)
        thumb_gitee_rel = encoded(Path("thumbnails") / Path(*item.relative.parts[1:]).with_suffix(".webp"))
        github_thumb = f"https://media.githubusercontent.com/media/2786886095/novelai-reference-assets/main/{thumb_encoded}"
        gitee_thumb = f"https://gitee.com/langbai666/{gitee_repo}/raw/main/{thumb_gitee_rel}"
        localized = names.get(item.role, {})
        role_names = {language: localized.get(language) or item.role for language in LANGUAGES}
        game_names = GAME_NAMES.get(item.game, {language: item.game for language in LANGUAGES})
        asset = {
            "id": f"{item.game}/{item.category}/{item.role}",
            "game": item.game,
            "gameSlug": GAME_SLUGS[item.game],
            "gameNames": game_names,
            "category": item.category,
            "roleId": item.role,
            "names": role_names,
            "searchAliases": sorted(set([item.role, *role_names.values()])),
            "variant": item.role,
            "width": item.size[0],
            "height": item.size[1],
            "bytes": precise_entry["bytes"],
            "downloadUrl": precise_entry["mirrors"]["gitee"],
            "downloadMirrors": precise_entry["mirrors"],
            "thumbnailUrl": gitee_thumb,
            "thumbnailMirrors": {"gitee": gitee_thumb, "github": github_thumb},
            "storagePath": item.relative.as_posix(),
            "files": {"original": original_entry, "processed": processed_entry, "precise": precise_entry},
            "source": "local verified character-reference library; provenance retained in project QA manifests",
            "order": order,
        }
        assets.append(asset)

    categories_by_game = {
        game: sorted({asset["category"] for asset in assets if asset["game"] == game})
        for game in sorted({asset["game"] for asset in assets})
    }
    manifest = {
        "schema": "langbai-reference-catalog/v1",
        "features": ["three-stage-downloads", "localized-search", "real-thumbnails", "regional-mirrors"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedDate": "2026.8.21",
        "provider": "Langbai NovelAI Studio",
        "softwareUrl": "https://nai.langbai.cc/",
        "repositoryUrl": "https://github.com/2786886095/novelai-image-desktop",
        "totalAssets": len(assets),
        "totalBytes": sum(asset["bytes"] for asset in assets),
        "games": [{"id": game, "names": GAME_NAMES.get(game, {}), "categories": categories_by_game[game]} for game in categories_by_game],
        "assets": assets,
        "buildQa": {
            "sourcePreciseFiles": len(precise_files),
            "duplicateSizesCollapsed": len(precise_files) - len(assets),
            "invalidPreciseFiles": invalid,
            "missingProcessed": missing_processed,
            "missingOriginal": missing_original,
            "singleCategoryGames": sorted(SINGLE_CATEGORY_GAMES),
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    (asset_repo / "catalog").mkdir(parents=True, exist_ok=True)
    (asset_repo / "catalog" / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", default=r"D:\Downloads\26.08.21二游角色正面图")
    parser.add_argument("--asset-repo", default=r"F:\AI\agent\codex\novelai-reference-assets")
    parser.add_argument("--output", default=r"F:\AI\agent\codex\novelai-image-desktop\public\reference-catalog\index.json")
    parser.add_argument("--names", default=r"F:\AI\agent\codex\novelai-image-desktop\data\reference-catalog-locales.json")
    args = parser.parse_args()
    manifest = build(args)
    print(json.dumps({
        "assets": manifest["totalAssets"],
        "bytes": manifest["totalBytes"],
        "duplicateSizesCollapsed": manifest["buildQa"]["duplicateSizesCollapsed"],
        "missingProcessed": len(manifest["buildQa"]["missingProcessed"]),
        "missingOriginal": len(manifest["buildQa"]["missingOriginal"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
