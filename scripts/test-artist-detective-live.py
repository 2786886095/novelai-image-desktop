"""Transport fixtures only: synthetic PNGs are never counted as live acceptance images."""
import importlib.util
import io
import json
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path

import httpx
from PIL import Image

spec = importlib.util.spec_from_file_location("live", Path(__file__).with_name("artist-detective-live.py"))
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.catalog = self.root / "catalog.json"
        self.catalog.write_text(json.dumps([{"tag": "test_artist", "canonical_tag": "test_artist", "source_slug": "test_artist"}]))
        self.calls = []
        self.gen = live.LiveGenerator(self.root / "spool", self.catalog, 2, "FIXTURE_NOT_A_CREDENTIAL", lambda: None, lambda *a, **k: None)
        self.body = {"prompt": "1girl, standing", "style": "", "artists": [{"tag": "test_artist", "weight": 1}], "width": 832, "height": 1216, "seed": 42}
        self.gen.client.close()

    def tearDown(self):
        self.gen.client.close()
        self.temp.cleanup()

    def transport(self, handler):
        def call(request):
            self.calls.append(request)
            return handler(request)
        self.gen.client = httpx.Client(transport=httpx.MockTransport(call))

    @staticmethod
    def image_response(size=(832, 1216)):
        png = io.BytesIO()
        Image.new("RGB", size, "white").save(png, format="PNG")
        zipped = io.BytesIO()
        with zipfile.ZipFile(zipped, "w") as archive:
            archive.writestr("image.png", png.getvalue())
        return httpx.Response(200, content=zipped.getvalue())

    def test_cache_exact_payload_hash_and_secret_exclusion(self):
        self.transport(lambda _: self.image_response())
        a = self.gen.generate([self.body])[0]
        b = self.gen.generate([self.body])[0]
        self.assertEqual(a, b)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(a["native_payload"]["model"], "nai-diffusion-4-5-full")
        self.assertEqual(live.file_sha256(Path(a["image"])), a["image_sha256"])
        for file in self.root.rglob("*.json"):
            self.assertNotIn("FIXTURE_NOT_A_CREDENTIAL", file.read_text())

    def test_uncertain_submission_never_automatically_replayed(self):
        def timeout(_):
            raise httpx.ReadTimeout("fixture timeout")
        self.transport(timeout)
        with self.assertRaises(httpx.ReadTimeout): self.gen.generate([self.body])
        with self.assertRaisesRegex(RuntimeError, "Unresolved previous submission"): self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 1)

    def test_bad_dimensions_not_accepted(self):
        self.transport(lambda _: self.image_response((32, 32)))
        with self.assertRaisesRegex(RuntimeError, "dimensions differ"): self.gen.generate([self.body])
        self.assertFalse(list((self.root / "spool/results").glob("*/*.json")))

    def test_connect_failure_retries_without_duplicate_request_records(self):
        def respond(_):
            if len(self.calls) == 1:
                raise httpx.ConnectError("fixture TLS handshake failed")
            return self.image_response()
        self.transport(respond)
        with patch.object(live.time, "sleep"):
            result = self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len(result), 1)
        self.assertEqual(len(list((self.root / "spool/requests").glob("*.json"))), 1)

    def test_connect_retry_is_bounded_and_incomplete_body_is_not_retried(self):
        self.transport(lambda _: (_ for _ in ()).throw(httpx.ConnectTimeout("fixture")))
        with patch.object(live.time, "sleep"), self.assertRaises(httpx.ConnectTimeout):
            self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 3)
        self.calls.clear()
        self.transport(lambda _: (_ for _ in ()).throw(httpx.RemoteProtocolError("fixture truncated body")))
        with self.assertRaises(httpx.RemoteProtocolError):
            self.gen.generate([{**self.body, "seed": 43}])
        self.assertEqual(len(self.calls), 1)

    def test_http_error_stops_without_retry(self):
        self.transport(lambda _: httpx.Response(401))
        with self.assertRaisesRegex(RuntimeError, "HTTP 401"): self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 1)

    def test_429_respects_retry_after_then_saves_one_image(self):
        self.transport(lambda _: httpx.Response(429, headers={"Retry-After": "120"}) if len(self.calls) == 1 else self.image_response())
        with patch.object(live.time, "sleep") as sleep:
            result = self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len(result), 1)
        self.assertGreaterEqual(sleep.call_count * 0.1, 120)
        self.assertEqual(len(list((self.root / "spool/requests").glob("*.json"))), 1)
        self.assertEqual(len(list((self.root / "spool/rate-limits").glob("*.json"))), 1)

    def test_429_exhaustion_is_bounded_and_resumable(self):
        self.transport(lambda _: httpx.Response(429))
        with patch.object(live.time, "sleep"), self.assertRaisesRegex(RuntimeError, "bounded backoff"):
            self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 7)
        self.gen.client.close()
        self.gen = live.LiveGenerator(self.root / "spool", self.catalog, 2, "FIXTURE_NOT_A_CREDENTIAL", lambda: None, lambda *a, **k: None)
        self.calls.clear()
        self.gen.max_renders = 1
        self.transport(lambda _: self.image_response())
        with patch.object(live.time, "sleep"):
            result = self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(result), 1)

    def test_429_does_not_make_a_later_uncertain_request_replayable(self):
        def handler(_):
            if len(self.calls) == 1:
                return httpx.Response(429)
            raise httpx.RemoteProtocolError("fixture truncated response")
        self.transport(handler)
        with patch.object(live.time, "sleep"), self.assertRaises(httpx.RemoteProtocolError):
            self.gen.generate([self.body])
        with self.assertRaisesRegex(RuntimeError, "Unresolved previous submission"):
            self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 2)

    def test_429_backoff_is_cancellable(self):
        self.transport(lambda _: httpx.Response(429))
        def cancelled():
            if self.calls:
                raise RuntimeError("fixture cancelled")
        self.gen.check = cancelled
        with self.assertRaisesRegex(RuntimeError, "fixture cancelled"):
            self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 1)

    def test_retry_after_numeric_date_and_invalid(self):
        self.assertEqual(self.gen.retry_seconds("120", 0), 120)
        self.assertEqual(self.gen.retry_seconds("NaN", 0), 60)
        self.assertEqual(self.gen.retry_seconds(None, 0), 60)
        self.assertEqual(self.gen.retry_seconds("bad", 6), 900)
        with patch.object(live.time, "time", return_value=0):
            self.assertEqual(self.gen.retry_seconds("Thu, 01 Jan 1970 00:03:00 GMT", 0), 180)

    def test_legacy_429_sidecar_migrates_before_upstream_spool_load(self):
        record = self.gen.store.prepare(self.body)
        marker = self.root / "spool/requests" / (record["request_hash"] + ".json")
        live.atomic_json(marker, record)
        legacy = marker.with_suffix(".error.json")
        live.atomic_json(legacy, {"status": 429})
        self.gen.client.close()
        self.gen = live.LiveGenerator(self.root / "spool", self.catalog, 1, "FIXTURE_NOT_A_CREDENTIAL", lambda: None, lambda *a, **k: None)
        self.gen.client.close()
        self.assertFalse(legacy.exists())
        self.transport(lambda _: self.image_response())
        with patch.object(live.time, "sleep"):
            self.assertEqual(len(self.gen.generate([self.body])), 1)
        self.assertEqual(len(self.calls), 1)

    def test_budget_and_cancellation_checked_before_request(self):
        self.gen.max_renders = 0
        self.transport(lambda _: self.image_response())
        with self.assertRaisesRegex(ValueError, "budget exhausted"): self.gen.generate([self.body])
        self.assertEqual(len(self.calls), 0)


if __name__ == "__main__": unittest.main()
