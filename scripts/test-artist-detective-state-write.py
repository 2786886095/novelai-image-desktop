"""Offline Windows metadata-lock regressions: no GPU, network, account or billing.

Run with a trusted Python and --runtime-site-packages pointing at the published
runtime's pure-Python artist_detective package. Only unused ML imports are omitted
from the production AST. Production transport/store/function bodies stay intact.
"""
import argparse
import ast
import contextlib
import copy
import errno
import hashlib
import io
import json
import socket
import sys
import tempfile
import types
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

_cli = argparse.ArgumentParser(add_help=False)
_cli.add_argument('--live-file', type=Path, default=Path(__file__).with_name('artist-detective-live.py'))
_cli.add_argument('--runtime-site-packages', type=Path)
_cli.add_argument('--work-dir', type=Path)
_args, _remaining = _cli.parse_known_args()
if _args.runtime_site_packages:
    # Append: never shadow this interpreter's compatible httpx/Pillow binaries.
    sys.path.append(str(_args.runtime_site_packages.resolve(strict=True)))
if _args.work_dir:
    _args.work_dir.mkdir(parents=True, exist_ok=True)

import httpx
from PIL import Image
import artist_detective.io as upstream_io

OMITTED_ML_IMPORTS = {
    'artist_detective.desktop.worker',
    'artist_detective.reconstruction.proposals',
    'artist_detective.reconstruction.scoring',
    'artist_detective.captions.budget',
}
_tree = ast.parse(_args.live_file.read_text(encoding='utf-8-sig'))
_body = [node for node in _tree.body if not (
    isinstance(node, ast.ImportFrom) and node.module in OMITTED_ML_IMPORTS
) and not (
    isinstance(node, ast.If) and isinstance(node.test, ast.Compare)
)]
live = types.ModuleType('actual_state_write_transport')
live.__file__ = str(_args.live_file)
sys.modules[live.__name__] = live
exec(compile(ast.Module(body=_body, type_ignores=[]), str(_args.live_file), 'exec'), live.__dict__)
assert 'torch' not in sys.modules, 'The offline state-write fixture must not import torch'

DELAYS = [.025, .05, .1, .2, .4, .8]
OBSERVATIONS = []


def permission(message='SYNTHETIC_STATUS_REPLACE_DENIED', code=5):
    error = PermissionError(errno.EACCES, message)
    error.winerror = code
    return error


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


class StateWriteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        png = io.BytesIO()
        Image.new('RGB', (832, 1216), 'white').save(png, format='PNG')
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('image.png', png.getvalue())
        cls.response_zip = archive.getvalue()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='artist-state-write-', dir=_args.work_dir)
        self.root = Path(self.temp.name)
        self.catalog = self.root / 'catalog.json'
        self.catalog.write_text(json.dumps([
            {'tag': 'fixture_artist', 'canonical_tag': 'fixture_artist', 'source_slug': 'fixture_artist'}
        ]), encoding='utf-8')
        self.posts, self.generators = [], []
        self.boundary_failures = 0
        self.request = {
            'prompt': '1girl, standing', 'style': '',
            'artists': [{'tag': 'fixture_artist', 'weight': 1}],
            'width': 832, 'height': 1216, 'seed': 42,
        }
        self.stack = contextlib.ExitStack()
        # Fail closed even if a future fixture accidentally bypasses MockTransport.
        self.stack.enter_context(patch.object(socket.socket, 'connect', side_effect=AssertionError('External sockets prohibited')))
        self.stack.enter_context(patch.object(socket, 'create_connection', side_effect=AssertionError('External sockets prohibited')))

    def tearDown(self):
        status = self.root / 'status.json'
        event = json.loads(status.read_text(encoding='utf-8')) if status.exists() else {}
        markers = list((self.root / 'spool/requests').glob('*.json'))
        receipts = self.receipts()
        completed = {path.stem for path in receipts}
        OBSERVATIONS.append({
            'test': self.id().rsplit('.', 1)[-1], 'mockedPosts': len(self.posts),
            'savedReceipts': len(receipts), 'injected89LockFailures': self.boundary_failures,
            'requestMarkerCount': len(markers),
            'pendingRequestCount': sum(path.stem not in completed for path in markers),
            'lastStage': event.get('stage'), 'lastPersistedCompleted': event.get('completed'),
        })
        for generator in self.generators:
            generator.client.close()
        self.stack.close()
        self.temp.cleanup()
        self.assertNotIn('torch', sys.modules)

    def progress(self):
        if hasattr(live, 'persist_progress'):
            return lambda stage, **values: live.persist_progress(self.root, 300, stage, **values)
        # Baseline compatibility: execute the complete existing nested production
        # function verbatim, not a replacement implementation of desired behavior.
        main = next(node for node in _tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        function = next(node for node in main.body if isinstance(node, ast.FunctionDef) and node.name == 'progress')
        namespace = {**live.__dict__, 'out': self.root, 'command': {'budget': 300}}
        exec(compile(ast.Module(body=[copy.deepcopy(function)], type_ignores=[]), str(_args.live_file), 'exec'), namespace)
        return namespace['progress']

    def generator(self, resume=False):
        generator = live.LiveGenerator(
            self.root / 'spool', self.catalog, 300, 'SYNTHETIC_SECRET_NOT_REAL',
            lambda: None, self.progress(), resume=resume,
            transport_bridge={'url': 'http://127.0.0.1:12345/generate', 'key': 'a' * 64},
        )
        generator.client.close()

        def response(request):
            self.assertEqual(str(request.url), 'http://127.0.0.1:12345/generate')
            self.assertNotIn('authorization', request.headers)
            self.posts.append(json.loads(request.content))
            return httpx.Response(200, content=self.response_zip)

        generator.client = httpx.Client(transport=httpx.MockTransport(response))
        self.generators.append(generator)
        return generator

    def generate(self, generator, requests=None):
        with patch.object(live.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            return generator.generate(requests or [self.request])

    def receipts(self):
        return list((self.root / 'spool/results').glob('*/*.json'))

    def test_transient_windows_replace_retries_preserve_atomic_json_and_fsync(self):
        for winerror in (5, 32, 33):
            with self.subTest(winerror=winerror):
                target = self.root / ('status-' + str(winerror) + '.json')
                previous, expected = {'stage': 'old'}, {'stage': 'new', 'text': '\u4e2d\u6587'}
                upstream_io.atomic_json(target, previous)
                original_hash = digest(target)
                attempts = []
                actual_replace, actual_fsync = upstream_io.os.replace, upstream_io.os.fsync

                def transient(source, destination):
                    if Path(destination) == target:
                        attempts.append(str(source))
                        self.assertEqual(json.loads(Path(source).read_text(encoding='utf-8')), expected)
                        if len(attempts) <= 2:
                            self.assertEqual(digest(target), original_hash)
                            raise permission(code=winerror)
                    return actual_replace(source, destination)

                with patch.object(upstream_io.os, 'replace', side_effect=transient), \
                        patch.object(upstream_io.os, 'fsync', wraps=actual_fsync) as fsync, \
                        patch.object(live.time, 'sleep') as sleep:
                    live.atomic_json(target, expected)
                self.assertEqual(len(attempts), 3)
                self.assertEqual([call.args[0] for call in sleep.call_args_list], DELAYS[:2])
                self.assertGreaterEqual(fsync.call_count, 1)
                self.assertEqual(json.loads(target.read_text(encoding='utf-8')), expected)
                self.assertEqual(list(self.root.glob(target.name + '.*.tmp')), [])

    def test_permanent_windows_denial_is_bounded_preserves_original_and_raises(self):
        target = self.root / 'status.json'
        upstream_io.atomic_json(target, {'stage': 'old'})
        original = target.read_bytes()
        failure = permission()
        with patch.object(upstream_io.os, 'replace', side_effect=failure) as replace, \
                patch.object(live.time, 'sleep') as sleep:
            with self.assertRaises(PermissionError) as caught:
                live.atomic_json(target, {'stage': 'new'})
        self.assertIs(caught.exception, failure)
        self.assertEqual(replace.call_count, 7)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], DELAYS)
        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(list(self.root.glob('*.tmp')), [])

    def test_other_errors_are_not_retried_or_swallowed(self):
        for failure in (OSError(errno.ENOSPC, 'SYNTHETIC_FULL_DISK'), permission(code=123)):
            with self.subTest(error=repr(failure)):
                with patch.object(upstream_io.os, 'replace', side_effect=failure) as replace, \
                        patch.object(live.time, 'sleep') as sleep:
                    with self.assertRaises(type(failure)) as caught:
                        live.atomic_json(self.root / 'status.json', {'stage': 'new'})
                self.assertIs(caught.exception, failure)
                self.assertEqual(replace.call_count, 1)
                self.assertEqual(sleep.call_count, 0)

    def test_permanent_presubmit_status_failure_creates_no_marker_and_no_post(self):
        generator = self.generator()
        actual_replace = upstream_io.os.replace

        def denied(source, destination):
            if Path(destination) == self.root / 'status.json':
                raise permission()
            return actual_replace(source, destination)

        with patch.object(upstream_io.os, 'replace', side_effect=denied):
            with self.assertRaises(PermissionError):
                self.generate(generator)
        self.assertEqual(len(self.posts), 0)
        self.assertEqual(list((self.root / 'spool/requests').glob('*.json')), [])
        self.assertEqual(self.receipts(), [])

    def test_postreceipt_status_failure_keeps_cached_image_and_resume_never_reposts(self):
        generator = self.generator()
        actual_replace = upstream_io.os.replace

        def denied_after_receipt(source, destination):
            if Path(destination) == self.root / 'status.json':
                value = json.loads(Path(source).read_text(encoding='utf-8'))
                if value.get('stage') == 'generated':
                    raise permission()
            return actual_replace(source, destination)

        with patch.object(upstream_io.os, 'replace', side_effect=denied_after_receipt):
            with self.assertRaises(PermissionError):
                self.generate(generator)
        self.assertEqual(len(self.posts), 1)
        self.assertEqual(len(self.receipts()), 1)
        original = {str(path): digest(path) for path in (self.root / 'spool').rglob('*') if path.is_file()}
        saved = self.generate(self.generator(resume=True))
        self.assertEqual(len(saved), 1)
        self.assertEqual(len(self.posts), 1)
        self.assertTrue(all(digest(path) == expected for path, expected in original.items()))
        self.assertEqual(list((self.root / 'spool/recovery').glob('*.json')), [])

    def test_failure_reporting_preserves_sanitized_primary_when_metadata_also_fails(self):
        secret = 'SYNTHETIC_SECRET_NOT_REAL'
        primary = permission('PRIMARY_STATUS_DENIED ' + secret)
        secondary = permission('SECONDARY_FAILURE_WRITE_DENIED ' + secret)
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(upstream_io.os, 'replace', side_effect=secondary), \
                patch.object(live.time, 'sleep'), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            live.record_run_failure(self.root, {'budget': 300}, primary, [secret])
        logged = stdout.getvalue() + stderr.getvalue()
        self.assertIn('PRIMARY_STATUS_DENIED', logged)
        self.assertIn('SECONDARY_FAILURE_WRITE_DENIED', logged)
        self.assertIn('PermissionError', logged)
        self.assertNotIn(secret, logged)
        self.assertEqual(len(self.posts), 0)

    def test_300_mocked_images_transient_lock_at89_finishes_without_duplicate_submission(self):
        generator = self.generator()
        actual_replace = upstream_io.os.replace
        denied = []

        def locked_at89(source, destination):
            if Path(destination) == self.root / 'status.json':
                event = json.loads(Path(source).read_text(encoding='utf-8'))
                if event.get('stage') == 'generated' and event.get('completed') == 89 and len(denied) < 2:
                    denied.append(str(source))
                    self.boundary_failures += 1
                    self.assertEqual(len(self.posts), 89)
                    self.assertEqual(len(self.receipts()), 89)
                    raise permission()
            return actual_replace(source, destination)

        requests = [{**self.request, 'seed': index} for index in range(1, 301)]
        with patch.object(upstream_io.os, 'replace', side_effect=locked_at89):
            saved = self.generate(generator, requests)
        self.assertEqual(len(denied), 2)
        self.assertEqual(len(saved), 300)
        self.assertEqual(len(self.posts), 300)
        self.assertEqual(len(self.receipts()), 300)
        self.assertEqual([request['parameters']['seed'] for request in self.posts], list(range(1, 301)))
        self.assertEqual(len({row['request_hash'] for row in saved}), 300)
        self.assertEqual(json.loads((self.root / 'status.json').read_text(encoding='utf-8'))['completed'], 300)
        self.assertEqual(list((self.root / 'spool/recovery').glob('*.json')), [])
        self.assertEqual(list(self.root.rglob('*.tmp')), [])
        print(json.dumps({'fixture': 'transient-state-lock-at89', 'mockedPosts': len(self.posts),
                          'savedReceipts': len(self.receipts()), 'duplicates': 0, 'gpu': False, 'paidCalls': 0}))


if __name__ == '__main__':
    suite = unittest.main(argv=[sys.argv[0], *_remaining], verbosity=2, exit=False)
    print('STATE_WRITE_SUMMARY ' + json.dumps({
        'liveFile': str(_args.live_file.resolve()), 'testsRun': suite.result.testsRun,
        'sourceSha256': digest(_args.live_file),
        'failures': len(suite.result.failures), 'errors': len(suite.result.errors),
        'observations': OBSERVATIONS, 'networkCalls': 0, 'paidCalls': 0, 'gpu': False,
    }, sort_keys=True), flush=True)
    sys.exit(0 if suite.result.wasSuccessful() else 1)
