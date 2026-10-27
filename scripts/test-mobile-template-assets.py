#!/usr/bin/env python3
"""Synthetic ZIP unit tests for resource-checking logic, NOT native APK/IPA proof."""
import hashlib
import importlib.util
import json
from pathlib import Path
import plistlib
import shutil
import tempfile
import unittest
import warnings
import zipfile

SCRIPT_ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = SCRIPT_ROOT.parent
SPEC = importlib.util.spec_from_file_location("template_asset_checker", SCRIPT_ROOT / "verify-mobile-template-assets.py")
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class SyntheticZipResourceChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mobile-template-assets-unit-")
        self.root = Path(self.temp.name) / "source"
        (self.root / "shared").mkdir(parents=True)
        (self.root / "mobile/assets").mkdir(parents=True)
        shutil.copytree(SOURCE_ROOT / "shared/templates", self.root / "shared/templates")
        for name, _, _ in CHECKER.CATALOGS:
            shutil.copyfile(SOURCE_ROOT / "shared" / name, self.root / "shared" / name)
            shutil.copyfile(SOURCE_ROOT / "mobile/assets" / name, self.root / "mobile/assets" / name)

    def tearDown(self):
        self.temp.cleanup()

    def package(self, platform="android", mutate=None, prefix=None, duplicate=False, extra_app=False):
        package = Path(self.temp.name) / ("SYNTHETIC-RESOURCE-ONLY.apk" if platform == "android" else "SYNTHETIC-RESOURCE-ONLY.ipa")
        prefix = prefix or ("assets/flutter_assets/assets/" if platform == "android" else "Payload/Runner.app/Frameworks/App.framework/flutter_assets/assets/")
        with zipfile.ZipFile(package, "w") as archive:
            if platform == "ios":
                archive.writestr("Payload/Runner.app/Info.plist", plistlib.dumps({"CFBundleIdentifier":"synthetic.resource.fixture"}))
                if extra_app:
                    archive.writestr("Payload/Other.app/Info.plist", plistlib.dumps({}))
            for index, (name, _, _) in enumerate(CHECKER.CATALOGS):
                raw = (self.root / "shared" / name).read_bytes()
                if mutate and index == 0:
                    raw = mutate(raw)
                archive.writestr(prefix + name, raw)
                if duplicate and index == 0:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", UserWarning)
                        archive.writestr(prefix + name, raw)
        return package

    def verify(self, package):
        return CHECKER.verify_mobile_template_assets(package, self.root, "a" * 40)

    def test_android_catalog_members_prove_all_bodies_but_never_claim_native_certification(self):
        result = self.verify(self.package())
        self.assertEqual((result["catalogCount"], result["templateCount"]), (2, 8))
        self.assertFalse(result["functionalCertificationGranted"])
        self.assertFalse(result["rawTemplateMembersClaimed"])
        self.assertTrue(result["allAssetBytesMatchSource"])
        self.assertTrue(result["allBodyHashesVerified"])
        for catalog in result["catalogs"]:
            for template in catalog["templates"]:
                self.assertEqual(template["rawSourceSha256"], template["reconstructedRawSha256"])
                self.assertFalse(template["rawFileIsSeparatePackageMember"])

    def test_ios_catalogs_must_be_in_the_main_flutter_framework(self):
        result = self.verify(self.package("ios"))
        self.assertEqual(result["platform"], "ios")
        self.assertTrue(result["catalogs"][0]["assetPath"].startswith("Payload/Runner.app/Frameworks/App.framework/flutter_assets/"))

    def test_json_semantic_equality_is_not_enough_packaged_bytes_must_match(self):
        with self.assertRaisesRegex(CHECKER.VerificationError, "catalog bytes differ"):
            self.verify(self.package(mutate=lambda raw: raw + b"\n"))

    def test_packaged_body_tampering_is_rejected(self):
        def change(raw):
            obj = json.loads(raw)
            obj["templates"][0]["body"] += " tamper"
            obj["templates"][0]["sha256"] = hashlib.sha256(obj["templates"][0]["body"].encode()).hexdigest()
            return json.dumps(obj).encode()
        with self.assertRaises(CHECKER.VerificationError):
            self.verify(self.package(mutate=change))

    def test_stale_mobile_source_asset_is_rejected_even_before_zip_read(self):
        name = CHECKER.CATALOGS[0][0]
        with (self.root / "mobile/assets" / name).open("ab") as stream:
            stream.write(b"\n")
        with self.assertRaisesRegex(CHECKER.VerificationError, "Mobile source catalog drift"):
            self.verify(self.package())

    def test_duplicate_zip_members_are_not_accepted(self):
        with self.assertRaisesRegex(CHECKER.VerificationError, "Duplicate"):
            self.verify(self.package(duplicate=True))

    def test_wrong_apk_asset_location_does_not_count_as_runtime_evidence(self):
        with self.assertRaisesRegex(CHECKER.VerificationError, "missing"):
            self.verify(self.package(prefix="assets/not-flutter/"))

    def test_multiple_ios_main_app_roots_are_rejected(self):
        with self.assertRaisesRegex(CHECKER.VerificationError, "Exactly one"):
            self.verify(self.package("ios", extra_app=True))

    def test_original_raw_hash_mismatch_is_rejected(self):
        catalog = self.root / "shared" / CHECKER.CATALOGS[0][0]
        obj = json.loads(catalog.read_bytes())
        raw = self.root / "shared" / obj["templates"][0]["filename"]
        with raw.open("ab") as stream:
            stream.write(b"not the reviewed original")
        with self.assertRaisesRegex(CHECKER.VerificationError, "Body differs"):
            self.verify(self.package())

    def test_bom_reconstruction_is_explicit_not_a_standalone_raw_member_claim(self):
        name = CHECKER.CATALOGS[0][0]
        obj = json.loads((self.root / "shared" / name).read_bytes())
        row = obj["templates"][0]
        raw_file = self.root / "shared" / row["filename"]
        original = b"\xef\xbb\xbf" + row["body"].encode("utf-8")
        raw_file.write_bytes(original)
        row["rawSha256"] = hashlib.sha256(original).hexdigest()
        catalog = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        (self.root / "shared" / name).write_bytes(catalog)
        (self.root / "mobile/assets" / name).write_bytes(catalog)
        proof = self.verify(self.package())["catalogs"][0]["templates"][0]
        self.assertTrue(proof["sourceHadUtf8Bom"])
        self.assertEqual(proof["rawSourceSha256"], proof["reconstructedRawSha256"])
        self.assertFalse(proof["rawFileIsSeparatePackageMember"])

    def test_source_sha_must_be_an_immutable_commit_identifier(self):
        with self.assertRaisesRegex(CHECKER.VerificationError, "source SHA"):
            CHECKER.verify_mobile_template_assets(self.package(), self.root, "main")


if __name__ == "__main__":
    unittest.main(verbosity=2)
