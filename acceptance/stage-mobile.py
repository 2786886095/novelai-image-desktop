import pathlib,sys,hashlib,json,shutil,subprocess
root=pathlib.Path(sys.argv[1]).resolve();fixture=pathlib.Path(sys.argv[2]).resolve();out=pathlib.Path(sys.argv[3]).resolve();out.mkdir(parents=True,exist_ok=True)
sha=sys.argv[4];assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==sha
files={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'mobile/lib').rglob('*') if p.is_file()}
pub=root/'mobile/pubspec.yaml';original=pub.read_bytes();text=original.decode('utf-8').replace('\r\n','\n');assert '  integration_test:' not in text
assert text.count('dev_dependencies:\n')==1
staged=text.replace('dev_dependencies:\n','dev_dependencies:\n  integration_test:\n    sdk: flutter\n',1)
assert '  integration_test:\n    sdk: flutter\n' in staged
# Flutter 3.24's test driver pins platform 3.1.5, but the application already
# requires 3.1.6 through foreground_task. Keep the application's version rather
# than downgrade its production plugin; this override is test-instrumentation only.
assert 'dependency_overrides:' not in text
staged+='\ndependency_overrides:\n  platform: 3.1.6\n  file: 7.0.1\n'
pub.write_text(staged,encoding='utf-8',newline='\n')
dest=root/'mobile/integration_test/native_acceptance_test.dart';dest.parent.mkdir(exist_ok=True);shutil.copyfile(fixture,dest)
assert files=={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'mobile/lib').rglob('*') if p.is_file()}
(out/'application-lib-hashes.json').write_text(json.dumps({'sourceSha':sha,'files':files,'applicationLibUnmodified':True,'instrumentation':['mobile/pubspec.yaml integration_test SDK dev dependency; test-only override keeps production platform 3.1.6 instead of SDK driver pin 3.1.5','mobile/integration_test/native_acceptance_test.dart'],'fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest()},indent=2))
print('NATIVE_MOBILE_STAGE_APPLICATION_LIB_UNCHANGED',len(files),sha)
