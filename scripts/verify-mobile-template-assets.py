#!/usr/bin/env python3
"""Read-only source-bound template-resource proof for an actual APK or IPA.

This does not execute/install a package or certify UI, signing or native features.
Mobile ships two catalogs containing eight bodies, not eight standalone raw files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import zipfile

SCHEMA = "mobile-template-assets-proof/v1"
CATALOGS = (
    ("prompt-skill-catalog-v3.json", "image-skill", {
        f"image.{task}.{mode}" for task in ("reverse", "convert")
        for mode in ("tags", "natural", "mixed")
    }),
    ("comic-template-catalog.json", "comic", {"comic.jp-page", "comic.single-panel"}),
)
MAX_CATALOG_BYTES = 8 * 1024 * 1024


class VerificationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def source_catalog(root: Path, filename: str, family: str, slots: set[str]) -> tuple[bytes, list[dict]]:
    shared = root / "shared"
    path = shared / filename
    require(0 < path.stat().st_size <= MAX_CATALOG_BYTES, f"Source catalog size invalid: {filename}")
    raw = path.read_bytes()
    mobile = root / "mobile" / "assets" / filename
    require(mobile.is_file() and mobile.read_bytes() == raw, f"Mobile source catalog drift: {filename}")
    value = json.loads(raw.decode("utf-8"))
    require(isinstance(value, dict) and value.get("schema") == "langbai.template-catalog/1"
            and value.get("family") == family, f"Source catalog schema/family invalid: {filename}")
    rows = value.get("templates")
    require(isinstance(rows, list) and len(rows) == len(slots), f"Source catalog count invalid: {filename}")
    require(all(isinstance(row, dict) for row in rows), f"Source catalog rows invalid: {filename}")
    require({row.get("slot") for row in rows} == slots, f"Source catalog slots invalid: {filename}")
    require(len({row.get("id") for row in rows}) == len(rows), f"Duplicate template IDs: {filename}")
    templates = []
    for row in rows:
        body, relative = row.get("body"), row.get("filename")
        require(isinstance(body, str) and bool(body.strip()), "Missing source template body")
        require(isinstance(relative, str) and relative.startswith("templates/") and "\\" not in relative,
                "Invalid original template resource path")
        rel = Path(relative)
        require(not rel.is_absolute() and all(part not in ("", ".", "..") for part in relative.split("/")),
                "Unsafe original template resource path")
        original_path = (shared / rel).resolve(strict=True)
        require(original_path.is_relative_to(shared.resolve()), "Original template path escaped shared/")
        original = original_path.read_bytes()
        has_bom = original.startswith(b"\xef\xbb\xbf")
        expected_body = original.decode("utf-8").removeprefix("\ufeff")
        require(body == expected_body, f"Body differs from original raw resource: {relative}")
        body_sha, raw_sha = digest(body.encode("utf-8")), digest(original)
        require(body_sha == row.get("sha256") and raw_sha == row.get("rawSha256"),
                f"Source template hash mismatch: {relative}")
        templates.append({
            "id": row["id"], "slot": row["slot"], "bodySha256": body_sha,
            "rawSourceSha256": raw_sha, "rawSourceFile": "shared/" + relative,
            "sourceHadUtf8Bom": has_bom,
            "sourceVersion": row.get("sourceVersion"),
        })
    return raw, templates


def verify_mobile_template_assets(package: Path, root: Path, source_sha: str) -> dict:
    require(bool(re.fullmatch(r"[a-f0-9]{40}", source_sha)), "An immutable 40-character source SHA is required")
    package = package.absolute()
    before = package.lstat()
    require(stat.S_ISREG(before.st_mode) and not package.is_symlink(), "Package must be a regular, non-symlink file")
    require(0 < before.st_size <= 2 * 1024**3, "Package size exceeds bounded limit")
    extension = package.suffix.lower()
    require(extension in (".apk", ".ipa"), "Expected an APK or IPA")
    platform = "android" if extension == ".apk" else "ios"
    expected = [(filename, *source_catalog(root, filename, family, slots))
                for filename, family, slots in CATALOGS]
    package_sha = file_digest(package)
    proofs = []
    with zipfile.ZipFile(package) as archive:
        infos = archive.infolist()
        require(0 < len(infos) <= 50000, "Package entry count exceeds bounded limit")
        names = [info.filename for info in infos]
        require(len(names) == len(set(names)), "Duplicate package ZIP members are not accepted")
        if platform == "android":
            prefix = "assets/flutter_assets/assets/"
        else:
            main = [name for name in names if re.fullmatch(r"Payload/[^/]+[.]app/Info[.]plist", name)]
            require(len(main) == 1, "Exactly one main iOS app plist is required to locate Flutter assets")
            app = main[0][:-len("Info.plist")]
            prefix = app + "Frameworks/App.framework/flutter_assets/assets/"
        for filename, source_bytes, source_templates in expected:
            member = prefix + filename
            require(member in names, f"Packaged template catalog missing: {member}")
            # A shadow copy elsewhere is not evidence that the running app loads it.
            matches = [name for name in names if name.endswith("flutter_assets/assets/" + filename)]
            require(matches == [member], f"Ambiguous packaged template catalog copies: {filename}")
            info = archive.getinfo(member)
            require(not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16)
                    and not (info.flag_bits & 1), f"Invalid packaged catalog member: {member}")
            require(0 < info.file_size <= MAX_CATALOG_BYTES, f"Packaged catalog size invalid: {member}")
            payload = archive.read(member)  # zipfile verifies this member's CRC.
            require(payload == source_bytes, f"Packaged catalog bytes differ from reviewed source: {filename}")
            rows = json.loads(payload.decode("utf-8"))["templates"]
            proven = []
            for row, original in zip(rows, source_templates):
                body_bytes = row["body"].encode("utf-8")
                body_sha = digest(body_bytes)
                require(body_sha == original["bodySha256"] == row["sha256"], "Packaged body hash differs")
                reconstructed = (b"\xef\xbb\xbf" if original["sourceHadUtf8Bom"] else b"") + body_bytes
                raw_sha = digest(reconstructed)
                require(raw_sha == original["rawSourceSha256"] == row["rawSha256"],
                        "Packaged body cannot reconstruct the original raw source hash")
                proven.append({**original, "reconstructedRawSha256": raw_sha,
                               "rawFileIsSeparatePackageMember": False})
            proofs.append({"assetPath": member, "bytes": len(payload), "sha256": digest(payload),
                           "sourceCatalog": "shared/" + filename,
                           "mobileSourceCatalog": "mobile/assets/" + filename,
                           "memberCrcVerified": True, "templates": proven})
    after = package.stat()
    require(after.st_size == before.st_size and after.st_mtime_ns == before.st_mtime_ns
            and file_digest(package) == package_sha, "Package changed during inspection")
    return {"schema": SCHEMA, "sourceSha": source_sha, "platform": platform,
            "artifact": {"name": package.name, "bytes": before.st_size, "sha256": package_sha},
            "catalogCount": len(proofs), "templateCount": sum(len(p["templates"]) for p in proofs),
            "allAssetBytesMatchSource": True, "allBodyHashesVerified": True,
            "allReconstructedRawHashesVerified": True, "rawTemplateMembersClaimed": False,
            "functionalCertificationGranted": False, "catalogs": proofs,
            "scope": "Read-only packaged catalog resources only; not signing, installability, UI, model or native feature certification."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--source-sha", default=os.environ.get("GITHUB_SHA", ""))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        proof = verify_mobile_template_assets(args.package, args.source_root, args.source_sha)
        text = json.dumps(proof, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text, encoding="utf-8")
        print(text, end="")
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, RuntimeError) as error:
        print(f"MOBILE TEMPLATE ASSET VERIFICATION FAILED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
