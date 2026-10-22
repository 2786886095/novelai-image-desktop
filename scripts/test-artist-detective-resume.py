"""Real spool/checkpoint transport fixtures; no model, GPU or paid-provider proof.

The AST loader preserves complete production function/class bodies and excludes
only unused ML imports. Original transport tests remain a separate unchanged file.
"""
import argparse,ast,hashlib,io,json,sys,tempfile,types,unittest,uuid,zipfile
from pathlib import Path
from unittest.mock import patch
import httpx
from PIL import Image

_cli=argparse.ArgumentParser(add_help=False)
_cli.add_argument('--live-file',type=Path,default=Path(__file__).with_name('artist-detective-live.py'))
_cli.add_argument('--work-dir',type=Path)
_args,_remaining=_cli.parse_known_args()
if _args.work_dir:_args.work_dir.mkdir(parents=True,exist_ok=True)
OMITTED_ML_IMPORTS={'artist_detective.desktop.worker','artist_detective.reconstruction.proposals','artist_detective.reconstruction.scoring','artist_detective.captions.budget'}
def load_transport(file):
    tree=ast.parse(file.read_text(encoding='utf-8-sig'))
    body=[n for n in tree.body if not(isinstance(n,ast.ImportFrom) and n.module in OMITTED_ML_IMPORTS) and not(isinstance(n,ast.If) and isinstance(n.test,ast.Compare))]
    module=types.ModuleType('actual_resume_transport');module.__file__=str(file);sys.modules[module.__name__]=module
    exec(compile(ast.Module(body=body,type_ignores=[]),str(file),'exec'),module.__dict__)
    return module
