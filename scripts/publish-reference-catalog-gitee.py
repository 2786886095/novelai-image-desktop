#!/usr/bin/env python3
"""Publish one best precise reference plus thumbnail to per-game Gitee mirrors.

Repositories are deliberately split per game so each remains below Gitee's free
repository size ceiling. Authentication is delegated to git-credential and is
never written to this script, its reports, or repository remotes.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


def run(command: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, encoding="utf-8", errors="replace", capture_output=True)
    if result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(command[:3])}\n{result.stderr[-1200:]}")
    return result.stdout.strip()


def clean_worktree(repo: Path) -> None:
    root = repo.resolve()
    if root.name.startswith("novelai-ref-") is False:
        raise RuntimeError(f"refusing to clean unexpected directory: {root}")
    for item in root.iterdir():
        if item.name == ".git":
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()


def gitee_token() -> str:
    result = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=gitee.com\n\n",
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=True,
    )
    for line in result.stdout.splitlines():
        if line.startswith("password="):
            return line.removeprefix("password=")
    raise RuntimeError("Gitee credential is not configured")


def ensure_public_repository(repo_name: str, token: str) -> None:
    """Keep the anonymous raw URLs usable without storing credentials in files."""
    body = urllib.parse.urlencode(
        {"access_token": token, "name": repo_name, "private": "false", "default_branch": "main"}
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://gitee.com/api/v5/repos/langbai666/{repo_name}",
        data=body,
        method="PATCH",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if payload.get("private") is not False or payload.get("default_branch") != "main":
        raise RuntimeError(f"Gitee repository is not public on main: {repo_name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=r"F:\AI\agent\codex\novelai-image-desktop\public\reference-catalog\index.json")
    parser.add_argument("--asset-repo", default=r"F:\AI\agent\codex\novelai-reference-assets")
    parser.add_argument("--work-root", default=r"F:\AI\agent\codex\gitee-reference-mirrors")
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text("utf-8"))
    asset_repo = Path(args.asset_repo).resolve()
    work_root = Path(args.work_root).resolve()
    work_root.mkdir(parents=True, exist_ok=True)
    token = gitee_token()
    summary = []

    for game in manifest["games"]:
        game_id = game["id"]
        slug = next(asset["gameSlug"] for asset in manifest["assets"] if asset["game"] == game_id)
        repo_name = f"novelai-ref-{slug}"
        repo = work_root / repo_name
        remote = f"https://gitee.com/langbai666/{repo_name}.git"
        if not (repo / ".git").exists():
            run(["git", "clone", remote, str(repo)])
        else:
            fetched = subprocess.run(["git", "fetch", "origin", "main"], cwd=repo, capture_output=True).returncode == 0
            if fetched:
                run(["git", "reset", "--hard", "origin/main"], repo)
            else:
                run(["git", "fetch", "origin", "master"], repo)
                run(["git", "reset", "--hard", "origin/master"], repo)
        run(["git", "switch", "-C", "main"], repo)
        run(["git", "config", "user.name", "Langbai"], repo)
        run(["git", "config", "user.email", "2786886095@users.noreply.github.com"], repo)
        clean_worktree(repo)
        selected = [asset for asset in manifest["assets"] if asset["game"] == game_id]
        copied_bytes = 0
        for asset in selected:
            source = asset_repo / "assets" / Path(asset["storagePath"])
            target = repo / "assets" / Path(*Path(asset["storagePath"]).parts[1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied_bytes += target.stat().st_size
            source_thumb = asset_repo / "thumbnails" / Path(asset["storagePath"]).with_suffix(".webp")
            target_thumb = repo / "thumbnails" / Path(*Path(asset["storagePath"]).parts[1:]).with_suffix(".webp")
            target_thumb.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_thumb, target_thumb)
            copied_bytes += target_thumb.stat().st_size
        catalog = {**manifest, "assets": selected, "totalAssets": len(selected), "totalBytes": sum(asset["bytes"] for asset in selected)}
        (repo / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), "utf-8")
        (repo / "README.md").write_text(
            f"# {game_id} · NovelAI 精准参考镜像\n\n"
            "Langbai NovelAI Studio 中国大陆下载镜像。每个角色/形态仅保留一个最佳精准参考尺寸。\n\n"
            f"- 资源数：{len(selected)}\n- 更新日期：2026.8.21\n"
            "- 软件：https://nai.langbai.cc/\n- 软件仓库：https://github.com/2786886095/novelai-image-desktop\n",
            "utf-8",
        )
        run(["git", "add", "-A"], repo)
        changed = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo).returncode != 0
        if changed:
            run(["git", "commit", "-m", "assets: publish precise references 2026.8.21"], repo)
            run(["git", "push", "origin", "main"], repo)
        ensure_public_repository(repo_name, token)
        head = run(["git", "rev-parse", "HEAD"], repo)
        summary.append({"game": game_id, "repo": repo_name, "assets": len(selected), "bytes": copied_bytes, "head": head, "pushed": changed})
        print(json.dumps(summary[-1], ensure_ascii=False), flush=True)

    report = work_root / "PUBLISH_REPORT.json"
    report.write_text(json.dumps({"updatedDate": "2026.8.21", "repositories": summary}, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"repositories": len(summary), "assets": sum(item["assets"] for item in summary), "report": str(report)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