live=load_transport(_args.live_file)
assert 'torch' not in sys.modules
from artist_detective.reconstruction.search import SearchConfig,run_search

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
class ResumeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p=io.BytesIO();Image.new('RGB',(832,1216),'white').save(p,format='PNG');z=io.BytesIO()
        with zipfile.ZipFile(z,'w') as archive:archive.writestr('image.png',p.getvalue())
        cls.zip=z.getvalue()
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='artist-resume-host-',dir=_args.work_dir);self.root=Path(self.temp.name)
        self.catalog=self.root/'catalog.json';self.artists=[{'tag':'fixture_artist_'+str(i),'canonical_tag':'fixture_artist_'+str(i),'source_slug':'fixture_artist_'+str(i)} for i in range(20)];self.catalog.write_text(json.dumps(self.artists),encoding='utf8')
        self.posts=[];self.generators=[];self.events=[]
        self.body={'prompt':'1girl, standing','style':'','artists':[{'tag':'fixture_artist_0','weight':1}],'width':832,'height':1216,'seed':42}
    def tearDown(self):
        for g in self.generators:g.client.close()
        self.temp.cleanup()
    def gen(self,handler=None,**options):
        g=live.LiveGenerator(self.root/'spool',self.catalog,300,'SYNTHETIC_SECRET_NOT_REAL',lambda:None,lambda *a,**k:self.events.append((a,k)),transport_bridge={'url':'http://127.0.0.1:12345/generate','key':'a'*64},**options)
        g.client.close()
        def respond(request):
            self.assertEqual(str(request.url),'http://127.0.0.1:12345/generate');self.assertNotIn('authorization',request.headers);self.posts.append(request)
            return handler(request) if handler else httpx.Response(200,content=self.zip)
        g.client=httpx.Client(transport=httpx.MockTransport(respond));self.generators.append(g);return g
    def generate(self,g,bodies=None):
        with patch.object(live.time,'sleep'):return g.generate(bodies or [self.body])
    def pending(self):
        results={p.stem for p in (self.root/'spool/results').glob('*/*.json')}
        return [p for p in (self.root/'spool/requests').glob('*.json') if p.stem not in results]
    def authorize(self,key,consent=None):return {'requestHash':key,'consentId':consent or str(uuid.uuid4()),'allowUncertainReplay':True}
    def fail_unknown(self,g=None):
        g=g or self.gen(lambda _:httpx.Response(598,headers={'x-studio-network-failure':'uncertain','x-studio-network-code':'reset'}))
        with self.assertRaises(httpx.ReadError):self.generate(g)
        return self.pending()[0].stem
    def result_files(self):return list((self.root/'spool/results').glob('*/*.json'))
    def search(self,g):
        target={'id':1,'content_tags':'1girl, standing','style_tags':'','width':832,'height':1216}
        initial=[[{'tag':a['tag'],'weight':1}] for a in self.artists[:16]]
        with patch.object(live.time,'sleep'):
            return run_search(target,initial,[a['tag'] for a in self.artists],g,lambda images:[.5]*len(images),self.root/'search',SearchConfig.for_budget(300,random_seed=246813579,proposal_pool_multiplier=8),scorer_identity={'host_fixture':True},proposal_ranker=lambda recipes:[.5]*len(recipes),proposal_ranker_identity={'host_fixture':True})
    def test_http_2xx_valid_zip_requires_verified_dimensions_and_caches_without_another_post(self):
        expected_png = zipfile.ZipFile(io.BytesIO(self.zip)).read("image.png")
        for status in (200, 201, 202, 206, 299):
            with self.subTest(status=status):
                before = len(self.posts)
                g = self.gen(lambda _, status=status: httpx.Response(status, content=self.zip))
                body = {**self.body, "seed": 1000 + status}
                first = self.generate(g, [body])
                self.assertEqual(len(first), 1)
                self.assertEqual(len(self.posts), before + 1)
                self.assertEqual(Path(first[0]["image"]).read_bytes(), expected_png)
                self.assertEqual(first[0]["image_sha256"], hashlib.sha256(expected_png).hexdigest())
                with Image.open(first[0]["image"]) as image:
                    self.assertEqual(image.format, "PNG")
                    self.assertEqual(image.size, (832, 1216))
                    image.verify()
                self.assertEqual(self.generate(g, [body]), first)
                self.assertEqual(len(self.posts), before + 1)

    def test_invalid_2xx_or_non_success_never_commits_an_image_or_silently_replays(self):
        def png_zip(content):
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as archive:
                archive.writestr("image.png", content)
            return output.getvalue()
        wrong = io.BytesIO()
        Image.new("RGB", (32, 32), "white").save(wrong, format="PNG")
        cases = [("bad-zip", 201, b"not a ZIP", zipfile.BadZipFile, "not a zip file"),
                 ("bad-png", 201, png_zip(b"not a PNG"), OSError, "cannot identify image"),
                 ("wrong-dimensions", 201, png_zip(wrong.getvalue()), RuntimeError, "dimensions differ"),
                 ("queued-json", 202, b'{"state":"queued","id":"SYNTHETIC_ONLY"}', zipfile.BadZipFile, "not a zip file"),
                 ("empty", 204, b"", zipfile.BadZipFile, "not a zip file"),
                 ("other-2xx-empty", 299, b"", zipfile.BadZipFile, "not a zip file"),
                 ("http-error", 503, b"SYNTHETIC_PRIVATE_ERROR", RuntimeError, "HTTP 503")]
        original_root = self.root
        for name, status, content, exception, message in cases:
            with self.subTest(name=name):
                self.root = original_root / name
                self.root.mkdir()
                try:
                    before = len(self.posts)
                    g = self.gen(lambda _, status=status, content=content: httpx.Response(status, content=content))
                    with self.assertRaisesRegex(exception, message) as caught:
                        self.generate(g)
                    live.record_run_failure(self.root, {"budget": 300, "language": "zh-CN"}, caught.exception, [])
                    self.assertEqual(len(self.result_files()), 0)
                    pending = self.pending()
                    self.assertEqual(len(pending), 1)
                    marker_before = pending[0].read_bytes()
                    self.assertEqual(len(self.posts), before + 1)
                    with self.assertRaisesRegex(RuntimeError, "Unresolved previous submission"):
                        self.generate(g)
                    with self.assertRaisesRegex(RuntimeError, "explicit paid replay confirmation") as recovery:
                        self.gen(resume=True)
                    self.assertTrue(recovery.exception.resume_details["requiresPaidReplayConfirmation"])
                    self.assertEqual(recovery.exception.resume_details["pendingRequestHash"], pending[0].stem)
                    self.assertEqual(pending[0].read_bytes(), marker_before)
                    self.assertEqual(len(self.result_files()), 0)
                    self.assertEqual(len(self.posts), before + 1)
                    self.assertNotIn("SYNTHETIC_PRIVATE_ERROR", (self.root / "failure.json").read_text())
                finally:
                    self.root = original_root

    def test_full_300_real_spool_has_no100_limit_and_no301_expansion(self):
        g=self.gen();r=self.search(g);self.assertEqual(len(self.posts),300);self.assertEqual(len(self.result_files()),300);self.assertEqual(r['budget']['total'],300)
        with self.assertRaisesRegex(ValueError,'budget exhausted'):self.generate(g,[{**self.body,'seed':4294967295}])
        self.assertEqual(len(self.posts),300)
    def test_saved137_unknown138_resumes_same_spool_with_one_explicit_paid_consent(self):
        g=self.gen(lambda _:httpx.Response(598,headers={'x-studio-network-failure':'uncertain','x-studio-network-code':'reset'}) if len(self.posts)==138 else httpx.Response(200,content=self.zip))
        with self.assertRaises(httpx.ReadError):self.search(g)
        self.assertEqual(len(self.result_files()),137);self.assertEqual(len(self.posts),138);key=self.pending()[0].stem
        original={str(p):sha(p) for p in (self.root/'spool').rglob('*') if p.is_file() and (p.suffix=='.png' or p.parent.name=='requests' or p.parent.parent.name=='results')}
        with self.assertRaises(RuntimeError):self.gen(resume=True)
        self.assertEqual(len(self.posts),138)
        auth=self.authorize(key);resumed=self.gen(resume=True,resume_authorization=auth);r=self.search(resumed)
        self.assertEqual(r['budget']['total'],300);self.assertEqual(len(self.result_files()),300);self.assertEqual(len(self.posts),301)
        self.assertTrue(all(sha(p)==h for p,h in original.items()))
        receipts=list((self.root/'spool/recovery').glob('*.json'));self.assertEqual(len(receipts),1);receipt=json.loads(receipts[0].read_text());self.assertEqual(receipt['requestHash'],key);self.assertEqual(receipt['possibleExtraPaidAttempt'],1)
    def test_137th_unknown_is_not_retried_automatically(self):
        g=self.gen(lambda _:httpx.Response(598,headers={'x-studio-network-failure':'uncertain','x-studio-network-code':'timeout'}) if len(self.posts)==137 else httpx.Response(200,content=self.zip))
        with self.assertRaises(httpx.ReadError):self.search(g)
        self.assertEqual(len(self.result_files()),136);self.assertEqual(len(self.posts),137)
        with self.assertRaises(RuntimeError):self.gen(resume=True)
        self.assertEqual(len(self.posts),137)
    def test_uncertain_sidecar_is_durable_safe_and_not429(self):
        key=self.fail_unknown();side=json.loads((self.root/'spool/transport-errors'/f'{key}.json').read_text());self.assertEqual(side['reason'],'uncertain');self.assertEqual(side['safeCode'],'reset');self.assertNotEqual(side['status'],429);self.assertTrue(side['requiresPaidReplayConfirmation'])
        self.assertEqual(side['pendingRequestHash'],key)
    def test_preconnect_exhaustion_is_durable_and_safe_manual_resume(self):
        g=self.gen(lambda _:httpx.Response(599,headers={'x-studio-network-failure':'connect','x-studio-network-code':'dns'}))
        with self.assertRaises(httpx.ConnectError):self.generate(g)
        self.assertEqual(len(self.posts),3);key=self.pending()[0].stem;side=json.loads((self.root/'spool/transport-errors'/f'{key}.json').read_text());self.assertEqual(side['reason'],'connect');self.assertFalse(side['requiresPaidReplayConfirmation'])
        self.assertEqual(len(self.generate(self.gen(resume=True))),1);self.assertEqual(len(self.posts),4);self.assertFalse(list((self.root/'spool/recovery').glob('*.json')))
    def test_malformed_authorizations_rejected_before_any_post(self):
        key=self.fail_unknown();count=len(self.posts)
        for auth in [[],{},self.authorize(key)|{'allowUncertainReplay':1},self.authorize(key)|{'requestHash':'bad'},self.authorize(key)|{'consentId':'bad'},self.authorize(key)|{'extra':True}]:
            with self.subTest(auth=auth),self.assertRaises((ValueError,RuntimeError)):self.gen(resume=True,resume_authorization=auth)
        self.assertEqual(len(self.posts),count)
    def test_authorization_requires_explicit_resume_flag(self):
        key=self.fail_unknown()
        with self.assertRaises(ValueError):self.gen(resume_authorization=self.authorize(key))
        self.assertEqual(len(self.posts),1)
    def test_wrong_request_consent_rejected_before_any_post(self):
        self.fail_unknown()
        with self.assertRaises((ValueError,RuntimeError)):self.gen(resume=True,resume_authorization=self.authorize('f'*64))
        self.assertEqual(len(self.posts),1)
    def test_consumed_consent_cannot_replay_after_second_unknown(self):
        key=self.fail_unknown();auth=self.authorize(key)
        g=self.gen(lambda _:httpx.Response(598,headers={'x-studio-network-failure':'uncertain','x-studio-network-code':'timeout'}),resume=True,resume_authorization=auth)
        with self.assertRaises(httpx.ReadError):self.generate(g)
        self.assertEqual(len(self.posts),2)
        with self.assertRaises((ValueError,RuntimeError)):self.gen(resume=True,resume_authorization=auth)
        self.assertEqual(len(self.posts),2)
        g=self.gen(resume=True,resume_authorization=self.authorize(key));self.assertEqual(len(self.generate(g)),1);self.assertEqual(len(self.posts),3);self.assertEqual(len(list((self.root/'spool/recovery').glob('*.json'))),2)
    def test_consent_is_on_disk_before_post_and_request_marker_bytes_stay(self):
        key=self.fail_unknown();marker=self.root/'spool/requests'/f'{key}.json';marker.write_bytes(b' \n'+marker.read_bytes()+b'\n ');before=marker.read_bytes();auth=self.authorize(key)
        def observed(_):
            receipt=self.root/'spool/recovery'/f'{auth["consentId"]}.json';self.assertTrue(receipt.exists());self.assertEqual(json.loads(receipt.read_text())['requestHash'],key);return httpx.Response(200,content=self.zip)
        self.generate(self.gen(observed,resume=True,resume_authorization=auth));self.assertEqual(marker.read_bytes(),before)
    def test_corrupt_cached_image_blocks_resume_before_post(self):
        self.generate(self.gen());r=json.loads(self.result_files()[0].read_text());Path(r['image']).write_bytes(b'corrupt')
        with self.assertRaises(RuntimeError):self.gen(resume=True)
        self.assertEqual(len(self.posts),1)
    def test_unknown_header_code_never_leaks_and_maps_other(self):
        g=self.gen(lambda _:httpx.Response(598,headers={'x-studio-network-failure':'uncertain','x-studio-network-code':'SYNTHETIC_SECRET_NOT_REAL'}))
        with self.assertRaises(httpx.ReadError):self.generate(g)
        side=json.loads((self.root/'spool/transport-errors'/f'{self.pending()[0].stem}.json').read_text());self.assertEqual(side['safeCode'],'other')
        self.assertNotIn('SYNTHETIC_SECRET_NOT_REAL',''.join(p.read_text() for p in self.root.rglob('*.json')))
    def test_direct_read_timeout_is_neutral_sanitized_and_uncertain(self):
        def failed(_):raise httpx.ReadTimeout('SYNTHETIC_SECRET_NOT_REAL proxy-raw-detail')
        with self.assertRaises(httpx.ReadTimeout) as caught:self.generate(self.gen(failed))
        self.assertNotIn('SYNTHETIC_SECRET_NOT_REAL',str(caught.exception));self.assertEqual(caught.exception.resume_details['reason'],'uncertain');self.assertEqual(caught.exception.resume_details['safeCode'],'timeout')
    def test_non429_http_error_remains_unresolved_not_automatically_replayed(self):
        with self.assertRaisesRegex(RuntimeError,'HTTP 503'):self.generate(self.gen(lambda _:httpx.Response(503)))
        key=self.pending()[0].stem;side=json.loads((self.root/'spool/transport-errors'/f'{key}.json').read_text());self.assertEqual(side['status'],503);self.assertTrue(side['requiresPaidReplayConfirmation'])
        with self.assertRaises(RuntimeError):self.gen(resume=True)
        self.assertEqual(len(self.posts),1)
    def test_prior_transport_diagnostic_archived_instead_of_erased(self):
        key=self.fail_unknown();old=(self.root/'spool/transport-errors'/f'{key}.json').read_bytes();self.generate(self.gen(resume=True,resume_authorization=self.authorize(key)))
        history=list((self.root/'spool/transport-history').glob('*.json'));self.assertTrue(any(p.read_bytes()==old for p in history))
    def test_incomplete_connect_sidecar_cannot_authorize_unconfirmed_replay(self):
        key=self.fail_unknown();side=self.root/'spool/transport-errors'/f'{key}.json';side.write_text(json.dumps({'reason':'connect','request_hash':key}),encoding='utf8')
        with self.assertRaises(RuntimeError):self.gen(resume=True)
        self.assertEqual(len(self.posts),1)
    def test_orphan_image_is_preserved_before_explicit_unknown_replay(self):
        key=self.fail_unknown();pending_image=self.generators[0].store.result_path(key).with_suffix('.png');pending_image.parent.mkdir(exist_ok=True,parents=True);pending_image.write_bytes(b'original incomplete image artifact')
        original=pending_image.read_bytes();self.generate(self.gen(resume=True,resume_authorization=self.authorize(key)))
        history=list((self.root/'spool/recovery-artifacts').glob('*.png'));self.assertEqual(len(history),1);self.assertEqual(history[0].read_bytes(),original)
    def test_pause_record_preserves_count_and_safe_fields(self):
        key=self.fail_unknown();side=json.loads((self.root/'spool/transport-errors'/f'{key}.json').read_text());error=httpx.ReadError('safe');error.resume_details=side
        live.record_run_failure(self.root,{'budget':300},error,[])
        f=json.loads((self.root/'failure.json').read_text());status=json.loads((self.root/'status.json').read_text());self.assertEqual(f['pendingRequestHash'],key);self.assertTrue(f['paused']);self.assertEqual(status['stage'],'paused');self.assertEqual(status['completed'],0);self.assertEqual(status['budget'],300)

    def test_pause_json_cannot_restore_redacted_message(self):
        secret='synthetic-token-fixture';g=self.gen();g.request_url='https://'+secret+'.example.invalid/ai/generate-image'
        details=g._pause('a'*64,'uncertain','reset');error=httpx.ReadError('raw '+secret);error.resume_details=details
        live.record_run_failure(self.root,{'budget':300},error,[secret])
        for name in ['failure.json','status.json']:
            text=(self.root/name).read_text();self.assertNotIn(secret,text);self.assertIn('[redacted]',text)

if __name__=='__main__':unittest.main(argv=[sys.argv[0],*_remaining],verbosity=2)
