// ignore_for_file: avoid_print
import 'dart:convert';
import 'package:http/io_client.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';

import 'package:crypto/crypto.dart';
import 'dart:io';
import 'package:novelai_mobile/prompts/negative_prompt_library.dart';
import 'package:novelai_mobile/ui/negative_prompt_library.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/ui_fonts.dart';
import 'package:novelai_mobile/models/ui_typography.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';

import 'package:archive/archive.dart';
import 'package:flutter/services.dart';
import 'package:novelai_mobile/images/image_processing.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';


// Public neutral CI-only key pair. Trust exactly this fixture certificate;
// never disable certificate validation or trust arbitrary upstream certificates.
const _fixtureCertificate="-----BEGIN CERTIFICATE-----\nMIIDUjCCAjqgAwIBAgIUYdnJXFnZlJkLPm0djWBqlBzgg+YwDQYJKoZIhvcNAQEL\nBQAwHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENBMB4XDTI2MTAxMTA3MjYz\nNFoXDTI3MTAxMTA3MjYzNFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkq\nhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp2jCGmt4OG1MoyoRZ1rpoE/waMnA7nze\notnpCC+EA7oaLbjmT8GdX5QgcaEMrquJN5y/vaAmflvzMiKKtqd0h+AZs4TvzQKG\nkiBu/NbBBf3n2p1qewpB/lvaeUUvnezT/TjWxahaic2LXHiOY+WhV59oO111+Cc2\n8FSzLHn/ZUOQ+nNZtI6E1s40t9tpq/6EVQmJfvtb7BIgnMlyDZfsLQ82Gs8HZAxU\nUwLdZwQZ9isySJnylTUrtuFElfRh6O/TmD8dpVmpzbiiLMTlilUe50TR2qgKFYSK\nedBRtks6d24JFBijya/STPLjSWvp4P6nvuNxOOgD/ohDdmsWJx1h9QIDAQABo4GS\nMIGPMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgWgMBMGA1UdJQQMMAoGCCsG\nAQUFBwMBMBoGA1UdEQQTMBGHBH8AAAGCCWxvY2FsaG9zdDAdBgNVHQ4EFgQUQyS8\nIEYkBSeTAhO/XUGNGd8Np/MwHwYDVR0jBBgwFoAUr0lAYXmZ+xnFcYSKQd42keRG\nH/swDQYJKoZIhvcNAQELBQADggEBAC51zZvrINl4zsFPuX0AAKMi3Ze5VCX6fYVh\nUmRdMzleI/mtB39u5k89mBJWxKa45ZP2E69wm0tTI4X20dcCNMgvEEB+6d15HhlU\n/KeSrM4ciSzyBy5ZJ+sxibR15ubtMySmtlnEuomsrdxiM2KfhYHW4fp8ptSeRE0g\nl4zLoPzqXYXScJ5kgFhwdwYV2Ms8pIKysOmQ8VFRpr1TusaT6ByhD/pG4ylsC4Tu\ncPgbTjs2/TimirBnw1ZEaj+nD90OuLuH21CJhuRy88TdY3c7FQn1C5MMDDU4mj+Q\nNO4hhCJxpk+mom5mhu1in0mZEQctJHJ4u4P88UmL+edyQrUgpl8=\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nMIIDLjCCAhagAwIBAgIUWgLilRtsr+PY4AiW2JzYYefXjDswDQYJKoZIhvcNAQEL\nBQAwHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENBMB4XDTI2MTAxMTA3MjYz\nNFoXDTM2MTAwODA3MjYzNFowHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENB\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7ugFhDN4nfWOt1urNBt6\nE3cPSioTCiN9qNBGeO08bptlRCWgbSHEWNE2PZz3lJakSpFh8GV1/ADlXYQ4bOLE\nltVx6gtx/vgQ0OslJR6g25zNj64EOjDYfLXStfrAiUbKIvw/xgsJhp33phLZgrSI\nzrQd1OIBASkDAQgvM7CgXdKb5goupi44ctugpp0xcNW061nXlgWmkSY/+jr9KGHL\nDUAo4UYvV8as76q9/WGxoNDJcdJwT6Lfwt90cKh392bTCFqitnweinr59YxzpAIl\nL+h3s+qo/RNfZGwKfYno95HtI72Ff/yt1MDjs6OX+mMpeHD7VH9QyrSGBzcPZ639\n+QIDAQABo2YwZDAdBgNVHQ4EFgQUr0lAYXmZ+xnFcYSKQd42keRGH/swHwYDVR0j\nBBgwFoAUr0lAYXmZ+xnFcYSKQd42keRGH/swEgYDVR0TAQH/BAgwBgEB/wIBADAO\nBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggEBADkxzBsh1os6SQ1Qp9+2\n7EJA5nfJliIlwtsckLeKdFHpyvhDn+z/PspgdJi6adzYLaWBQ9nukt9FAQLUvRpM\n9FdFT/GQu1OKMpEUy7rZX/ry03gyNLrLtAdCdrUUs/tADplzlAtGWGrZ6itnw9Se\nVepJZyUpOHCeyXE8NYy/D75i1qh8sA+YXipUMZ042G9ExgWZvhk98HWd/CP4FBbS\npHLAXjccb+jmri9sCBuSZiYTI0cTFIbnaO58mokI2LHemesN3nN+d1Cef62xzpok\nwYa6Fs1J7QUvdK7Dlsnd+GFx9zO0SoL4Qa1nrQsV82m9lH8QeFxT8H25ej/TYFoj\nq0U=\n-----END CERTIFICATE-----\n";
const _fixtureCa="-----BEGIN CERTIFICATE-----\nMIIDLjCCAhagAwIBAgIUWgLilRtsr+PY4AiW2JzYYefXjDswDQYJKoZIhvcNAQEL\nBQAwHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENBMB4XDTI2MTAxMTA3MjYz\nNFoXDTM2MTAwODA3MjYzNFowHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENB\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7ugFhDN4nfWOt1urNBt6\nE3cPSioTCiN9qNBGeO08bptlRCWgbSHEWNE2PZz3lJakSpFh8GV1/ADlXYQ4bOLE\nltVx6gtx/vgQ0OslJR6g25zNj64EOjDYfLXStfrAiUbKIvw/xgsJhp33phLZgrSI\nzrQd1OIBASkDAQgvM7CgXdKb5goupi44ctugpp0xcNW061nXlgWmkSY/+jr9KGHL\nDUAo4UYvV8as76q9/WGxoNDJcdJwT6Lfwt90cKh392bTCFqitnweinr59YxzpAIl\nL+h3s+qo/RNfZGwKfYno95HtI72Ff/yt1MDjs6OX+mMpeHD7VH9QyrSGBzcPZ639\n+QIDAQABo2YwZDAdBgNVHQ4EFgQUr0lAYXmZ+xnFcYSKQd42keRGH/swHwYDVR0j\nBBgwFoAUr0lAYXmZ+xnFcYSKQd42keRGH/swEgYDVR0TAQH/BAgwBgEB/wIBADAO\nBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggEBADkxzBsh1os6SQ1Qp9+2\n7EJA5nfJliIlwtsckLeKdFHpyvhDn+z/PspgdJi6adzYLaWBQ9nukt9FAQLUvRpM\n9FdFT/GQu1OKMpEUy7rZX/ry03gyNLrLtAdCdrUUs/tADplzlAtGWGrZ6itnw9Se\nVepJZyUpOHCeyXE8NYy/D75i1qh8sA+YXipUMZ042G9ExgWZvhk98HWd/CP4FBbS\npHLAXjccb+jmri9sCBuSZiYTI0cTFIbnaO58mokI2LHemesN3nN+d1Cef62xzpok\nwYa6Fs1J7QUvdK7Dlsnd+GFx9zO0SoL4Qa1nrQsV82m9lH8QeFxT8H25ej/TYFoj\nq0U=\n-----END CERTIFICATE-----\n";
const _fixturePrivateKey="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCnaMIaa3g4bUyj\nKhFnWumgT/BoycDufN6i2ekIL4QDuhotuOZPwZ1flCBxoQyuq4k3nL+9oCZ+W/My\nIoq2p3SH4BmzhO/NAoaSIG781sEF/efanWp7CkH+W9p5RS+d7NP9ONbFqFqJzYtc\neI5j5aFXn2g7XXX4JzbwVLMsef9lQ5D6c1m0joTWzjS322mr/oRVCYl++1vsEiCc\nyXINl+wtDzYazwdkDFRTAt1nBBn2KzJImfKVNSu24USV9GHo79OYPx2lWanNuKIs\nxOWKVR7nRNHaqAoVhIp50FG2Szp3bgkUGKPJr9JM8uNJa+ng/qe+43E46AP+iEN2\naxYnHWH1AgMBAAECggEABZ/Lm5seMhkb8MReStBfVnMxErgqeuiniyWSgmOkRgLH\n097pH+dTi+08TMz6Edkx9jQWLf72JBsfN8E400ubauAwxNrzunm5/ylHSUfGutaN\npkbRF7qfvnWkCJx2LdJRyelRr9jI1+XXp37mW71QdxLkK9BnQPPCUP8reNRNa/+z\n6wGb5mR2oXtRXcUZNx1lKoaDbZ3DDzOYM/dyHZBCKcy5tXYw7rj+xS9/huwqVH+K\nyRNn8AemJtIFg0zbKYdpAuGYM0THIYfnvSv3YE5NEbjdune3esm8d0qbgyWrJijp\n1760i7h5m3F5EnO71yoq1IOuHKAX0bbCX9sy9x5uCQKBgQDdzV4RpgEcFMpIHxAf\nPBzWRcar7Yb2oSDlCEhf9jBvuDjXvSQCGLQohhHw/rGlRxre+hhM+13xK2O1w+sn\n5DiIOVUeLZv/pqJF6iRayE3Au4pYsyqDxzcJyYCkz5LDwMQ+ZUU2hnrTleWKre4c\nE8wqQJCE0ah/3NAVJwqHm+Y/qQKBgQDBOHl9MU3ktZSN2s+nFJEZtPSttSC32XkM\nbM8yAbv9KWtefU4wwrv2LbSkJ3qCyrFqSRtMMiVXf/0RjxuwZVQymaXTEWzAaWpz\ngWsycolugRQ2Fctf0c8z427UbtLwaUcMVCD5lNOyMGacjCqMf3+FO8HrLQ9FIpyG\n9BETwOpvbQKBgDM0qFT2uCbdfd2snjI31Ih7T2R9z7y8cjWt9deBpKkGJMlZtyhs\nv5rjaNz0T9rSUZfMsTOEjKmS1NAvzOhGve5lHgt7iBo7RBdT+NSkjZ7DLStRIa2O\nnlw6EuL5sO5UYHnvM01lOpICdx3PDbuZrnbKtRKUvIvYVImtm7a2/S8RAoGAXbUt\n9nF6/Xiy2zlLjBSFappAMB6wB3oJIuWCdxYwPc9gqyrKSQuobPQtr48V82iqMonS\nG1oWkiEYcvOc0ifSddfefEbvH0IAxpP1kTnLPTSMwM5BG+99NgUPMyesVbw5INmM\nRH7RTJH8sd+oowsSpWMd4RixVy46C5lCzvm4uOECgYB6eWngaOApkWzLUmegQAs/\n49SSCyoJClXR7hLAOa3lIGRplU9l3UT2siIypmUbaqogHeckvy3Sx8ghKvnJcmMB\n9FtOzgftHCVUQ8vzs+xIRxZDrM9ezE8s86RxE6kPPSUhR2/tTaOiKbbHCa8LoCy+\ng1Us2E5J3tv1AwWR/Vix6w==\n-----END PRIVATE KEY-----\n";
class _LoopbackTrust extends HttpOverrides {
  @override HttpClient createHttpClient(SecurityContext? context) {
    final fixtureOnly=SecurityContext(withTrustedRoots:false)..setTrustedCertificatesBytes(utf8.encode(_fixtureCa));
    return super.createHttpClient(fixtureOnly);
  }
}
Future<HttpServer> _tlsLoopback() async {
  final context=SecurityContext()..useCertificateChainBytes(utf8.encode(_fixtureCertificate))..usePrivateKeyBytes(utf8.encode(_fixturePrivateKey));
  HttpOverrides.global=_LoopbackTrust();
  return HttpServer.bindSecure(InternetAddress.loopbackIPv4,0,context);
}
Future<bool> _serveAccountVerification(HttpRequest request) async {
  if(request.method!='GET')return false;
  expect(request.uri.path,'/user/data');expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');
  request.response.headers.contentType=ContentType.json;
  request.response.write(jsonEncode({'subscription':{'tier':3,'active':true,'trainingStepsLeft':{'fixedTrainingStepsLeft':1000000,'purchasedTrainingSteps':0}}}));
  await request.response.close();return true;
}
Future<void> _activateNeutralAccount(AppState app,int port) async {
  final url='https://127.0.0.1:$port';
  await app.addNaiAccount(label:'Neutral CI account',method:'relay',token:'neutral-nai-secret',apiBaseUrl:url,imageBaseUrl:url);
  expect(app.naiAccounts.active!.profile.imageBaseUrl,url);
  expect(await app.storage.getToken(),'neutral-nai-secret');
  expect(jsonEncode((await app.storage.getSettings()).toJson()),isNot(contains('neutral-nai-secret')));
}

// Native CI-only fresh simulator/emulator. Real plugin channels, storage and
// socket transport; neutral fixtures, no production endpoint and no paid call.
void result(String name,List<String> features) => print('NATIVE_MOBILE_CASE:${jsonEncode({'name':name,'features':features,'pass':true,'platform':Platform.isAndroid?'android':'ios','sourceSha':const String.fromEnvironment('ACCEPTANCE_SOURCE_SHA'),'paidCalls':0})}');
HistoryItem row(String id,String file)=>HistoryItem(id:id,filePath:file,date:'2026-10-11',createdAt:'2026-10-11',seed:123,model:'fixture',width:32,height:32,prompt:'blue square');
// Public CI-only certificate and key; no production credential.
const _flowCertificate="-----BEGIN CERTIFICATE-----\nMIIDyDCCArCgAwIBAgIUV6d3zASDfxQiKD+/xBo4BmStYCUwDQYJKoZIhvcNAQEL\nBQAwKTEnMCUGA1UEAwweTmV1dHJhbCBOYXRpdmUgRmxvdyBDSSBGaXh0dXJlMB4X\nDTI2MTAxMTExMTgxNVoXDTM2MTAwODExMTgxNVowKTEnMCUGA1UEAwweTmV1dHJh\nbCBOYXRpdmUgRmxvdyBDSSBGaXh0dXJlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\nMIIBCgKCAQEAjBWha2q2xtYstuaFKi4ucanGQ5yZHMOvrVrzJh5hHLxenGdFZSmD\n4rrsu65pFvNV40AQOb3IqDIYPx9nJnpBsxgq+Jfu3LUrBL5a+61afUvPZuhOQd9+\njs/TjoIPTKzgjtbLZH1JqX9+gtZcOHX2EXpzMU3Xsfit5+tXPGCQZ20Cpq7qkaFl\nLRWAtyZc5GLB5gdBjpDThC3JHsV9+rWz60fN6M46zBCcKzxQiSwulP+7Pb5iIiP+\nHKOP7XlntjYB6Q74kcwQAI33/V/XY6378kFUJZbVoZybA+fOKn4bgaWy2uCtLHaO\nYabxxOOYlYYp8MC3vsN+UtVHZKp0sV13lwIDAQABo4HnMIHkMB0GA1UdDgQWBBRP\nR4B+80Fx8ObcqIfcms2iqoVTUjAfBgNVHSMEGDAWgBRPR4B+80Fx8ObcqIfcms2i\nqoVTUjCBkAYDVR0RBIGIMIGFghh0cmFuc2xhdGUuZ29vZ2xlYXBpcy5jb22CE2Zh\nbnlpLWFwaS5iYWlkdS5jb22CEmRhbmJvb3J1LmRvbm1haS51c4ITc2FmZWJvb3J1\nLmRvbm1haS51c4IKZ2l0aHViLmNvbYIOYXBpLmdpdGh1Yi5jb22CCWxvY2FsaG9z\ndIcEfwAAATAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCKHRye\naXmVnaw0G2CkE1x+L8ZOa+B2ti3U7WpxjkWp1tT+c8NPdAXyMIDtJKSF0Sq7A27V\n5VA2NF84083ZAPLl3qOEoJ2eEq6Q2vgcRXBOjplRaE9nshLAIt6T6W0DRgsN5TiA\nxeRi6C7X7GkF434mNQACnCZeeMDeKrSQXThMvVZ4pWU7u5OTZpz0K7a2lOy2o3cn\nOBK9v/lP3smU83//i99N0bg40XZRGE3n3JfDqNfof+vJ0XwG5jO0Zxm1+pCZyPOu\ntHl+demEZX29uWxZIuKO9uoxnTb76AqKQ6xwJC4Wc2pvumKWVEgo+2P9VsT0X8Gv\nS8I+H9fNlkWxI5Cm\n-----END CERTIFICATE-----\n";
const _flowPrivateKey="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCMFaFrarbG1iy2\n5oUqLi5xqcZDnJkcw6+tWvMmHmEcvF6cZ0VlKYPiuuy7rmkW81XjQBA5vcioMhg/\nH2cmekGzGCr4l+7ctSsEvlr7rVp9S89m6E5B336Oz9OOgg9MrOCO1stkfUmpf36C\n1lw4dfYRenMxTdex+K3n61c8YJBnbQKmruqRoWUtFYC3JlzkYsHmB0GOkNOELcke\nxX36tbPrR83ozjrMEJwrPFCJLC6U/7s9vmIiI/4co4/teWe2NgHpDviRzBAAjff9\nX9djrfvyQVQlltWhnJsD584qfhuBpbLa4K0sdo5hpvHE45iVhinwwLe+w35S1Udk\nqnSxXXeXAgMBAAECggEAE29i1FjbX+3SCVQlMIt0tR9VWwcMdSGvK3F9X5ICbi6y\nP6fSSG1Al4HQm19gxCbhiSRXu/MZNkCw/Xz5XizDFbpqJ9BIewWFoORaEiXkcpLE\nhSYAyYHc+Kpb0x83SS+I/jhNwrThNety3WspI0o2aAlhlvsSTGZQlmcf1Mge8MJJ\n819SKs3MRQtFJ1SCQWZcc8MgVpFBHj2y0vQObzV+GbflvbK5EqDVnBER+ZNTaKB8\nSGWxTlveiO1ng6QPj0N/w+e0tzCRP2OrFfJJu2vX8l32BFdrzjMJpjgtDHxImdsk\nl31VsppQr37kySxFqsk/iyd5toFVGO4xIxULNqOReQKBgQDDjyNBtUZyiUvJIXX9\nMofYEuZ6ZceHxHqsIX05oDfj9uBkBMxwvy80yiYPQaBTrjvpbbAuyPHA6B9tJznk\njn8sAjuBAIj1Pm7+Uq5pIoFgT6SqauR3BgBXhTXuqqERhK8tcY+w00IJ3Eu5Qtjy\njjeGdjAbSqx/bRQWHAbcF9BhyQKBgQC3YUaqHDKn5Hy4tUY9qGfj1ppc4e50kuVh\n3dKGkRYQ9XW3scseWc2BbOvLxSpwYMck+Na6t3C/D+Nbod6gBN7ipQATS8usJv0p\nZoTl/gIY9iosdXcVvTfITyju7ITBoCvKwOxFD4l7Rv2Y4YOJb3ghQA7gVf2joBrd\nUU5Dica+XwKBgQC0ezIKvoZZxqSO57bBCxWcMTVM2QohHxAoNHAh8uAiIAJPzK3x\nkEC886PUiLizAiaA9J6ZTxLu+kumrYEckvaDYzwPfrLnw8skJKKanSHSBS7vqN9Z\nicxe+a4gqpEkXdRemGQIybA08X9hZ3RZxy8vhXw4c95nbAARt6QNFF1ZIQKBgCXE\nIeJ8xi3vj4QWyS1/lk3E76t7WDmn2xfJsEbIcIvzkVfQhO1uPzWNcg5YP8I/HCRQ\nHyD7EHw40HEZqBi6iBCTPK28qWh96xtwoqQfKN1tLQhU9L6EZo2ZR+vUyA58Zyht\njPs4FO9PkoC+yPEwBMSMRcQL0Z22JnI4AW9FW6nvAoGBAJRATHfUWINrS2Zq8pge\nHt5lGKuQHav0ixB967yicsB1isTRJfgnkRiaHzWoqHlsymIpsY+sTGKYjzpZAjsn\nVUIcUgoB3F9wHSzhEvVMN67lKk1tClIp5Jpj/EDz97IFRBrrdewiEQpLeTXdBsVX\nlvl/SWmHrz0hpr5WnqFPbwPA\n-----END PRIVATE KEY-----\n";
class _RoutedFlowTrust extends HttpOverrides {
 final int port;_RoutedFlowTrust(this.port);
 @override HttpClient createHttpClient(SecurityContext? _) {
  final context=SecurityContext(withTrustedRoots:false)..setTrustedCertificatesBytes(utf8.encode(_flowCertificate));
  return super.createHttpClient(context)..connectionFactory=(uri,proxyHost,proxyPort){
   if(!{'translate.googleapis.com','fanyi-api.baidu.com','danbooru.donmai.us','safebooru.donmai.us','github.com','api.github.com','127.0.0.1','localhost'}.contains(uri.host))throw StateError('Unexpected paid or production host: ${uri.host}');
   return Socket.startConnect(InternetAddress.loopbackIPv4,port).then((task)=>ConnectionTask.fromSocket(task.socket.then((socket)=>SecureSocket.secure(socket,host:uri.host,context:context)),task.cancel));
  };
 }
}
Future<HttpServer> _flowLoopback() async {
 final context=SecurityContext()..useCertificateChainBytes(utf8.encode(_flowCertificate))..usePrivateKeyBytes(utf8.encode(_flowPrivateKey));
 final server=await HttpServer.bindSecure(InternetAddress.loopbackIPv4,0,context);HttpOverrides.global=_RoutedFlowTrust(server.port);return server;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  late Storage storage;late AppState app;late Directory root;late File source,mask;
  final servers=<HttpServer>[];
  setUp(() async {
    HttpOverrides.global=null;UnifiedStorage.active=null;
    final prefs=await SharedPreferences.getInstance();await prefs.clear();
    await const FlutterSecureStorage().deleteAll();
    root=await Directory((await getTemporaryDirectory()).path).createTemp('native-acceptance-');
    final accounts=NovelAiAccounts();storage=NovelAiAccountStorage(accounts);await (storage as NovelAiAccountStorage).ready();app=AppState(api:NovelAiAccountApi(accounts),storage:storage,preloadCompletedImage:(_) async {})..settings=AppSettings(proxyMode:'direct',saveToGallery:false);
    await storage.setSettings(app.settings);await storage.writeHistory([]);await storage.writeGroups([]);
    final image=im.Image(width:32,height:32,numChannels:4);im.fill(image,color:im.ColorRgba8(220,30,30,255));
    image.textData={'Comment':jsonEncode({'prompt':'blue square','seed':123})};
    source=File('${root.path}/source.png');await source.writeAsBytes(im.encodePng(image));
    final selected=im.Image(width:32,height:32,numChannels:4);im.fillRect(selected,x1:12,y1:12,x2:19,y2:19,color:im.ColorRgba8(255,255,255,255));
    mask=File('${root.path}/mask.png');await mask.writeAsBytes(im.encodePng(selected));
  });
  tearDown(() async {
    app.dispose();for(final server in servers){await server.close(force:true);}servers.clear();
    await Future<void>.delayed(const Duration(milliseconds:50));if(await root.exists())await root.delete(recursive:true);
  });
  testWidgets('real secure storage and preferences survive reopening', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Native acceptance'))));
    final docs=await getApplicationDocumentsDirectory();expect(await docs.exists(),true);
    await app.saveOpenAIEditSettings({'baseUrl':'https://example.test/v1','model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'neutral-fixture-secret','');
    final fresh=await Storage().getSettings();final id=fresh.openAIEdit['credentialId'] as String;
    expect(id,isNotEmpty);expect(await Storage().getOpenAIEditKey(id),'neutral-fixture-secret');
    expect(jsonEncode(fresh.toJson()),isNot(contains('neutral-fixture-secret')));expect(fresh.imageProvider,'novelai');
    await app.setAutomaticComparison('inpaint',false);expect((await Storage().getSettings()).automaticComparison['inpaint'],false);
    result('Real native credential/preferences/path-provider readback',['accounts','settings','openai-inpaint','output-management']);
  });
  for(final status in [200,422]) {
    testWidgets('real OpenAI AppState multipart $status submits once', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral edit'))));
      var posts=0;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);
      server.listen((request) async {
        expect(request.method,'POST');expect(request.uri.path,'/v1/images/edits');posts++;
        expect(request.headers.value('authorization'),'Bearer neutral-edit-secret');
        await request.drain<void>();request.response.statusCode=status;
        final image=im.Image(width:32,height:32);im.fill(image,color:im.ColorRgb8(0,0,255));
        request.response.write(status==200?jsonEncode({'data':[{'b64_json':base64Encode(im.encodePng(image))}]}):'fixture rejected');await request.response.close();
      });
      await app.saveOpenAIEditSettings({'baseUrl':'http://127.0.0.1:${server.port}/v1','model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'neutral-edit-secret','');
      app.inpaintEngine='openai';app.inpaintSourceMode='latest';app.inpaintPositivePrompt='blue square';await app.setWorkbenchPath(source.path);
      await app.inpaint(await mask.readAsBytes());expect(posts,1);expect(app.busy,false);expect(app.history.length,status==200?1:0);
      if(status==200) {final saved=im.decodePng(await File(app.history.single.filePath).readAsBytes())!;
        expect([saved.getPixel(0,0).r,saved.getPixel(0,0).g,saved.getPixel(0,0).b],[220,30,30]);
        // Default production compositor deliberately feathers/matches seams;
        // pure blue is not the specified result for this small selected region.
        final center=saved.getPixel(15,15);
        expect(saved.width,32);expect(saved.height,32);
        expect(center.r,lessThan(40));expect(center.g,lessThan(40));expect(center.b,greaterThan(200));expect(center.a,255);
        for(final xy in [[0,31],[31,0],[31,31]]) {
          final corner=saved.getPixel(xy[0],xy[1]);expect([corner.r,corner.g,corner.b],[220,30,30]);
        }
        print('NATIVE_COMPOSITE_PIXELS:${jsonEncode({'center':[center.r,center.g,center.b],'cornersUnchanged':true})}');
        expect(app.history.single.feature,'openai-inpaint');expect(jsonEncode(app.history.single.toJson()),isNot(contains('neutral-edit-secret')));
      }
      result('OpenAI real AppState multipart status $status',['openai-inpaint','inpaint','works']);
    });
  }
  testWidgets('real file deletion/move/reconcile across Storage instances', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral works'))));
    final images=await storage.imagesDir(),a=File('${images.path}/acceptance-a.png'),b=File('${images.path}/acceptance-b.png');
    await a.writeAsBytes(await source.readAsBytes());await b.writeAsBytes(await source.readAsBytes());
    await storage.writeGroups(const [HistoryGroup(id:'native-group',name:'Group',createdAt:'2026-10-11')]);
    await storage.writeHistory([row('a',a.path),row('b',b.path),row('external',source.path)]);app.history=await storage.getHistory();app.groups=await storage.getGroups();
    final other=Storage();expect((await other.getHistory()).length,3);
    await app.moveHistoryItems({'a','b'},'native-group');expect((await other.getHistory()).take(2).every((h)=>h.groupId=='native-group'),true);
    await app.setWorkbenchPath(a.path);await app.deleteHistoryItems({'a','external'});expect(await a.exists(),false);expect(await source.exists(),true);expect(app.workbenchImage,isNull);
    await b.delete();app.booted=true;await app.reconcileMissingHistory();expect(app.history,isEmpty);expect(await other.getHistory(),isEmpty);
    result('Actual native filesystem/group/index/cache transaction',['works','works-batch-edit','missing-file-reconciliation','output-management']);
  });
  testWidgets('real authenticated loopback MCP rejects unauthenticated callers', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral MCP'))));
    expect(app.externalMcp.server,isNull);await app.externalMcp.toggle();final server=app.externalMcp.server!;final client=HttpClient();
    try {
      final bad=await client.postUrl(Uri.parse(server.url));bad.headers.contentType=ContentType.json;bad.write('{}');final denied=await bad.close();await denied.drain<void>();expect(denied.statusCode,403);
      final request=await client.postUrl(Uri.parse(server.url));request.headers.contentType=ContentType.json;request.headers.set('authorization','Bearer ${server.token}');
      request.write(jsonEncode({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26'}}));final response=await request.close();expect(response.statusCode,200);
      final reply=jsonDecode(await utf8.decoder.bind(response).join());expect(reply['result']['serverInfo']['version'],appVersion);
    } finally {client.close(force:true);await app.externalMcp.toggle();}
    expect(app.externalMcp.server,isNull);result('Native loopback MCP authentication/lifecycle',['external-mcp-server','settings']);
  });
  testWidgets('actual records expand and scroll past long first entry', (tester) async {
    final text=List.generate(100,(i)=>'Neutral blue square record line $i').join('\n');
    // Populate the read-only log through the real public API and transport.
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);var posts=0;
    server.listen((request) async {
      expect(request.method,'POST');expect(request.uri.path,'/v1/chat/completions');posts++;
      await request.drain<void>();request.response.headers.contentType=ContentType.json;
      request.response.write(jsonEncode({'choices':[{'message':{'content':text}}]}));await request.response.close();
    });
    for(var i=0;i<24;i++) {
      final response=await app.api.runTextAi(settings:app.settings,apiKey:'neutral-log-secret',apiUrl:'http://127.0.0.1:${server.port}/v1',model:'fixture',system:text,user:text,label:'Neutral record $i');
      expect(response.ok,true);
    }
    expect(posts,24);expect(app.aiCallLog.length,24);expect(app.aiCallLog.first.label,'Neutral record 23');
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:AiLogScreen())));await tester.pumpAndSettle();
    await tester.tap(find.text('Neutral record 23'));await tester.pumpAndSettle();
    final list=find.byType(ListView).first;final scrollable=find.descendant(of:list,matching:find.byType(Scrollable)).first;
    final before=tester.state<ScrollableState>(scrollable).position.pixels;await tester.drag(list,const Offset(0,-500));await tester.pumpAndSettle();
    expect(tester.state<ScrollableState>(scrollable).position.pixels,greaterThan(before));expect(tester.takeException(),isNull);
    result('Native renderer expanded records scroll',['ai-records']);
  });
  testWidgets('real core screens fit portrait/landscape at 200 percent text', (tester) async {
    for(final size in [const Size(390,844),const Size(844,390),const Size(1024,768)]) {
      await tester.binding.setSurfaceSize(size);
      for(final screen in [const GalleryScreen(),const GenerateScreen(),const ToolsScreen(kind:ToolPageKind.inpaint)]) {
        await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:MediaQuery(data:MediaQueryData(size:size,textScaler:const TextScaler.linear(2)),child:screen))));
        await tester.pumpAndSettle();expect(tester.takeException(),isNull,reason:'$size ${screen.runtimeType}');
        if(screen is GalleryScreen) {await tester.tap(find.byKey(const ValueKey('works-batch-edit')));await tester.pumpAndSettle();expect(tester.takeException(),isNull);}
        await tester.pumpWidget(const SizedBox.shrink());
      }
    }
    await tester.binding.setSurfaceSize(null);result('Native device core-screen responsive text 200 percent',['typography','works-batch-edit','generation','inpaint']);
  });

  // Backend -> native file/index readback with the production transport.
  // All endpoints are localhost, never a provider and never a paid call.
  for(final scenario in ['high','medium','503','401']) {
    testWidgets('native NovelAI generation $scenario', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native generation'))));
      var posts=0;final server=await _tlsLoopback();servers.add(server);
      final status=int.tryParse(scenario)??200;Map<String,dynamic>? requestBody;
      final generated=im.Image(width:64,height:64);im.fill(generated,color:im.ColorRgb8(0,0,255));
      final png=im.encodePng(generated),zip=ZipEncoder().encode(Archive()..addFile(ArchiveFile('image.png',png.length,png)));
      server.listen((request) async {
        if(await _serveAccountVerification(request))return;
        posts++;expect(request.uri.path,'/ai/generate-image');expect(request.method,'POST');
        expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');
        requestBody=jsonDecode(await utf8.decoder.bind(request).join()) as Map<String,dynamic>;
        request.response.statusCode=status;
        if(status==200){request.response.headers.set('content-type','application/zip');request.response.add(zip);}
        else{request.response.write('fixture HTTP $status');}
        await request.response.close();
      });
      await _activateNeutralAccount(app,server.port);app.settings.streamPreviewEnabled=false;
      final params=GenerateParams(positivePrompt:'blue square',width:64,height:64,seed:4000000000,seedMode:'fixed',effort:scenario=='medium'?'medium':'high');
      var succeeded=false;
      try {
        final output=await app.api.generate('neutral-nai-secret',app.settings,params,GenerateExtras());
        succeeded=true;expect(output.$1.length,1);expect(output.$2,4000000000);
        final item=await storage.saveImage(output.$1.single,params,output.$2);
        expect(await File(item.filePath).readAsBytes(),png);expect((await Storage().getHistory()).length,1);
      } catch(error) {if(status==200)rethrow;}
      expect(succeeded,status==200);expect(posts,1);expect(requestBody!['model'],scenario=='medium'?'nai-diffusion-5-full-medium':'nai-diffusion-5-full');
      expect((requestBody!['parameters'] as Map)['seed'],4000000000);expect((requestBody!['parameters'] as Map)['n_samples'],1);
      if(status!=200)expect(await storage.getHistory(),isEmpty);
      result('Native NovelAI generation $scenario',['generation','effort','output-management','works','accounts']);
    });
  }
  for(final action in ['img2img','inpaint','colorize','upscale']) {
    testWidgets('native image action $action', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native image action'))));
      var posts=0;final server=await _tlsLoopback();servers.add(server);
      Map<String,dynamic>? requestBody;
      final side=action=='inpaint'?256:64;final generated=im.Image(width:side,height:side);im.fill(generated,color:im.ColorRgb8(0,0,255));
      final png=im.encodePng(generated),zip=ZipEncoder().encode(Archive()..addFile(ArchiveFile('image.png',png.length,png)));
      server.listen((request) async {
        if(await _serveAccountVerification(request))return;
        posts++;expect(request.method,'POST');expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');
        expect(request.uri.path,action=='colorize'?'/ai/augment-image':action=='upscale'?'/ai/upscale':'/ai/generate-image');
        requestBody=jsonDecode(await utf8.decoder.bind(request).join()) as Map<String,dynamic>;
        request.response.headers.set('content-type','application/zip');request.response.add(zip);await request.response.close();
      });
      await _activateNeutralAccount(app,server.port);app.settings.streamPreviewEnabled=false;
      final params=GenerateParams(positivePrompt:'blue square',width:side,height:side,seed:123,seedMode:'fixed'),input=await source.readAsBytes();
      late Uint8List output;
      if(action=='img2img'){
        final r=await app.api.img2img('neutral-nai-secret',app.settings,params,GenerateExtras(),input,I2IParams());output=r.$1.single;
        expect(requestBody!['action'],'img2img');expect((requestBody!['parameters'] as Map)['image'],isNotEmpty);
      }else if(action=='inpaint'){
        final r=await app.api.inpaint('neutral-nai-secret',app.settings,params,input,await mask.readAsBytes(),'nai-diffusion-5-full-inpainting',32,32,1,0);output=r.$1.single;
        expect(requestBody!['action'],'infill');expect((requestBody!['parameters'] as Map)['mask'],isNotEmpty);
        // The official default expands by 4 latent cells (32px) and
        // blurs twice by 20px. A 64px fixture has no outside corner at all.
        // Use 256px so these corners are genuinely outside the blended region.
        final decoded=im.decodePng(output)!;expect([decoded.width,decoded.height],[256,256]);
        for(final xy in [[0,0],[255,0],[0,255],[255,255]]) {
          final corner=decoded.getPixel(xy[0],xy[1]);expect([corner.r,corner.g,corner.b],[220,30,30]);
        }
        expect(decoded.getPixel(128,128).b,greaterThan(200));
      }else if(action=='colorize'){
        output=(await app.api.augment('neutral-nai-secret',app.settings,input,32,32,'colorize',AugmentOptions())).single;
        expect(requestBody!['req_type'],'colorize');expect(requestBody!['image'],isNotEmpty);
      }else{
        output=await app.api.upscale('neutral-nai-secret',app.settings,input,2,'nai-diffusion-5-full');
        final decoded=im.decodePng(output)!;expect([decoded.width,decoded.height],[64,64]);
      }
      expect(posts,1);final item=await storage.saveImage(output,params,123,feature:action);
      expect(await File(item.filePath).readAsBytes(),output);expect((await Storage().getHistory()).single.feature,action);
      result('Native image action $action',[action=='img2img'?'image-to-image':action=='inpaint'?'inpaint':'postprocess','works']);
    });
  }
  for(final kind in ['convert','reverse']) {
    for(final status in [200,401]) {
      testWidgets('native cold $kind $status', (tester) async {
        await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native text AI'))));
        var posts=0;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);
        const answer='A blue square lies in the middle of a red background.';
        server.listen((request) async {
          posts++;expect(request.method,'POST');expect(request.uri.path,'/v1/chat/completions');
          expect(request.headers.value('authorization'),'Bearer neutral-text-secret');
          final body=jsonDecode(await utf8.decoder.bind(request).join()) as Map;
          expect(body['model'],'fixture');
          if(kind=='reverse')expect(jsonEncode(body['messages']),contains('data:image/png;base64,'));
          request.response.statusCode=status;request.response.headers.contentType=ContentType.json;
          request.response.write(status==200?jsonEncode({'choices':[{'message':{'content':answer},'finish_reason':'stop'}]}):jsonEncode({'error':{'message':'fixture unauthorized'}}));await request.response.close();
        });
        final settings=AppSettings(proxyMode:'direct',saveToGallery:false,convertApiUrl:'http://127.0.0.1:${server.port}/v1',visionApiUrl:'http://127.0.0.1:${server.port}/v1',convertApiModel:'fixture',visionApiModel:'fixture',promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false,reverseConvertDshEnabled:false,tagServerEnabled:false);
        final response=kind=='convert'
          ?await app.api.convertPrompt(settings:settings,apiKey:'neutral-text-secret',text:'A blue square',mode:ReversePromptMode.natural,knownCharacter:false,systemTemplate:'Describe the neutral shape.')
          :await app.api.reversePrompt(settings:settings,apiKey:'neutral-text-secret',image:await source.readAsBytes(),mode:ReversePromptMode.natural,scope:ReversePromptScope.full,hint:'Describe the neutral shape.',knownCharacter:false,systemTemplate:'Describe the neutral shape.');
        expect(response.ok,status==200);expect(posts,1);expect(app.aiCallLog.length,1);expect(app.aiCallLog.single.ok,status==200);
        if(status==200){expect(response.text,answer);}else{expect(response.message,contains('401'));}
        result('Native cold $kind $status',[kind,'ai-records']);
      });
    }
  }
  final webps=<String,String>{'lossy':'UklGRlQAAABXRUJQVlA4IEgAAABwBACdASpgAEAAPm02mUmkIyKhIWgAgA2JaQB2APwAABZkSKC7NmzZs2bNEAD+7c7f//nEsdTu7s///mCRuq/fb0odUoAAAAA=','lossless':'UklGRiQAAABXRUJQVlA4TBcAAAAvX8APAAfQtnI0uP8BICH8ny9F9D/1BwA=','alpha':'UklGRiQAAABXRUJQVlA4TBcAAAAvX8APEAfQtnI0uFkBICH8ny9F9D/1BwA=','animated':'UklGRpQAAABXRUJQVlA4WAoAAAACAAAAXwAAPwAAQU5JTQYAAAD/////AABBTk1GMAAAAAAAAAAAAF8AAD8AAGQAAAJWUDhMFwAAAC9fwA8AB1C8otSo/wEgIfyfL0X0P/UHAEFOTUYwAAAAAAAAAAAAXwAAPwAAZAAAAFZQOEwXAAAAL1/ADwAHULz61qj/ASAh/J8vRfQ/9QcA','novelai-exif-v5':'UklGRgoDAABXRUJQVlA4WAoAAAAIAAAAXwAAPwAAVlA4TBcAAAAvX8APAAfQuyZVtv8BICH8ny9F9D/1BwBKVU5LAwAAAG9kZABFWElGvwIAAElJKgAIAAAABgANAQIAGAAAAGgAAAAOAQIAEAAAAIAAAAAxAQIAGgAAAJAAAAA7AQIACAAAAKoAAACYggIALgAAALIAAABphwQAAQAAAFYAAAAAAAAAAQCGkgcA3wEAAOAAAAAAAAAATm92ZWxBSSBnZW5lcmF0ZWQgaW1hZ2UAMWdpcmwsIGJsdWUgc2t5AE5vdmVsQUkgRGlmZnVzaW9uIFY1IEZ1bGwATm92ZWxBSQBGaXh0dXJlIG9ubHk7IG5vdCBhbiBvZmZpY2lhbCBnZW5lcmF0ZWQgaW1hZ2UAQVNDSUkAAAB7InByb21wdCI6IjFnaXJsLCBibHVlIHNreSIsInVjIjoibG93cmVzLCBiYWQgaGFuZHMiLCJtb2RlbCI6Im5haS1kaWZmdXNpb24tNS1mdWxsIiwic2VlZCI6NDAwMDAwMDAwMCwic3RlcHMiOjI4LCJzY2FsZSI6Niwid2lkdGgiOjk2LCJoZWlnaHQiOjY0LCJzYW1wbGVyIjoia19ldWxlcl9hbmNlc3RyYWwiLCJlZmZvcnQiOiJoaWdoIiwidjRfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoiMWdpcmwsIGJsdWUgc2t5IiwiY2hhcl9jYXB0aW9ucyI6W3siY2hhcl9jYXB0aW9uIjoiZ2lybCwgYmx1ZSBoYWlyIiwiY2VudGVycyI6W3sieCI6MC4yNSwieSI6MC43NX1dfV19LCJ1c2VfY29vcmRzIjp0cnVlfSwidjRfbmVnYXRpdmVfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoibG93cmVzLCBiYWQgaGFuZHMiLCJjaGFyX2NhcHRpb25zIjpbeyJjaGFyX2NhcHRpb24iOiJiYWQgZmFjZSJ9XX19fQAA','novelai-exif-v5-be':'UklGRhADAABXRUJQVlA4WAoAAAAIAAAAXwAAPwAAVlA4TBcAAAAvX8APAAfQuyZVtv8BICH8ny9F9D/1BwBKVU5LAwAAAG9kZABFWElGxQIAAEV4aWYAAE1NACoAAAAIAAYBDQACAAAAGAAAAGgBDgACAAAAEAAAAIABMQACAAAAGgAAAJABOwACAAAACAAAAKqCmAACAAAALgAAALKHaQAEAAAAAQAAAFYAAAAAAAGShgAHAAAB3wAAAOAAAAAATm92ZWxBSSBnZW5lcmF0ZWQgaW1hZ2UAMWdpcmwsIGJsdWUgc2t5AE5vdmVsQUkgRGlmZnVzaW9uIFY1IEZ1bGwATm92ZWxBSQBGaXh0dXJlIG9ubHk7IG5vdCBhbiBvZmZpY2lhbCBnZW5lcmF0ZWQgaW1hZ2UAQVNDSUkAAAB7InByb21wdCI6IjFnaXJsLCBibHVlIHNreSIsInVjIjoibG93cmVzLCBiYWQgaGFuZHMiLCJtb2RlbCI6Im5haS1kaWZmdXNpb24tNS1mdWxsIiwic2VlZCI6NDAwMDAwMDAwMCwic3RlcHMiOjI4LCJzY2FsZSI6Niwid2lkdGgiOjk2LCJoZWlnaHQiOjY0LCJzYW1wbGVyIjoia19ldWxlcl9hbmNlc3RyYWwiLCJlZmZvcnQiOiJoaWdoIiwidjRfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoiMWdpcmwsIGJsdWUgc2t5IiwiY2hhcl9jYXB0aW9ucyI6W3siY2hhcl9jYXB0aW9uIjoiZ2lybCwgYmx1ZSBoYWlyIiwiY2VudGVycyI6W3sieCI6MC4yNSwieSI6MC43NX1dfV19LCJ1c2VfY29vcmRzIjp0cnVlfSwidjRfbmVnYXRpdmVfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoibG93cmVzLCBiYWQgaGFuZHMiLCJjaGFyX2NhcHRpb25zIjpbeyJjaGFyX2NhcHRpb24iOiJiYWQgZmFjZSJ9XX19fQAA'};
  for(final name in webps.keys) {
    testWidgets('native WebP $name decode and workbench import', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native WebP'))));
      final bytes=base64Decode(webps[name]!),file=File('${root.path}/$name.webp');await file.writeAsBytes(bytes);
      await app.setWorkbenchPath(file.path);expect(app.workbenchImage,isNotNull);
      final png=await processingImageBytes(bytes),decoded=im.decodePng(png)!;
      expect([decoded.width,decoded.height],[96,64]);expect(decoded.numFrames,1);expect(await file.readAsBytes(),bytes);
      expect([app.workbenchImage!.width,app.workbenchImage!.height],[96,64]);
      if(name=='alpha')expect(decoded.getPixel(20,20).a,lessThan(255));
      if(name.startsWith('novelai-exif')) {
        expect(app.workbenchImportedParams!.positivePrompt,'1girl, blue sky');expect(app.workbenchImportedParams!.seed,4000000000);
        expect(app.workbenchCharacterCaptions.single.prompt,'girl, blue hair');
      }
      result('Native WebP $name',['metadata-import','tools']);
    });
  }
  testWidgets('real native clipboard text roundtrip', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native clipboard'))));
    await Clipboard.setData(const ClipboardData(text:'neutral-native-clipboard-fixture'));
    expect((await Clipboard.getData(Clipboard.kTextPlain))!.text,'neutral-native-clipboard-fixture');
    result('Native clipboard text roundtrip',['clipboard']);
  });

  testWidgets('native breadth negative library cold writes and exact archive', (tester) async {
    expect(app.settings.negativePromptPresets,negativeBuiltins);
    await Future.wait([
      app.mutateNegativePresets((old)=>old.map((p)=>p['id']==negativeBuiltins.first['id']?{...p,'name':'Neutral renamed'}:p).toList()),
      app.mutateNegativePresets((old)=>[...old,{'id':'neutral','name':'Neutral custom','prompt':'bad geometry','createdAt':'2026-10-11'}])
    ]);
    final cold=await Storage().getSettings();expect(cold.negativePromptPresets.length,3);expect(cold.negativePromptPresets.first['name'],'Neutral renamed');
    expect(parseNegativeLibrary(exportNegativeLibrary(cold.negativePromptPresets)),cold.negativePromptPresets);
    expect(()=>parseNegativeLibrary('{}'),throwsFormatException);
    await app.mutateNegativePresets((_)=>[]);expect((await Storage().getSettings()).negativePromptPresets,isEmpty);
    result('Native negative library cold CRUD and exact export',['negative-prompts','settings']);
  });
  testWidgets('native breadth negative preview search and append', (tester) async {
    app.settings.language='zh-CN';app.params.positivePrompt='keep-neutral-positive';String value='original';
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:Scaffold(body:SafeArea(child:NegativePromptLibraryButton(value:value,onApply:(prompt,mode)=>value=applyNegativePreset(value,prompt,mode)))))));
    await tester.ensureVisible(find.byTooltip('负面提示词库'));await tester.tap(find.byTooltip('负面提示词库').hitTestable());await tester.pumpAndSettle();expect(value,'original');expect(find.text('强化版'),findsWidgets);
    await tester.enterText(find.byType(TextField).first,'轻量版');await tester.pumpAndSettle();final tile=find.widgetWithText(ListTile,'轻量版');await tester.ensureVisible(tile);await tester.tap(find.descendant(of:tile,matching:find.text('轻量版')));await tester.pumpAndSettle();
    final append=find.text('追加');await tester.ensureVisible(append);await tester.tap(append);await tester.pumpAndSettle();expect(value,'original, ${negativeBuiltins[1]['prompt']}');expect(app.params.positivePrompt,'keep-neutral-positive');expect(tester.takeException(),isNull);
    result('Native negative preview search and explicit append',['negative-prompts','navigation']);
  });
  testWidgets('native breadth named characters and positive style persistence', (tester) async {
    final character=CharCaptionItem(name:'Neutral character',prompt:' blue coat ',negativePrompt:'red coat',x:0,y:1,useCoords:true);
    await storage.setCharacterPrompts([character]);expect((await Storage().getCharacterPrompts()).single.toJson(),character.toJson());
    app.settings.positivePromptPresets=[PositivePromptPreset(id:'positive',name:'Neutral positive',prompt:' blue square ',createdAt:'now',captions:[character])];
    app.settings.stylePromptPresets=[StylePromptPreset(id:'style',name:'Neutral style',prompt:' graphic ',group:'Neutral',createdAt:'now')];
    await storage.setSettings(app.settings);await app.renameStylePromptPreset('style',' Renamed style ');
    final cold=await Storage().getSettings();expect(cold.positivePromptPresets.single.prompt,' blue square ');expect(cold.positivePromptPresets.single.captions.single.name,'Neutral character');expect(cold.stylePromptPresets.single.name,'Renamed style');expect(cold.stylePromptPresets.single.prompt,' graphic ');
    await storage.setCharacterPrompts([]);expect(await Storage().getCharacterPrompts(),isEmpty);await app.removeStylePromptPreset('style');expect((await Storage().getSettings()).stylePromptPresets,isEmpty);
    result('Native named characters positive/style cold persistence',['characters','styles','settings']);
  });
  for(final kind in [ReferencePresetKind.precise,ReferencePresetKind.vibe]) {
    testWidgets('native breadth reference ${kind.name} file lifecycle', (tester) async {
      final bytes=await source.readAsBytes();expect(await app.saveReferencePresetFromPath(source.path,kind:kind,name:'Neutral reference',group:'Neutral',strength:.7),isNull);
      final cold=await Storage().getReferencePresetLibrary();expect(cold.presets.length,1);final preset=cold.presets.single;expect(preset.kind,kind);expect(await File(preset.filePath).readAsBytes(),bytes);expect(preset.filePath,isNot(source.path));
      expect(await app.applyReferencePreset(preset.id),isNull);
      if(kind==ReferencePresetKind.vibe){expect(base64Decode(app.extras.vibeImages.single.base64),bytes);}else{expect(base64Decode(app.extras.preciseReferences.single.base64),bytes);}
      final archive=await storage.exportReferencePresetArchive(presets:[preset],groups:['Neutral']);final imported=await storage.importReferencePresetArchive(archive.path);expect(imported.presets.single.kind,kind);expect(await File(imported.presets.single.filePath).readAsBytes(),bytes);
      await app.deleteReferencePreset(preset.id);expect(await File(preset.filePath).exists(),false);expect(await source.readAsBytes(),bytes);await storage.deleteReferencePresetImage(imported.presets.single);await archive.delete();
      result('Native ${kind.name} reference archive/apply/delete',['reference-presets',kind==ReferencePresetKind.vibe?'vibe-transfer':'precise-reference']);
    });
  }
  testWidgets('native breadth favorites copy dedup rename and bookmark removal', (tester) async {
    final favorites=MobileLocalFavorites(rootOverride:root);addTearDown(favorites.dispose);final bytes=await source.readAsBytes(),item=await favorites.add(row('favorite-neutral',source.path));
    expect(await (await favorites.file(item)).readAsBytes(),bytes);expect((await favorites.add(row('favorite-neutral',source.path))).id,item.id);
    final cold=MobileLocalFavorites(rootOverride:root);addTearDown(cold.dispose);expect((await cold.list()).items.length,1);
    final renamed=await favorites.rename(item.id,'Neutral');await expectLater(favorites.rename(item.id,'../outside'),throwsFormatException);final retainedPath=(await favorites.file(renamed)).path;await favorites.remove(item.id);
    expect((await favorites.list()).items,isEmpty);expect(await File(retainedPath).readAsBytes(),bytes);expect(await source.readAsBytes(),bytes);
    result('Native favorites actual copy dedup rename and removal',['favorites','output-management']);
  });
  testWidgets('native breadth actual imported font engine and cold scale settings', (tester) async {
    final bytes=(await rootBundle.load('assets/ui-fonts/SmileySans-Oblique.ttf')).buffer.asUint8List();final input=File('${root.path}/neutral.ttf');await input.writeAsBytes(bytes);
    final repo=UiFontRepository(Directory('${root.path}/fonts'));final font=await repo.importFile(input.path);expect(uiFontLoaded(font.id),true);expect(await repo.read(font.id),bytes);expect((await repo.importFile(input.path)).id,font.id);
    await app.setUiTypography(UiTypography(font:font.id,scale:200));final cold=await Storage().getSettings();expect(cold.uiTypography.font,font.id);expect(cold.uiTypography.scale,200);expect(uiFontFamily(font.id),'Studio-${font.id}');
    final invalid=File('${root.path}/invalid.ttf');await invalid.writeAsBytes([0,1,2]);await expectLater(repo.importFile(invalid.path),throwsFormatException);expect((await repo.list()).length,1);
    await app.setUiTypography(const UiTypography());await repo.remove(font.id);expect(await repo.list(),isEmpty);expect(await input.readAsBytes(),bytes);
    result('Native font import engine readback and 200 percent persistence',['typography','settings']);
  });
  testWidgets('native breadth backup configuration prompt agent rescue and idempotency', (tester) async {
    app.settings.backupDir='${root.path}/backups';app.settings.language='en-US';app.settings.positivePromptPresets=[PositivePromptPreset(id:'backup-neutral',name:'Neutral backup',prompt:'blue square',createdAt:'now',captions:[CharCaptionItem(name:'Neutral backup character',prompt:'blue coat',negativePrompt:'red coat',x:0,y:1,useCoords:true)])];
    await storage.setSettings(app.settings);await storage.setParams(GenerateParams(seed:4000000000,seedMode:'fixed'));
    await storage.setAgentWorkspace(AgentWorkspace(conversations:[AgentConversation(id:'neutral-conversation',title:'Neutral conversation',draftText:'blue square')]));
    final selected={DataBackupCategory.configuration,DataBackupCategory.promptPresets,DataBackupCategory.agentWorkspace};final service=DataBackupService(storage);final archive=await service.createBackup(selected,includeAssets:true,internal:true);
    final inspection=await service.inspect(archive.path);expect(inspection.categories.map((c)=>c.category),containsAll(selected));
    await storage.setParams(GenerateParams(seed:42,seedMode:'fixed'));await storage.setAgentWorkspace(AgentWorkspace());app.settings.positivePromptPresets=[];await storage.setSettings(app.settings);
    await expectLater(service.importBackup(archive.path,selected,confirmConfigurationOverwrite:false),throwsStateError);expect((await storage.getParams()).seed,42);
    final first=await service.importBackup(archive.path,selected,confirmConfigurationOverwrite:true);expect(first.imported,greaterThan(0));expect(await File(first.rescueBackupPath).exists(),true);
    expect((await Storage().getParams()).seed,4000000000);expect((await Storage().getSettings()).positivePromptPresets.single.prompt,'blue square');expect((await Storage().getSettings()).positivePromptPresets.single.captions.single.toJson(),CharCaptionItem(name:'Neutral backup character',prompt:'blue coat',negativePrompt:'red coat',x:0,y:1,useCoords:true).toJson());expect((await Storage().getAgentWorkspace()).conversations.single.draftText,'blue square');
    await service.importBackup(archive.path,selected,confirmConfigurationOverwrite:true);expect((await Storage().getAgentWorkspace()).conversations.length,1);expect((await Storage().getSettings()).positivePromptPresets.length,1);
    result('Native backup archive restore rescue and idempotency',['backup','settings','image-agent','agent-components']);
  });
  testWidgets('native breadth corrupted backup leaves native state unchanged', (tester) async {
    final settings=(await storage.getSettings()).toJson(),params=(await storage.getParams()).toJson();final corrupt=File('${root.path}/corrupt.naisbackup');await corrupt.writeAsBytes([1,2,3]);
    await expectLater(DataBackupService(storage).importBackup(corrupt.path,{DataBackupCategory.configuration},confirmConfigurationOverwrite:true),throwsA(isA<Exception>()));
    expect((await Storage().getSettings()).toJson(),settings);expect((await Storage().getParams()).toJson(),params);
    result('Native corrupt backup rejects without state mutation',['backup','settings']);
  });
  testWidgets('native breadth comic batch and agent workspace native cold recovery', (tester) async {
    final params=GenerateParams(seed:4000000000,seedMode:'fixed'),comic=ComicProject.empty(GenerateParams(seed:4000000000,seedMode:'fixed')),batch=BatchRedrawProject.empty(GenerateParams(seed:4000000000,seedMode:'fixed'));
    await storage.setComicProject(comic);await storage.setBatchRedrawProject(batch);await storage.setComicRun({'status':'paused','neutral':true});await storage.setBatchRun({'status':'paused','neutral':true});
    final cold=Storage();expect((await cold.getComicProject(params)).toJson(),comic.toJson());expect((await cold.getBatchRedrawProject(params)).toJson(),batch.toJson());expect(await cold.getComicRun(),{'status':'paused','neutral':true});expect(await cold.getBatchRun(),{'status':'paused','neutral':true});
    await storage.setAgentAlwaysAllowedTools({'read_image'});expect(await cold.getAgentAlwaysAllowedTools(),{'read_image'});
    result('Native comic batch agent state cold recovery',['comic','batch','agent-components','image-agent']);
  });
  final officialFixtures=jsonDecode(r"""[{"name":"gray-alpha-16-adam7.png","bytes":1147,"sha256":"4e5060b87407ec2505f5cf3e9c010736fbaac8519e2d83dc61d74fe181ff7c53","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAEAQAAAE2H0s0AAAEQklEQVR4nOVc7W4jMQjMY/fpm9NJV9VCDLDGHgL3w2qSTWzmw4CVbl5fX9/fv+P9luOFLjx9A2mJXAyhGXJB/n3i8pALMr+EiQJfPE7URT9gDo7OkENBCDKspr3U7Ql+cKQm2BsKi88mVDh4PMF++AqErQjkB7Yh2BkoQOIRCEdU2JrgyGba9sGRzZSCsBf6yQmOkHgkpR2JoIaDnydHrLxtpCMQtiNIQzjigxSEfQk/ZoKjKtT5oH43pjlIR3CsNqYhpFXYmuBos52OYJsDzQu5iTdEQIHcHa8q5EJDLmpDAv4wjgocRkBvkstPmwxo5qMywKd/YWBFi/5eZYBDt8PAOsoyYUkikq6n5wHNdLkin5BA8wE9AG4yUjqa8kxY0hHVbEERgOYFegAa9dRawDeiYUJ6AAh5yS7gFSflYFKSCTX66YmIvzhgoLQfKMkDqBDdRe4wsA4aA2jBkgDK8wBvGCakng2trvh6ANaCtETkGZESAEJd1pBwmACH09JqaD2+HoB2KqKm4pIANPTSiNcDQEGUZkLaucBblCbBygI1FWvIS/IA8sJ1BuoKkfAAF7nBAE//JQCUgum1QNO/LBGVMcBtz41v8MsluL+4YMBjgsKANOBd9IoH1gCoDGgSUNtynukcD5Q0JJ7m1IOJZIIqQenRDJ2M6BJYGZHCAFd/wYBGfUk5LmEAaU/zgHaxZBdoC14PQFucWg0R/bRdgOimeWBFLB/TApDU83xgfGFB94BXFa97QFuYKkFZAFL/knMBCoJejj+mJ0Ry0CS4j/yBBNcD4C8KAlg1pzNgmS9yaKlh7zABXh5Cuakv+H8EeL0QSlO9gRsOiBQFq3T2GuD/ST3F++994IBIR25tmbFbwCKjHkSSgEgF0F7ndawEByCAEUe0JwApjT40qyQad5ghkL0VdwhAQCNbY1QZtFS2ymK/EbjDL+KIEQRY3aC1BdoTIFVHnd7MPODc2OQpv76vLQGW6gjcSAdo4DXQGvC+RICvyldgkdZ4hAMsAiyXjKgCXulD76kHcJAApPg6eqsNCPCUlwRoRPQlJXgY8kC3JiCiNvrbPx8Efugh0g2OISCy71G5bEvAEwCz7K8Q4G0H7bXepfHhz93MOgkqDpDAZx6AggRoH/DcMLIVRlsjQtjnj+BdRJHD0lgCNGf0Bi0IkGp7TpCTjHYAsn194JccYD2WJMzYEsbvf1olb9RhaLfk9VZecYC86O39/uCFA5Cyljv6O8H4+dWZjU+AAGR9q1S2JsDa45EGST7uNYK3sc5NiIFWWBuod+g3wB0TyBHzzgOBX3SwyuKYThCB/6+2gKW2dr038KADPIuP2ALR0mc5pDUBmvpW3285ZVQZfJLo2hPggURnhfXaCAd4PYH2WnsCUK+P7I9eG0GABIOS3DgHaICtfmCG+sIB0Z6/N+AAASjjz+j9AQFvp/ZH3tNz/AGj5rwa2a/xXAAAAABJRU5ErkJggg=="},{"name":"gray-alpha-16-plain.png","bytes":1004,"sha256":"41bd90d2ed179897c1fb0037d48c19b82c36e4370f793467bc77c51669498dac","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAEAQAAABBGHuiAAADs0lEQVR4nOWd4WobQQyE/dh5eqcUWroVmpE2BMJ89+OIfXYC82lWmnV919fHx/v97/j8/P95Pf/759+jvv98Led4aXFVeCdYwYkEUCupKuyAxAOoDnBLowLJPF69yPNN0+vZEAYArhHmii4AOjHKCRzhDYBp3CkI8U1wGnlsF5QlsF3zHBBNDriZ+1gAnRtOIIwQ9AeAqrAD0D1GT4ENDFQQmhJfvnABwEHoloaDFQdgGoEuI0QDcBXuxOEcUMW557yeYHrAjWgEANX1XTjKFX4AcMJUJM4XPjjgZhpkO8EkwSkg5YoeHODGods3IBywme0qF2AAKLHOFdEA3Pg7IWyWSfznAWrUbRMh7gMRV21GLrj8ROgmMsfvBp+RBZomuEl7tz0i8lPhqepIAFWgglH/UDQAt+6VOFQPUKKc7TmNUPzbYPdm54pcCGUKqHWvnk/QIqPwdgrkV/8A0Nl7Osc4ljmgQuBE4uY7Qs/YBRoHKEfw9gHLvYBqevgcoBJgtmDhgCn8bHaIj/uCBAPE8P2A6Vx+H/jCdrirOgbAtqqcOGyaoNsKK9dgLpiYKs3JAuIToVOwWx4oAJ346g73GOGAzezv3osF4M65/UL8JTPqYNm/OKCK7IS654+5YkRNCRwAFYU3fQIRhFy3Z0wAAeBmFKIAdJV3lc4WfgCY0p3rC/kwjAO6X5j6Ae66wa07fl7INzlAiawu2Domfje4GXe54hcAThAqBmMAbKIuZ+1fOKAK5ohvHOCWQHe+gxU/BZQ4XggqALoG18HA7QVuGiBr/QsHdCDc40d9RWaKy8gvSVUA7jz68vnNT+R1g0potvUPAF/d+eEAbJIgQ3QBMCU8Nf8ZIMxucApIDg4iCndOcA5BAJiCD28pDE3QjUbGYb4oWaurAGUDubibHDMMmc2QW+scCOY2Opvqd48xd5GZqo8Zg5sQxE2F4vJ5JZZV/QOAW+vdMYWj6DtI3IhGADgF1sfbJIgDcIpWTpjeF3/ZnGp0ajogHOBEb0Agbqm5EYRughu7q40SxgEVQPd6duUPAFMCdE0S64BtMsQBmKo8jUzk7fS2mSDeAWrWb7o/DkBn9foT0wTd6FNpEB2EnFj1h6IBuOCjgHSvRTtgqvLUADEAOieoKYBpgrXKqvLqXLwDtlXdTgvUXWQ2DkACUFU/xWJ6wLYBVgjIHrCpvHuMCULTpgcHYLOuldUxAFQv4Kx3A6BWcmv//EMEIZX2pj0D5v8X6FzAEi4AvIdYPKXEvOMX6gS8GrIELQwAAAAASUVORK5CYII="},{"name":"gray-alpha-8-adam7.png","bytes":954,"sha256":"571a67cabf1139bce0d81593ad124997bbecb483610d264b49f9b88de6c0265c","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAQAAAFmj5d3AAADgUlEQVR4nMVai27jMAzrZ9/XN4cNCKyHY8lkzCEYtm62RFMSJbf7/Pv+Ptf9fOyLx19AWyobkxWV0SvjqIzWW4IX97IPbJMPh6K7ovICGJ2eNmzbXnDVCxbPQPmtMDwuuHouFhbuPyxdfCuQDReNUywWNIK15KERrMJFg+piQQNkI+UaFhgMP98aVC+Jari4KBcNHgoXy0O+s6B5Co4HPpolBrZwWjwUVBcLmmJeWlhiGEwUi58PUahxZQD2fp8R9O2PAD++VQBIrLYUWbVCMAgEEcAHsNluvzYRAMAjAksiwQGFgMiDQV5R+usjDBZgA2AqDcWhM5FQJCKIWRNhA7aktg14/yAHNhdADu7NRBSgohqNhchEHweQA3B71kTYAJEHtpQ2vUcEF47AbiQM0HkAPZ5EsDd6Vd424DdCiRRpBAxY35SgAChscyWrkSgmP6uCqUwYiF2JbCxkJoKTqt8KXzjg+0KcUcEjwGNGvJ3SekAggKc0XwdwLVzvJBKFAJR2/w7AC7UAy/pLqUz2hRcmFFDWqQYfGwvFwU0mgIDsznRr83Mq3BvBaOREgjjw/RnkgEBgzw9OKPdDROGVKY26tV3MiDOAQxxEQScGDDiR/KBLT2l0GPXNNQoaqYnUgEFroj0IdASoP+UjbBuAt1oDlCZGAnObIfB1AcQ8shl11H38cGBQKXHuGcjlQHXcPQDzkx+Pv2UgKzo4+aMAYleginsPQK4Bf3kT5IB1mJk4DuBpvhQVo/+Ezee/QAViEkYdFApRjjbcYncBDPNPTAgAeC2MdwZhGf5BFsQPpmY3JoEOzK8HQgZipD0USRLOQ3Dc/TwHPCeSgSTnvlgJ40wg6wT57dsBAL6wIQw8xV2mA/7cs8vJYQB+CI9aKAGQoy+6Gz39R6UoAKuLiQ3JcQB+Eo4QJAxEQb4UzjOA8YfIw3EAcQgRNqOcfLk5SQHYufCo6xtAVLzoXMyAnweEDOQ5MA6rRxmY66CoGa2KTxCI2Txgpfmw+6fPLSwA4VRsoYirYDaOS4R4/n9aWRmPA/ANSZqKWYrH4yfDgwCyAOUx9SCAOI75cpQooXX/RyHI90ChFHsGIuWSm1EuwLkwH2TAx9pXgwiAhREjL2xGt0OfEaIQWOf2J9m9IAZAdj33bvJ4JmBgOPZaIDh/fIck68Dx5xOi7/NBBCAqQP7NQQD/AfRR3gZn8ZbhAAAAAElFTkSuQmCC"},{"name":"gray-alpha-8-plain.png","bytes":849,"sha256":"b7d023d794b8d39d437a869f7b77188ff21f828068e8882a5261b99ce4026ba3","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAQAAAARiKfhAAADGElEQVR4nMWa247DQAhD+9n79c1K2x2BjdM3ThSpdwnjAWyUvn7ef9f1/3xeX3/X+fzau14S7gSvwB3OIoCTZc9YgawDOAzocRwgqwAq5Ocjf79+BBpQy3A5+1yEJzAQvAB463UI60XozQdzcI4gnT0CouZA7n8UQB9JqR2XAPSMFcBFMqDN6DCWGfDhC3fBVIJ+HAprDYA3oU6FdTW8MyMQAyecPp8LMCT93HNopAYqrI4kcBJ6zuszcDKQOwEypSpA2AF0BrQVVSEABmbHT6O2DKCHzQK9BEBbMNUCAMCtuf4IAeAjyNnAACgLwDBSNXxgElQRJlsOTsLpix4cxd79kBxPwjE5TtsQthv13bA+Vi6QUezGrKsDNIpTF6znr6ZUDdlq2O9zYLbkOoCTN6yEykCyIZAnPLlqO+o4XmZgDh1oK+hd0POGhKgDcPf3zaItALgrQ6AU7+W4cgcNiYbCxGg6AFCQ+w0LzxqZBN0RfQJPV4gcQdfB+QgwMCeALykQAH01zdoCgJwhaErTNuiyDDDgvaBdgQFImxECwAsP2wzTDQtlBHNE7o0LyvKlt25nNazDUAbqC2xF8fuGiQ8AgIY8HCRmFgC4GH+e6yfQKFY5zk55EcAcvcj5ZwbmkoYw4I4IG8bVBdOWXbQWJHOKdwFmRCYD180j5gldB1FTmoUYEeV8+/6h1cxXMmQY9TnQQ2LT8O7/hGAb5r2w3iMAVP/8EKC9YIoQOIh8NQGPwYsQc0IF4E4Liw+IAYcBjSIVIz130JbrHJweEQIw80facI4hdB722/dTFcAiTLo/F/UVAN9DI1qQyg7bDDoAX0iwOVABpyoCnrCynAoAybEGrQsuwuQKsSPw9Qx1xUmKr2cYSBMRA+A5e3MuAkg6mD3yIgP3thQFoNvALMslANqA72fVMIdExEhbbxrVVQY8Zy9BBECx0LsAluPKvr+CFpOpA8rJMgBvPOcCAtBzBy1ZKsEDAayBmT1SATqIXIAwAPO0sbXk/pYN4AYLQBej+1V1nQE1ZOsyPBl4mx9C8tf/FbsGIjz8At453gZthdlcAAAAAElFTkSuQmCC"},{"name":"palette-1-adam7.png","bytes":680,"sha256":"927674c905e9885e8fb2f2b2d1b1fda6b9727524df867402d2cd04e18eaa62ca","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAAQMAAAH2SM2/AAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAJPSURBVHicPZNNSBRhGMefi2VK7SEyAmMMQxPaJjPqIDJ9UBkd7MOySNmCKEnIzEMYxBCpWxEsscJ6EAxJlBbFEAovbh+3Qj0EFUaIrRR7iE6htyf+z/xnYPa3v+fjfebdd2bFEV98CeiJI5544ktCEuIZfVHLBPWcfeCBqcTsalLxVd6orFdRlTGVuypfVapVbqisqqRUPGuLWYNaGLNVjvmCiquSU/lr4qt0qgyHl2uhG3Z2hqNclYTKkrlj1wtfVQqqKs+AJkCBncAMqutgj4HzCJdgPUAKuAacRmEISANlyPXChmGjwCuEn4AkMAEMopCHXQSmEDYDpxCW2oZgB4E6IIHcBqAcmAe2adgyCVxBeBnWCOwCMsBHFOZgHcAywiysG3YLWACuAxUoNADtwD4gDtxEtRTWpeGuimEucDXay6VoGzXAEWu2A0NYCSsB7iNsAcYRrsH+RCe5ArTa7q0l2tB0dGr1wB6gDQPqNXxGeXuCZ3N4nCqDR/1AquL2rZLp8AIZWWSm9w57MpuY2fuWPe9uU+r+ceCTz+wZ6KM8WGVPTyPlTBHlPX4/pH8Ll2++x8zYd2aOb+Xd+89x1aNj7Bn9TdlRYPPAHKWhmVJWQokdpuQKHDjyhQOH8OQhUz84cBpnbbfoZk+8mJl4mj1ZvISQ3SeYeb3M5qKXvNck/ge2n+2UdBt7nibD473AOeUTXFVTScmusXkxyUzXfko+LP1a4ZyfsyydrKJ8GKd8cyipPq6ar6VU1LJ0YIaZdrz9kI3VnCwPKYeeB6X/3z4owfJNJI0AAAAASUVORK5CYII="},{"name":"palette-1-plain.png","bytes":577,"sha256":"b122f0bdd860f9f2930df0db2aac9f0a3834c6359b80f95e4af7b1e3e39fd3cd","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAAQMAAACBT/0pAAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAHoSURBVHicNZNbSJNhGMe/C8dE0CbaRDp4qDkmGyQ17zSdmroLU5PCCwlBTbLIY6A3ke4Q0tQwNVBkCVG2sigW7KbVCkWwvFC0nCFWFEvsRiIh2EL3e3azH//D87zfx/spmrrTkb2f4qv2R8FlRrlXdCMKej1Wlmn/P6L4VoGxFsLZWyhTa0BfNWBrZ07ldWklABnSOvGGOaoRdr1tRfkdRjn5BziaSat/CUhtxLprR9FYqd/8CwwEgO4yoNxPq0qFUnmFesACtH8m4zgoK+aApB4yy9M84MMgVtMlBp5JwTI/I+w4h/UqjHKrRHZ1EX7wEyV/VF5UiMkx6XKMD4D9H5BXA0z+ArRxgOk4cKAQSGjjGP4QS3OLgakVLPccMNGCNXYfeP6Fg+nUDHy5jdVrlafooG7cQDHFAloDddMwEG9mjucsmTv1gLGUzPhVeXWbgGOLluoxoHlCeKYBcOmBvCNA8gvqw3L5B9Tsuu0kk7mAYjsPeIOEDz9l1yEviuEYyvvLhD27WBflYq85yazvoLSdQpl3oXyT1soQ1o/vnCexFeXra2C3Qq5xFsqsBXj3CMiV7Z/SUK45UQbtwHgB1scc+QblaqXnyIffKQN9ZFKDPGmzB9AtAvHywmsvAEofUDMIFLij4f+/xUfVkIokJgAAAABJRU5ErkJggg=="},{"name":"palette-2-adam7.png","bytes":702,"sha256":"4fd37ee92b17b71b9a765b144a15cbe3cce6da730f061cc89d1b6835a2e92d82","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAAgMAAAGx6LdvAAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAJlSURBVHicZVVbigQhDIxg/hX0Pjbofwt6/6ssyaSym1kYQrrMo0yqeyhd6vpzh9Vn/fVLVX8Mp1+6OPL4BftB/PFeogtTxHQxqwsm5srjFK+L2WKymKanYoaEsBfQUtcNO6aVk2OvmKzdxBx/1Lgm5okm+0GOVVpsrqdVzHYsuZlFGkhHKarFBUcJZ65ONojWY1naTJyB9FrtSLqp03Eko1GnoU7V60nTFw6bk7wyGFqZS7OCRrKjV1akwbIXjdnIsq50ULkOc5bdjCr4FNTRLXyGYAijMnsd8AEzSjJ/5XOA4MjT5zGneXc0LSCW4TzIeicq414NWQf7mkC6aEFjQMN4XWqYasbk2QuiKYuiNcaP0J28BZr6NLBd1dsny2Nwi+oiQZ0MIRVLI3by2HsGQqDRQaz6VNH94hbHBQCGBwUrxPZOT/8ewvqnFnbO2GA1iRNDLa75A87rqdlOjc4oVhrzahlpFtHbsnRjl7fd3IBRuu3IU/SL8QswvfpFcOBNPQLMtwZiY+6/AZeeMiBxi0gX0voA/SkjADVRjW0zFosaLcW2iXu83Ox7hYjSkq3Za1SoxIBRItNZbUcAcjpPXEN5dwB41xKJNZoBoFtSANY9Jl+0zbsFYs+L1xQptOOyF0OoTr3Hy+VNJkEHnrioufCVQsRrUvcu7aRQlOqMl5sHH2UDeKcvWXINAqHxBl4iyyr/g79Aemcccn4y3hVQv1FBe44eInriuJfDXymnnUj95HWigp7cAvDyHAHYI934NtzxpeTDcYSZOMqB2wqLoTbwSTaAdnhtLxGFq1wqNO3D/AF+ALQrMSRtZNudAAAAAElFTkSuQmCC"},{"name":"palette-2-plain.png","bytes":577,"sha256":"2f1f5e3db1b3380b25735a8a3693fe935a68569bddebeeaa7e40c14ab7d21156","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAAgMAAADG74f5AAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAHoSURBVHicXZVLqkQhDEQTiPME4n4UdK6g+9/Ko0fvHnvWhflVJXVFJXa5/z+ZPWx+gbZL4EVvXuoXsGoVIZa2L5Pub8SVXnMiqY3zTXFl2B4AWgkj4NXQR0jNp4ocAKZPlSJL0IdED8yytPLFORdJpJTLED32dDrA8RXtyZDuLfhCfKBs01sJnGUAavcGwPu8qBIqlDIkF8ouc7ZebXeuQ+rb+qL6WiqV2z46hBp1T4RkJofz1IqQEsj56yMKFzcvxW7NyWm1GuwjDteynM4NMj0cX9zkHX+ToLgcruxwhpwzyFgKAdvGELmuBE5Vjn8PSS7pzmltJ0KGLLLeV06E9DoUwJTNy7YQqj/Lwa1LMx8P65XK2dqXhrKlAdC0zrK786JkF67lmM6kXZOz2AI/V/rMxwvzkOSWh9pKjEdKGbyocdIBtA3X+u2HklP1ycvu5THpdoTn0RYIu2K2Fl94JKWMTQvWNbjJOiftwroVmqPno+289KC4j8Hu0bgwe12uQ9XC5V+9cfxTnio7O6/y5CHrqvV5YZM2fpufxz4t2Uc6P42rjMZTz3faprTgvO2x8duez+t0drpO4RZKPJZjUugOlpUUlpw4GNG+eerZBgGLxQOSd3Gjw06viECWK+Ht+/+Ky5Bv0j990zrAwGn6qwAAAABJRU5ErkJggg=="},{"name":"palette-4-adam7.png","bytes":791,"sha256":"248f4c816bd993d3a1a7e6b57cb021743c77813102d0b76ebbbb23db9a509761","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACABAMAAAE+qELPAAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAK+SURBVHicfVcJcgMxCDM/gP9/tiOI8SIKmTRx1jKI2z1HzPD3++Cf+SxWuSGOy43303eNwFWe1tXbpY2Q4l/fheQivoGO5XGq92hs6e+JXIzJBefWXdjFaCo1Vpo0UkUuEvyo5hNhzD133NZrc2wpb6UcSbCMi3eqyenaE9MNfHKu5J97vph8kjRUku7PmsssiRbAU/2O0AuhKg+Pml5Wl9G15CLSIWmF1CPXmocwZsrEhHmIpOXXOOMHVdE50piSxyqL8CkRe0H52ZI18ITSA72Jn1qqeceUmIpASlXL5rM/mEdm0UMYIYyYIjmJRxHhQqs/jtSkgYjq5CzyUa0ip4pabdaSceJu/gpV9piQFtdDTGtcBJEqiCoTEpgHlQxqoWlhBGXhUcpkxImJMaLGAbFuR0gL5weVyz/RBzNi2mxpMsjrwtFvoeQaO0J6nBippbrlfgHqVYY0n3J+qHJVUviR2FzI5DFjYsJN6c3Fj9o92NqrsqVD8ylXVDU2jlRrudTRlHrnF3JsAYCXp8AAcESlyhLEUIVnBPj5kcJt6a2RVxXN+kIy3rUDfQE+SN4k/leCId1mR/lMmM4HSViyOMpbBncfmqiQMQMEsaIp8gXE7OeSLxwQ78VMTByxLVgIE3fMQjJUzBkFDrBhTpjIiMWTSIgxXaK3wIglmkFg8QOSAdEYAahoHy4TACL4olU44JMvK71w6OJRregDkFS07t4Axi2SOKDpLsECxfD3AqCLIKuIwtok0KWvWYGEbDfjjwREC6+Zg+nGMoK5ehKFI3OHwLhb3HTbIM/ewgFN0m2dAPh3QudG+UvXpcOgT3vtTABk3LGlLmIEbSpQlpurzVvt3INwkcR7Bviw8OqZAKhdQeYPABihe6eFoVvKKTrAUv7u68URfqngy2uV4IHY2qBfB5fSE7901avsF/AHwn/meSndqZcAAAAASUVORK5CYII="},{"name":"palette-4-plain.png","bytes":702,"sha256":"5fdf4dbf87488906ac5e576fe0177e6956fb93db484cb4707fa8b470b9708d9b","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACABAMAAABJr3JZAAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAJlSURBVHichZdJkiNRDELFDfTvf9mOhzJ6Zagq74yVGhAoZzQjPc37/Tf7VtLsRsDwa5UIWp7ylACzAvXiIxxiY4BL8il+T3Q97b6Y5Ozui0USwRlkxCwlahpAc4UGgJjFU4kgvZnYJ6oY1SrmPpP7MBIDj7N45kuJ8NYJZsKMp1AeQQ1DuxNgoWMknCOsy8ikZVIUkiPw2c2sJs2nzKilE0wkAcRmmTYJAO9pZQTo1jdH4OvMek9zNaXVEPbp8vgJ2GG9/2i1i02AQT4Ka2+tFvKnR7BTOt79rmL9n4elq6JoFITNi3V9cKURcJtdWU0emZMnHqp9gFQ5yWEv86z+C0jZTRi3mTHfuLOKfWtXhjWIQ1HSs4pFsFMEiRQLAPnY8ggn4d3JAPjUfNMimIdFj9jfMk3SVJEgtANWRAAZIpUZwLQz5wYFe3ktLB92rTws0qOOCLAEeYUDAD9CqnIOEA4xzgCzNgNoc07hImx1nO8Kyn34LKvMwlkUwqx1KufA2vLpEoTIRACM5xCKOZBjXz0WrzgO0Vsr7578Q8RoQ/NuNrs4L4/vR+88+3shrZtVkmR5vZ0xAvPGlBLAKbaTFT/4XCUAmGQ5D6D83SkBcMZYd9OeVm4YftoOTm5qm04G0IKy/ifDRczvFaSM+5kqpQqbf7mTMAN4nVl9zl4j+B0rbxYJ6kv1J+AcLV8pTNNFtNseXy22aEL2afouLpeY66hnM4D6Oomat3HTpKJy9wbTFmcpsbm/r8l2P/hVMRPCbyiPShJAzKF5970NNtf7S0jvTa+JGG2Ow3YE60cBEOEo8RPwD0kq6DvnvNeuAAAAAElFTkSuQmCC"},{"name":"palette-8-adam7.png","bytes":871,"sha256":"958543d075cd955c7e06779a8676ae43cafb31141e95b9edcd711ccc6596f06e","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAMAAAH7WK/OAAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAMOSURBVHicnVkJcgMhDNv9/6c7XfCBDVJQ2pk0GyN8yoY+z/O8/6/5tvyBvmoy8aQJv47ThPtXtmq+7wGP+ti63ZO2Cgin3V3+9CAQV3x/8A/3VIzlwbtZskr8fyhLXFs3oi3pu6wPunFFj25cXdJVrw86aHdhlyAYddVn/irRl7xkSdejLqkyPzzY7cL04NY2DBqojR5V9fpgl/xNomB8ijQL8ibdRwUBrd+YutsCvmapnFGGZ5qDFoRPRYSA9fzAx88JgRgywIknsaNGXgE/jHCiaA5iwgLIUx849STOKGyl5yQU6PWxCEwApEOj6KbDhpSKFSBg7uezJ6cZSAf0veckFMB+sHBiBOQoMxELUD+A11QS1ebM6qPApiFvEPAWxMwgoRPChqCLwNgDOcoT96QkFjBns8JhnkRMuxmgCgJM6qBZtAXkEBar3p+3CJDlZiRgLHZTTVGSIaDEdyZmsYBp/4urWV1whkFpT+rfCofoACmIRPyH0iNNyQoTmsmTFvZNMmd5NBHDfG/YUZzlSNcjTW1zFrqbQNzdyAo85NikdNaB1SYr3mBKpCQlEJqTuONAFowtXnmmJfSQJ/NZP3TabwDmJzLCnwAsncjcijXIaUvG1x1A2v3aA2WkpsepA0BuvPcaBAmPrnfvgzRrSgCZP5VIWgxm5d4tNgA/7QpRtKOZkbCQSGOkSFrcA9hB1zvaHYCXougEr+IUjDsAr+cJJ2gQjZAQ5EGDVA5KNYUPnN0EgOAEKRN9mFFKIfYPhr7WIFsv5cHE4fcFJwBvwfhmBwC4A5TWlHdULFgbC76NOAJ4B5e6YxpipL6yNFSpOS5zhVRM7sCc1AqA1JrXAy++a2EasAMC1MDZkFy2nDRIiaiNeTmC91bkWlQz0ZhsAGisTK5oKEAeU4Q8SNO2SKrmB8mPa+zFOdGJTSkGJzQ7ot2bkIlUMyFuoKRUjkjMz8qEEr9KNcZJQZoxjA/De1oxRZ+WJtV0ctH6gv/fSGnvPtiImfBYW2IXokCDqAJxzDNm1zgtbknJdekJ4A+0chtUSIpiaQAAAABJRU5ErkJggg=="},{"name":"palette-8-plain.png","bytes":739,"sha256":"cf44b104984f2ca471daceb7aa7f2fc98346743637b6dfcd50548aca52a0bd92","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAMAAACMX59YAAAABlBMVEVGeL5GeL73QV4eAAAAAnRSTlP+/9Gu7oYAAAKKSURBVHicpZnhbgMxCIMv7//S0zVgzP75u0nd2knxkQDGTp/nec7z/pznnPO+P9FPrXv//BbfzxnA+8z75AKJAd4IaiPvP0KA38raxW9xGkEtrFNMn2+H2G8BQCfwIsSH2BmkIdzM9f4BRJfhFBICuNU0qUwAag+VBxZBZbIx0gi6hmkW1Ap3I4UVAXQWqxzibnQ6IRHY634Gpazkoy10BqqaWCX2o+MyVASWB0Kq9QvtYOhUSITWe5XYLQWYggIRVBLnHHKAJnbFFAOop9FoM0YCpO6HBwtBZKoAUB10GJ9KuUuAtLMiR+3s4gacoqW+wgCl7C9USJYFppHEaOHaC+Ck5gwdAKypTFkZs/rWiEDprvIhY0Ec2DBfBQabjXaK+TmudiYyazMZaiYRAetndwmjmrMIarS77M4AJC56QscRqAiIaZJMLpkHfaPeg2aaoYjkwXYsM11igJlMzLkubgUAlkfESOaakU7cvgk0kw4OTReXqURj7YsLNJkk1Ct4dAHhBhYAqISR4zDnzh3LusUhdbAcE+uFIVacBUQmimBUCuTEbkVIqtbLbDYaJeLRNlqfqDRvRASgSvwissx/5gAjLJBzHd9ZmaTe2W6zCABjox+ANyOYrX6bxyrJzApzz6Nw/luPCEABEPuvywtWjE5nfDaO5WJ3KL6aXAcqeCgw7PqJjXeTuMwvqJ9nRoYA1kH0EIcU0Rakbxgru+3mEUw1IgAfq/w6cJFzFsFiVQgg24ls37Dhh260laCZLBP8WtjHbAwgfQYr0WwbUWn+BQkcLJ2/yWkO0Ptg9wdm1+AZ6PnI+nYGxzfEEfTGoeEwywM10tGFKJCZ08Po2w1FYPICAcyXG8C5/gFj5RtUmnOOVgAAAABJRU5ErkJggg=="},{"name":"png-text-plus-stealth.png","bytes":1052,"sha256":"c3395ae291f13b88eeea4abc8b1ff7ac635efacf4af82a50d14f022e9dc201bd","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAYAAAC7gW9qAAAAG3RFWHRTb2Z0d2FyZQBDZWxzeXMgU3R1ZGlvIFRvb2zBp+F8AAAACnRFWHRDb21tZW50AHt92ZfNiQAAA6ZJREFUeJzlnVGO20AMQ/d0PVNP16PZ/SowEERK0z8+fxibONkF+MSROGns/vz6/ec5jrc8r+ff46jvfxOPHyOuCu8EKziRAGolVYUdkHgA1QFuaVQgsQA6keebptejIUwAXCOMFV0BdGKUEzDCOwDTuFMQ4pvgNPLQLqhLYLvmMSC6HHAz97EAOjecQBAh6B8AVWEHoHuMngIbGKggNCW+eOEKgIPQLQ0HKw7ANAJdRogG4CrcicM5oIpzz3E9wfWAG9EIAKrru3AUK/wE4ISpSBwvfHLAzTSIdoJLglNAeqgOcOPQ7RsQDtjMdpULMACUWOeKaABu/J0QNssk/vMANeq2iRD3gYirNiIX3H4idBOZ43eDn8gCXRPcpL3bHhH5qfBUdSSAKlDBqH8oGoBb90ocqgcoUc72mEao/m2we7NzxUOZAs/l8wlaZBTeToH46p8AOntP5xDHNgdUCJhI3H1H6BO7QOcA5QjcPmC7F1BND58DVAKMFqwcMIWfzQ7xc1+QQICYvh8wnXu+uB3uqo4BsK0qJg67Jui2wso1mAsmpkpjsoD6ROgU7JYHCkAnvrrDPUY4YDP7u/diAbhzbr8Qf8mMOlD2rw6oIjuh7vlnrhhRUwIHQEXhTZ9ABCHX7RETQAG4GYUoAF3lXaWjhZ8ApnTn+kI8DOeA7hemfoC7bnDrjpfiACWyumDrmPjd4GbcxYrfADhBqBiMAbCJupi1f+OAKhgjvnOAWwLd+Q5W/BRQ4nAhqALoGlwHA7cXuGmAqPWvHPBePv7UV2SmuIz8klQF4M6jL5/f/EReN6iERlv/BPC/Oz8cgE0SRIiuAKaEp+Y/AoTbDU4BycFBROHOCc4hCABT8MEthakJutGIONwXJWt1FaDnK3eTQ4Yhtxlyax0Dwd1GZ1P97jHmLjJT9TFjcBOCsKlQXT6vxKKqfwJwa707pnAUfQeJG9EIAKfA+nibBHEATtHKCdP74i+bU41OTQeEA5zoDQjELTU3gtBNcGN3tVHCOKAC6F6PrvwJYEqArkliHbBNhjgAU5WnkYm8nd42E8Q7QM36TffHAeisXn9imqAbfSoNooOQE6v+UDQAF3wUkO61aAdMVZ4aIAZA5wQ1BTBNsFZZVV6di3fAtqrbaYG6i8zGAUgAquqnWEwP2DbACgHZAzaVd48xQWja9OAAbNa1sjoGgOoFmPXuANRKbu0ff6ggpNLetGfA/P8CnQtQwhWAZ4jFU0qMO/4CZ1xf9Ul8jSgAAAAASUVORK5CYII="},{"name":"rgb-trns-stealth.png","bytes":951,"sha256":"78f77c53c200f79f4be2622cde2cbef4d7d53f23fac851fcf7385ca67756c5d3","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAIAAAA04/g9AAAABnRSTlMAAAAAAABupgeRAAADbElEQVR4nNWYQZbDMAhDe2yOP4t0XA9IcmeVH23qJO57gJEAv16/qKq13t/UL/Y9hYGwcje9GT29uh1/Au8iLZ2BQNjqkmptKBK6re2DDDnKB+2A5DHK7jOJ1yPW9AtCZN4fFIOJJHa6+ZRD6Pro8h7rhi7AuZChIMS+eZIl9XZ0AsyjgCtpUqHgCQepa1g7mKZf6MSdVJYoDIRls2aRewod6cAH3Al8Vl+QFcgHkfFyEzeFnPJMdaKZfkGbGMZLGrRuBi2inYO+dJClDWX3QjdxGi2bpcJA2D3tCzPn7bD981o4RYJAC2jmA9GBmfTHegyB5agkNJEDx4kMe6FyIZH1EaWgi0+4VqFX4maizP71tR7RSjjhZzkgU39ayeXA8R4Ofjl3EHh5ICgferrnNbAadL3/vDXyj7JeDPVyniwwUh0IwloY2Lqrd5NMv5CaUP6dSuqFJnGZbpxLFS3pG0SrE1wCemKzf9+BbqcbAo+ZbP6qnV7rtiDg27kR202kpH9ER60b6VwEWA7I5HHE5Togm9CwKAx6pPcP8iie4YB8DJPnjTinBDl/9EQ2816OnRB0mc9TJdAH4UA7k0yP26HHl5lXTAnSzdznm2lOiwRbgNebz1aY6ReEwAdKrP8U+QT6DvY9l525wrEUCbbdd9JJ80EXryCaKOvP7XTLJVr4zwMNOfsPJyCpDIQQe3eTxewm7LzrYk/vhQIfoIXsyGAyAUQ7fVzQ/LH689mhCkJh8Pqyi8b21X9kNAzErk26HSI9Zg3etxYM/2g/0Q6ESsy0e0HIvKsATDd00rvsB9Y1my1OPbkOuOIFTyRNYvgUtkMUgTAfA51J4+8japntHfY3ZB80TcOMRuNxdyCEHyqjoYo9oiSfx0hy+NOtRN9n6trt6MIvPisUBnZyD5UY7YBM9FmPCwNRAUJnSpyJ3z/G7uAGBDr8Yt8jSJzHYnQKyaRv72mxv9BDK8P8pBPIVRntgAu201kIuqFhgT6BKflBf9AOyIugwO/b0QM/FxKFwdli8R+UA2FUd3nFciCIo2Mw1IH3s2qHpCcQ6DFFqir0BHKAs0YR0EMrJWg+FgY6N2ZGcUfKzOC2D82B/Xn/7BYQ9PBL4ac7EFJ8JgzUgckEbNI39Kjn/AFCqr+uDIWEjvckNBavY9MmP3HwA/bSbvOxymDOAAAAAElFTkSuQmCC"},{"name":"rgba-16-adam7.png","bytes":1321,"sha256":"9894840fd1338771e219c3c0089c1bbb5337127a79da944a8ef59bf55dd1aaa7","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAEAYAAAGcFoO/AAAE8ElEQVR4nO1dQXIkIQyb182b8ro8LdlTLlNLYRkaYVknVzqZCUiyMaaB1/v99fX9/fPzf/v7O7Mv9ANPf4FQF3gYbGsBD8S/XyzrgAcivwtpFvAPXi+kgvEA5//aFvBYEABxuzfmu1S9AZ9c0BpwzgZV+FwDgxp4vAHnoQ9ScAyB2T84TkE+09kkwmsouMYLjjWAPhacD8m3DUY0Cs5BfmsDrhEh3Q2voeBcg27RwOcv6IHosyHHELiGguMI0Cm4Jg7QKDjvfm5AFS/oFweuCcXXZET9qmT0pJTuBef+cdALjjXgOg1cg8BxDUTjAa/Bh5wABaSufXVjfOKDukwnXUDfJpcKdBQC1kZ4OdNhBUSDnqwC9KU/UMCIWfTnOpY+G2BbsDop6wLRGKBnkyv2OgCBQZA3cSe5QDQWyAOgmxAFKzJ6HQ8qQL8+QF+hYtvFmqA8AFHJ1wUEXB/TC4bJICgPAMq4HADZWCC7MNImE4xKX0cJr64dBxXQth7QJg9AJ0H8hpMUMLJ1gQm+qyafCaIJkCwA9Tu0SQH65fAgADOfrw/E4vuyMgCgk576HZ8AgDLdriCiowhwcbTtbDD7XHY2qKMEcMuALABR5mfBsDwAKBB1O54EQA8IcOeW7Cgw822doDcBIOvzdQEBzxaq29FNMUCH+UkM0GU8qQA93x8AgKa+9ZWS3MPePhFqpwDdMnlyB317F6jf8YkCVhUhnwrX7TAYA0YAyCog6gI6SqCfo1J8YaRdDBh9Uds3RfkdIAEgqwB0ZUgOgFFH9ToeVICu708UEJV8fWCSJTF+wx8GAA2Ksi4wsjpAJDdMzACRXxvUiQngWWJ6k6PkKd9yMWDE8Oy5HAAzyevFguSGCTkAUOajrtFmGCwPABrt5QCY+b78KJCtCcooINoReQWsDofyLlCf8YdcoK71maKYj+sB89DJ0tkFFT2Am5yjtJoxm3iyAFbrQGgaZcKbbBrMzrD4wHSx4Hmiqx7uMb/pkcLZIcaWLICop2aLZCa+6NtRq3+vV1UVXxLL5gJZQfCB6WIPvR/p6aHYDWMokfZwsSRwtQJoIRSdBmY9OTtNtD0kgCjwT0cIC+ASAWQrgtkhwAIgC2Dm6Wglz7lAk4uVVj1+9H18YLpY8H7FVeIcAURuF0SJjhJuQZAjwIj43UOAiRfNAbKRxLOAywWQ9Xhn/81vGLZnix8fGxVAVBAWyiUR4Okx3QIQPz95da2AD0wXCxaCZp6+WhG0AC4TwK6xHp1W8oHpYsG9gah16L/dHtoYgg4hfGC6WHBzKEqcVwFFj4lZHctNuNg5QSjRzgHESsHokLFLYLabBLArydu1mGRbTADRiGGim1youlpIsi0SAdBQz++wLRQBss9nQvAQUWwtYFcF0ItBxXOAmYdHf2+PF30fAC0l8wHobh+6NwIVgCPCpQJYDe0mtukxcdnpJB+Qbjb4ShgaAaLER5/bHhbAjNDscyeHoqXgqEXrDbaHBTAjGo0QXhMQOSNotZSLDhl8YLrYw1emeAgQuT8z6rEuBYtHgNUQ7iGgyAkhu59bACLHxKGEohHFliwAVBirY7sFQBbAKpHoWsLoc3xguljwDvUo4ejfWQBkAaC1fDT0o3/HB6aLBW8MmT13XUCsFLyaxUcFYuIvEUA2VNuzm7wWjiZzrvWLnRW8Or2zMN6X2X/2OL/pz7ZUswAAAABJRU5ErkJggg=="},{"name":"rgba-16-plain.png","bytes":1213,"sha256":"88151c577815f5093fa7cf2386e3b28483d518dd285ec1b27e15ec72653b3f4b","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACAEAYAAADrEbMpAAAEhElEQVR4nO2dS3LcMAxEfTqfKafz0eyssklFAdAABYJ8qy7PaMYu9SOIjyx9fH7++vX19f39b/35+f/71vF/fv5bre9/+hxarR+acZbhXoOj4KAvAWCtyOgKVgFBmwGwIoC6ZViAoC8D4DXy6YuynweEoQCoySBGH5YEWgZj+PAcIGp4FASSwGYAsuUdkeDQLaB6jweIoX2AVXU+AAwDwBsZngChAbR5DuBdwSoA3tfRTSKA16hqMNCmCJBt6VoGY/gwAFQQvFuGCha6GIBs+af2DwCgCQB1BXuNIwIMAyBqrPoHkCMMzQFWGQ0AmwAQzfLVhhGGD7skTF3J7PGHRIBVVQERYdMIEF3RVVUDulkEUMtCdcbQf2JuUXEcHDUq2ifoPzG3qPh/AZaxaqQAgCYA1LLvCYSqrQRtAiC6t1sRwasAsBkA1spVVzZ9gkuuCFrVWkaLAbAMUss9+gGHJIFVHb3VOQSajABqiF81Q0CbAbAMjIJh/UEA0ASAutdHjSMHGJYERiNA1efQJgCq6nM1UgBCEwDZrD1b79MX2AyA1VUAK3/oRaGWYeztl/cBLBBoDQ+9RxDTv1NVvCpYPQ7jD50FRJM8gBjeB4h2/jB4eBUQXdkMf6Zo0w0iAOKQ+wNkjyMXuGQc7F3pALAZANUrlZbwIUmgOgaORhq0OQJUr2j6AcOvCHoyWN06AGDY3cIt46pe7z8xt6izDLS+KFv+AcBQANTj1JkCugiAVSuQ0H/oFUFeQ9X30U0iQLY6iAIECEMAiLaCq3IJ9CUAskmdGgn6T8htWvTACDWCAMCwi0Kr6nkMH/7o2KpcATCGRgDvL8jmBmgTANG9uypy9J+Q27ToquBsmQcIzQCojZ6qsg7jhwLwBES0BQwAmwFQ1cplz78kAlgGY/xh1wNEDaYlPLwKiBpHA+jQWUBVjkAj6LAyMAoMOnQcvOp1QNkMgKzBViQAgMNuEmUBoB6PvgSAOgSKGp6dKaAvAxCNDFWzBPRlAN6e8gHA8OcGeg3F6MvuD+D9HoAYPg3MNo5UcNBFAESN8kYENYL0n5hbtOjZwdEy0gIC3RyAbLmIDr9RpLVyowAByOYRIAsGDaHDhkHqng4IQ8tAr2HqzMALFtoMQNXKpwwcekVQtE9AOXjY4+OjxrLyL7kq2KvZhhG6CIAuowFgyMOjoxFCNRYANgfgyehoRMh+H1oMgDr0iRpsHQ8Am0UA1egqINAmAKKGepUkcGgOUBXao0MkdLMIYAHg/Twr/pD/C1BBIAIckgNkDQSAzQHIruRseYm+BED11M8LAhFg6DQwavyqLQR9GQBvSLd+Jgk87JlBUYBoBA2fBq4yEgCaI0DWkOzWAQDNESC7krPJHwBsBoA3IkSrAJLAoeNg74qPHkcEaAageqVWVxXoywBYKzea7EWP6z8xt6j41DDv+0/GkgMc2ghStwZygM0AqF7x6uvoywB4V7g63AGAQ58cqkYKADj8kTHs7Yf9b2B16EeHNYKiHb3sbAHdJAKoIR/DD7kmUG0RZzuI6Odi/Q2ao7/pT0xGyQAAAABJRU5ErkJggg=="},{"name":"rgba-8-adam7.png","bytes":1130,"sha256":"8a709961465e66f5af83e565bb079c377399d806ecf7457f07e34b791633b930","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAYAAAHMhl/8AAAEMUlEQVR4nOVcW44jMQjM6fZMc7o9WjxfI1mIAtqPIpAPa7LpxKYeBqxs9+vfz//3NIYcL3Th8QdIS+zFEJphL8gR4WEvyP0lTBTw4nmiLvoBcnB2hj0UhCDDappLXZ9gnJhgaWgsvnc5eDzBOAlhKQL5hWUI710Sj0A4osLSBEc207IPjmymLQhLoR+d4AiJR1LakQhyOPj7xxErLxvpCISRBuGID7YgLEv4ORMcVSHPB/m7cZuD7QiO1cZtCNsqLE1wtNnejmCZA80LWxOviIACuTpeWcilhlTUlgT0YR0VKIyg3mQrP60yoJmPygCd/pmBEfh7lQEK3R4D80jLhCmJSLqengc0020V+R0JNB/QA6AmI62jSc+EKR1RyhaUAWheoAegUU+tBXQjWiakB4CQp+wCWnHSDiYpmVCjn56I6IsjBlL7gZQ8gArRVeQeAyODAbRgSgDpeYA2LBNSz4ZWV3w9AGtBWiLyjEgJAKFOa0goTKDDaWo1tF5fD0A7FVFTcUoAGnppxOsBoCBSMyHtXOAtSpNgZoGaijXkKXkAeeE6A2mFSHqAitxigKb/HABKwfRaMD4pEaUxQG3PrV/w0yW4vrhkwGOCwoA04FX0mgfmAKgMaBJQ23Ka6TwPpDQknubUg4lkYnzN0QydjOgSWBmRwgBVf8mARn1KOU5hAGlP84B2MWUXaAteD0BbnFoNEf20XYDopnlgRixf0wKQ1NN8YP1gQfeAVxWve0BbmCpBWgDjE84FKAh6Of6YnhDJQZPgOvInElwPgL4oCmDWnM6AZb7IoSWFvdMEeHkI5aay4P8I8HohlKZKA7ccECkKVuksNdD/J/UUL7/3kQMiHbm1ZdpuAYuMUZ2ASAXQ3qd1rAwHIIARR5QnACmNvtSqJFp3mCGQpRX3CEBAI1ujVRm0VLbKYrkRucMv4ogWBFjdoLUFyhMgVX9/Ux7wbmzylJ8/V5YAS3UErqUDNPAaaA14WSLQT+UzsEhr3MIBFgGWS1pUAa/0oc+kAzhJAFJ8dFEbEeApLwnQiHh3Pwx5oEsTEFEb/S2fDyIPeoh0g20IiOx7VC7LEvAEQCv7awR420F7r3RpfPq4m1YnQc0BEnjLA1CUAO0LnhtatsJoa0QI+/gRvYsoclhqS4DmjNKgJQFSbc8JcpLWDkC2H10dYL2WJLTYEtbzP62S1+owtFrySiuvOUBe9PZ+efDSAUhZyx3lnWA9frVl4xMhAFnfKpWlCbD2eKRBkq9LjehtrG0TYqQV1gbqHcoNdMcEckS780DkiQ5WWWzTCSLwX7UFLLW166WBRx3gWbzFFoiWPsshpQnQ1Lf6fssprcrgk0RXngAPJDorzNdaOMDrCbT3yhOAen1kf/ReCwIkGJTk2jlAA2z1Ay3Ulw6I9vylAUcIQBm/Re+PCBgBArzPlBy/h0Rf9VoV7aoAAAAASUVORK5CYII="},{"name":"rgba-8-plain.png","bytes":991,"sha256":"3173be41c21a0785b50c850b8f44d95dd186f7a86177ae946d0ee4a04ce614ee","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"iVBORw0KGgoAAAANSUhEUgAAAEAAAACACAYAAAC7gW9qAAADpklEQVR4nOWdUY7bQAxD93Q9U0/Xo9n9KjAQRErTPz5/GJs42QX4xJE4aez+/Pr95zmOtzyv59/jqO9/E48fI64K7wQrOJEAaiVVhR2QeADVAW5pVCCxADqR55um16MhTABcI4wVXQF0YpQTMMI7ANO4UxDim+A08tAuqEtgu+YxILoccDP3sQA6N5xAECHoHwBVYQege4yeAhsYqCA0Jb544QqAg9AtDQcrDsA0Al1GiAbgKtyJwzmginPPcT3B9YAb0QgAquu7cBQr/ATghKlIHC98csDNNIh2gkuCU0B6qA5w49DtGxAO2Mx2lQswAJRY54poAG78nRA2yyT+8wA16raJEPeBiKs2IhfcfiJ0E5njd4OfyAJdE9ykvdseEfmp8FR1JIAqUMGofygagFv3ShyqByhRzvaYRqj+bbB7s3PFQ5kCz+XzCVpkFN5OgfjqnwA6e0/nEMc2B1QImEjcfUfoE7tA5wDlCNw+YLsXUE0PnwNUAowWrBwwhZ/NDvFzX5BAgJi+HzCde764He6qjgGwrSomDrsm6LbCyjWYCyamSmOygPpE6BTslgcKQCe+usM9RjhgM/u792IBuHNuvxB/yYw6UPavDqgiO6Hu+WeuGFFTAgdAReFNn0AEIdftERNAAbgZhSgAXeVdpaOFnwCmdOf6QjwM54DuF6Z+gLtucOuOl+IAJbK6YOuY+N3gZtzFit8AOEGoGIwBsIm6mLV/44AqGCO+c4BbAt35Dlb8FFDicCGoAugaXAcDtxe4aYCo9a8c8F4+/tRXZKa4jPySVAXgzqMvn9/8RF43qIRGW/8E8L87PxyATRJEiK4ApoSn5j8ChNsNTgHJwUFE4c4JziEIAFPwwS2FqQm60Yg43Bcla3UVoOcrd5NDhiG3GXJrHQPB3UZnU/3uMeYuMlP1MWNwE4KwqVBdPq/Eoqp/AnBrvTumcBR9B4kb0QgAp8D6eJsEcQBO0coJ0/viL5tTjU5NB4QDnOgNCMQtNTeC0E1wY3e1UcI4oALoXo+u/AlgSoCuSWIdsE2GOABTlaeRibyd3jYTxDtAzfpN98cB6Kxef2KaoBt9Kg2ig5ATq/5QNAAXfBSQ7rVoB0xVnhogBkDnBDUFME2wVllVXp2Ld8C2qttpgbqLzMYBSACq6qdYTA/YNsAKAdkDNpV3jzFBaNr04ABs1rWyOgaA6gWY9e4A1Epu7R9/qCCk0t60Z8D8/wKdC1DCFYBniMVTSow7/gJnXF/1SXyNKAAAAABJRU5ErkJggg=="},{"name":"webp-animated-alpha.webp","bytes":964,"sha256":"270899510d889eebb1cb3bb9025f9ab9fe89f3d16ce3609b8890d475f2a50f2b","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"UklGRrwDAABXRUJQVlA4WAoAAAASAAAAPwAAfwAAQU5JTQYAAAAAAAAAAABBTk1G+AEAAAAAAAAAAD8AAH8AAGQAAAJWUDhM3wEAAC8/wB8QDzB4YzS+6x8PkCvbtmlbtm3bdmT72bZt27Zt27Yi27axkfT5DxH9V+S2baODgaQDcZp+wuKwouu6ri8rVcGurRTP0xp48YJB2706t7wnb29xS93blIIm5FQpCaxk3VbdxbGeZKw4ZmPMulduoq8xdpQBIyhXd5CB+TxWc4UsXM8gchXFopYXjfpMeuWR5U5ktspjk1cq7EMaL8rLJZVLmG61Ufh5Ti42Zzp6Hvv38j6D9q9Yf+s3DLb+1Fn3ZQbdRlAcVwtf27ll3WvK0E6i/wvoI8BE+N1DVj0mR6PIoAakYzXZG0K+jCY9p9OvuoD+ugZpnIMuDEyfk8xbGt9/HLE9Qv9rn7D+awcY5NSKPl3nRSn/Nfp10Oh/rk65RHZuZd03vzE9abzGi54xfXe/eI8JCt/ntsp5q6dyblK5pV+Yzrl/obPvB0lEBS+6dFjM1RP6SnzKdH6yxjnvTLbd55aMffR1Zxtl7llKcH2NffJn8E/Mf5OnTGffoEyPoczZRbkgjnWxZNAhnL4n2lGKhhH/3mLe21La5JIzrirnQvj0/kP59ZTydZXCdzJi0Geq+JdiHk2miv8fJ+pfpvAf3mcf3W5qnKPvGudBvN/id8TgFIn6SoxMsUUHAEFOTUaQAQAAAAAAAAAAEQAAfwAAZAAAAlZQOEx3AQAALxHAHxAPMHhjNL7rHw+QLMm2aVtjzHFt2zafX8u2bdu2bdu2bbNl2zb/I6L/kfZZ5mguB7GkIndsRuhJe/aMrXdryVu9voHaN1WmkU5UVGxVc+uq1901+qY8hOUbOMoL/Ybx8jb2L60alzR/LVNXyKUmRnxEj1JY6oeZ/zlxOdwKqVRJVV3EFuuZ+pTnmyp9jj2/y7Yv0PKVbf6uFhfRZZh8V6rqVlvzUoM7aPQ8xjgwdRdXPOThNA6ox/bVuTuBn0ay+1T8n2ed46xMJzg+RdEb9nqMeR7S6ke8ss9K1LQ1V1Hgr+32sfaztfuCtm/m9S82YawVeKLbe9FlHFrc5PI6dCmoPkna8UyH9yulCi4cRI9HlvtYpfMttqNtuYsie3hrC2afZnxdux6NP0Kjxyx+DVMzOGsHzkWjkyvbJWu8F8sNYXRPzGzNViV5KpCdhfBf/PEYn1fgtrHXZCzfRYfJbJ3Fzksw/64FXbfVX237My18I5wQAA=="},{"name":"webp-empty-exif-valid-alpha.webp","bytes":566,"sha256":"6bcaebbbd97dfc1c4434cfbd3b61be754d64453661a91cdb174e996f2385828b","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"UklGRi4CAABXRUJQVlA4WAoAAAAYAAAAPwAAfwAAVlA4TLEBAAAvP8AfEA8weGM0vusfD5Ar27ZpW7Zt23Zk+9m2bdu2bdu2Itu2sZD0j4joP9mkjUOgPcXisNBaa72sVMKurYznaQUvXnC03ath2Xt6e0tA3dtMQRM6VUqBlQqsujNve9LY22RjLGDlJglj7JgBI5irO2hgvoaaK7RwPUfkKsaiVsCoz9Qrj5Y70WwpYfJKxipNQ14uVS7h3WojRT6ni815R89T8PI+R/tXAlq/4dj6U0OryxzdRjCOq6lyu4J1r5mhnWjsAgkBJhS5h1Y9pqNRNKgBdaymvSH0ZTT1nC5ALlDQNYgKunCYPqfMWxxvx5HtEQ1rn0i4doAjp5bWXReQ8p/Z60Ad52rmEu3cKuHmN96TxlPKM9539wvoNoFa3Zawsh5ZpGroF0a7XtDRgxRRIeDSYer1REHiU975yUxgZ9p2X0DGPgl3tjFzzzLB9RXc9Of4Z0xNnvLOvsFMj2Hm7GIu+FMXS44O4Rom2jFFw8i/t4DZbZk2uXTGlboa8/b+w/x6ynxdRXeNOPpMZVbuYUymUts46rqM98L7Ctxu0trvtPOFhsXvyOAURX0lI1MFAEVYSUZWAAAATU0AKgAAAAgAAgExAAIAAAATAAAAJodpAAQAAAABAAAAOgAAAABDZWxzeXMgU3R1ZGlvIFRvb2wAAAABkoYAAQAAAAoAAABMAAAAAEFTQ0lJAAAAe30="},{"name":"webp-lossless-alpha.webp","bytes":454,"sha256":"9ab8e2462aceb7374ba998a5416b35f834fe7e44eff00047af9235ce21ec284e","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"UklGRr4BAABXRUJQVlA4TLEBAAAvP8AfEA8weGM0vusfD5Ar27ZpW7Zt23Zk+9m2bdu2bdu2Itu2sZD0j4joP9mkjUOgPcXisNBaa72sVMKurYznaQUvXnC03ath2Xt6e0tA3dtMQRM6VUqBlQqsujNve9LY22RjLGDlJglj7JgBI5irO2hgvoaaK7RwPUfkKsaiVsCoz9Qrj5Y70WwpYfJKxipNQ14uVS7h3WojRT6ni815R89T8PI+R/tXAlq/4dj6U0OryxzdRjCOq6lyu4J1r5mhnWjsAgkBJhS5h1Y9pqNRNKgBdaymvSH0ZTT1nC5ALlDQNYgKunCYPqfMWxxvx5HtEQ1rn0i4doAjp5bWXReQ8p/Z60Ad52rmEu3cKuHmN96TxlPKM9539wvoNoFa3Zawsh5ZpGroF0a7XtDRgxRRIeDSYer1REHiU975yUxgZ9p2X0DGPgl3tjFzzzLB9RXc9Of4Z0xNnvLOvsFMj2Hm7GIu+FMXS44O4Rom2jFFw8i/t4DZbZk2uXTGlboa8/b+w/x6ynxdRXeNOPpMZVbuYUymUts46rqM98L7Ctxu0trvtPOFhsXvyOAURX0lI1MFAA=="},{"name":"webp-lossless-exif.webp","bytes":916,"sha256":"42dff65beaf42588c17586e9870a352972f3c6bce18c912c41e8eee937038bf8","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"UklGRowDAABXRUJQVlA4WAoAAAAYAAAAPwAAfwAAVlA4TLEBAAAvP8AfEA8weGM0vusfD5Ar27ZpW7Zt23Zk+9m2bdu2bdu2Itu2sZD0j4joP9mkjUOgPcXisNBaa72sVMKurYznaQUvXnC03ath2Xt6e0tA3dtMQRM6VUqBlQqsujNve9LY22RjLGDlJglj7JgBI5irO2hgvoaaK7RwPUfkKsaiVsCoz9Qrj5Y70WwpYfJKxipNQ14uVS7h3WojRT6ni815R89T8PI+R/tXAlq/4dj6U0OryxzdRjCOq6lyu4J1r5mhnWjsAgkBJhS5h1Y9pqNRNKgBdaymvSH0ZTT1nC5ALlDQNYgKunCYPqfMWxxvx5HtEQ1rn0i4doAjp5bWXReQ8p/Z60Ad52rmEu3cKuHmN96TxlPKM9539wvoNoFa3Zawsh5ZpGroF0a7XtDRgxRRIeDSYer1REHiU975yUxgZ9p2X0DGPgl3tjFzzzLB9RXc9Of4Z0xNnvLOvsFMj2Hm7GIu+FMXS44O4Rom2jFFw8i/t4DZbZk2uXTGlboa8/b+w/x6ynxdRXeNOPpMZVbuYUymUts46rqM98L7Ctxu0trvtPOFhsXvyOAURX0lI1MFAEVYSUa0AQAATU0AKgAAAAgAAwEOAAIAAAAPAAAAMgExAAIAAAAVAAAAQodpAAQAAAABAAAAWAAAAABibHVlIHNreSwgPz8/PwAAbmFpLWRpZmZ1c2lvbi01LWZ1bGwAAAABkoYAAQAAAUkAAABqAAAAAEFTQ0lJAAAAeyJwcm9tcHQiOiAiYmx1ZSBza3ksIFx1NzY3ZFx1ODI3Mlx1ODg2M1x1NjcwZCIsICJ1YyI6ICJsb3dyZXMiLCAic2VlZCI6IDQyNDI0MiwgInN0ZXBzIjogMjgsICJ3aWR0aCI6IDY0LCAiaGVpZ2h0IjogMTI4LCAibW9kZWwiOiAibmFpLWRpZmZ1c2lvbi01LWZ1bGwiLCAidjRfcHJvbXB0IjogeyJjYXB0aW9uIjogeyJiYXNlX2NhcHRpb24iOiAiYmx1ZSBza3ksIFx1NzY3ZFx1ODI3Mlx1ODg2M1x1NjcwZCIsICJjaGFyX2NhcHRpb25zIjogW3siY2hhcl9jYXB0aW9uIjogImJsdWUgZXllcyIsICJjZW50ZXJzIjogW3sieCI6IDAuNSwgInkiOiAwLjV9XX1dfX19AA=="},{"name":"webp-lossy-alpha.webp","bytes":548,"sha256":"5ceebb778633ebb13a63abf04cbdf29605f4760adf280f2f6a64aaba6796ba8c","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"UklGRhwCAABXRUJQVlA4WAoAAAAQAAAAPwAAfwAAQUxQSKkBAAABD9D/iAhIlmTbtK2Fa9v2vS3bNp9t27Zt27bZsm3btlUfEdF/skkbh0B7yuccLYQQovE2BaVVmEcpEtzdOeYUCWjsQE6hGtaEMLuXUuo2urVJwsdJjNME6hNC739oaFBdQd+3zMiBTFQ5jdgjYH00tajFcak+83mdhv42NH4vNXpJ7ZSCbg2Yj0cF7N1Hm5rynl+DLnlQ3CLeF1pLcAvgmOWqYZ4zRxUzAfNjOCYPZF7Vo00VEmq7MEOmU5+WCm5/p0vFVN+Hsi7S8JU0YwMVXSfrfjShkwbVUsKUm7R7Ksc3DzoUyuHUm95lC6jjrSAyn2P/OqodoeG4AVP0mma0EUwslVVREGbJu3svOu7JO6hAw+SeND9EQYPV9PmYgNFXqdSdsvLo8mYNsTk03lvCKS/ee04wt6ZRZYCGw4UKgiuZNknMjVUSwu5wGP6gpV68D4Qznc4zbUuZ+Ds09RPHzCsCerxldg6mO+M0tJvDzN1Hyc9oyg/eD4wZUy/Gqj4F/eQY24VpUMx870JzztKUxrxbBEh4GkZ1LKjMXUAzR/qdShet6Oc3CQBWUDggTAAAANAEAJ0BKkAAgAA+MRiLRCIhoRCEACADBLSAOwB+AAAJeN5ra+nTp06dOnTp06OAAP7rjl//+wd/Qd/Qd/qmf//NgVzXPuaAAAAAAAA="},{"name":"webp-lossy-exif.webp","bytes":992,"sha256":"c578a1b40f1b18bdddbcd18a98d77503b5f0b1324f56daf72f524e0d9c1c9575","expected":{"positivePrompt":"blue sky, 白色衣服","negativePrompt":"lowres","seed":424242,"steps":28,"model":"nai-diffusion-5-full","characters":1},"officialAlphaVerified":true,"base64":"UklGRtgDAABXRUJQVlA4WAoAAAAYAAAAPwAAfwAAQUxQSKkBAAABD9D/iAhIlmTbtK2Fa9v2vS3bNp9t27Zt27bZsm3btlUfEdF/skkbh0B7yuccLYQQovE2BaVVmEcpEtzdOeYUCWjsQE6hGtaEMLuXUuo2urVJwsdJjNME6hNC739oaFBdQd+3zMiBTFQ5jdgjYH00tajFcak+83mdhv42NH4vNXpJ7ZSCbg2Yj0cF7N1Hm5rynl+DLnlQ3CLeF1pLcAvgmOWqYZ4zRxUzAfNjOCYPZF7Vo00VEmq7MEOmU5+WCm5/p0vFVN+Hsi7S8JU0YwMVXSfrfjShkwbVUsKUm7R7Ksc3DzoUyuHUm95lC6jjrSAyn2P/OqodoeG4AVP0mma0EUwslVVREGbJu3svOu7JO6hAw+SeND9EQYPV9PmYgNFXqdSdsvLo8mYNsTk03lvCKS/ee04wt6ZRZYCGw4UKgiuZNknMjVUSwu5wGP6gpV68D4Qznc4zbUuZ+Ds09RPHzCsCerxldg6mO+M0tJvDzN1Hyc9oyg/eD4wZUy/Gqj4F/eQY24VpUMx870JzztKUxrxbBEh4GkZ1LKjMXUAzR/qdShet6Oc3CQBWUDggTAAAANAEAJ0BKkAAgAA+MRiLRCIhoRCEACADBLSAOwB+AAAJeN5ra+nTp06dOnTp06OAAP7rjl//+wd/Qd/Qd/qmf//NgVzXPuaAAAAAAABFWElGtAEAAE1NACoAAAAIAAMBDgACAAAADwAAADIBMQACAAAAFQAAAEKHaQAEAAAAAQAAAFgAAAAAYmx1ZSBza3ksID8/Pz8AAG5haS1kaWZmdXNpb24tNS1mdWxsAAAAAZKGAAEAAAFJAAAAagAAAABBU0NJSQAAAHsicHJvbXB0IjogImJsdWUgc2t5LCBcdTc2N2RcdTgyNzJcdTg4NjNcdTY3MGQiLCAidWMiOiAibG93cmVzIiwgInNlZWQiOiA0MjQyNDIsICJzdGVwcyI6IDI4LCAid2lkdGgiOiA2NCwgImhlaWdodCI6IDEyOCwgIm1vZGVsIjogIm5haS1kaWZmdXNpb24tNS1mdWxsIiwgInY0X3Byb21wdCI6IHsiY2FwdGlvbiI6IHsiYmFzZV9jYXB0aW9uIjogImJsdWUgc2t5LCBcdTc2N2RcdTgyNzJcdTg4NjNcdTY3MGQiLCAiY2hhcl9jYXB0aW9ucyI6IFt7ImNoYXJfY2FwdGlvbiI6ICJibHVlIGV5ZXMiLCAiY2VudGVycyI6IFt7IngiOiAwLjUsICJ5IjogMC41fV19XX19fQA="}]""") as List;
  for(final fixture in officialFixtures){
    testWidgets('native official metadata ${fixture['name']}',(tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral official metadata'))));
      final bytes=base64Decode(fixture['base64'] as String);
      final file=File('${root.path}/${fixture['name']}');await file.writeAsBytes(bytes);
      expect(sha256.convert(bytes).toString(),fixture['sha256']);
      await app.setWorkbenchPath(file.path);expect(app.workbenchImage,isNotNull);
      final params=app.workbenchImportedParams!;
      final actual=<String,Object?>{'positivePrompt':params.positivePrompt,'negativePrompt':params.negativePrompt,'seed':params.seed,'steps':params.steps,'model':params.model,'characters':app.workbenchCharacterCaptions.length};
      for(final entry in (fixture['expected'] as Map).entries){expect(actual[entry.key],entry.value,reason:'${fixture['name']}: ${entry.key}');}
      expect(await file.readAsBytes(),bytes);
      result('Native official metadata ${fixture['name']}',['metadata-import','tools']);
    });
  }
  testWidgets('native breadth backup different characters and repeat import',(tester) async {
    PositivePromptPreset preset(String prompt)=>PositivePromptPreset(id:'same-source',name:'Neutral preset',prompt:'blue square',createdAt:'2026-10-11T00:00:00Z',captions:[CharCaptionItem(enabled:false,name:'Neutral character',prompt:prompt,negativePrompt:'red coat',useCoords:true,x:0,y:1)]);
    await storage.setSettings(AppSettings(positivePromptPresets:[preset('blue coat'),preset('green coat')]));
    final service=DataBackupService(storage),archive=await service.createBackup({DataBackupCategory.promptPresets});
    await storage.setSettings(AppSettings());
    for(var i=0;i<2;i++){await service.importBackup(archive.path,{DataBackupCategory.promptPresets},confirmConfigurationOverwrite:false);}
    final cold=await Storage().getSettings();expect(cold.positivePromptPresets,hasLength(2));expect(cold.positivePromptPresets.map((p)=>p.id).toSet(),hasLength(2));
    expect(cold.positivePromptPresets.map((p)=>p.captions.single.prompt),['blue coat','green coat']);
    for(final p in cold.positivePromptPresets){expect(p.captions.single.name,'Neutral character');expect(p.captions.single.enabled,false);expect(p.captions.single.x,0);expect(p.captions.single.y,1);}
    result('Native backup distinct characters repeat-import identity',['backup','characters','styles']);
  });

  for(final scenario in ['200','401','empty']) {
    testWidgets('native flows translation $scenario',(tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:SafeArea(child:Text('Native translation')))));
      var requests=0;final server=await _flowLoopback();servers.add(server);
      server.listen((request) async {requests++;expect(request.uri.path,'/translate_a/single');expect(request.uri.queryParameters['q'],'蓝色方块');request.response.statusCode=scenario=='401'?401:200;request.response.headers.contentType=ContentType.json;request.response.write(scenario=='empty'?'[]':jsonEncode([[['blue square','蓝色方块',null,null]],null,'zh-CN']));await request.response.close();});
      app.settings.translateProvider='google';
      final output=await app.translatePreviewText('蓝色方块',target:'en',sourceLanguage:'auto');expect(output.ok,scenario=='200');expect(app.busy,false);expect(requests,1);
      if(scenario=='200'){expect(output.text,'blue square');expect(output.sourceLanguage,'zh-CN');}
      expect((await app.translatePreviewText('  ',target:'en')).ok,false);expect(requests,1);
      result('Native translation $scenario',['translation']);
    });
  }
  for(final scenario in ['200','retry','timeout']) {
    testWidgets('native flows online gallery $scenario',(tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:SafeArea(child:Text('Native gallery')))));
      var requests=0;final server=await _flowLoopback();servers.add(server);
      server.listen((request) async {requests++;expect(request.uri.path,'/posts.json');expect(request.uri.queryParameters['tags'],'blue_square rating:g');if(scenario=='timeout')return;request.response.statusCode=scenario=='retry'&&requests==1?503:200;request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode([{'id':123,'preview_file_url':'https://example.test/blue.png','large_file_url':'https://example.test/blue.png','file_url':'https://example.test/blue.png','image_width':32,'image_height':32,'rating':'g','tag_string_artist':'neutral_artist','tag_string':'blue_square neutral_artist'}]));await request.response.close();});
      final client=IOClient(HttpClient());final gallery=OnlineGalleryService(client:client,requestTimeout:Duration(milliseconds:scenario=='timeout'?150:3000));
      try {
        if(scenario=='timeout'){final clock=Stopwatch()..start();await expectLater(gallery.search(source:OnlineGallerySource.danbooru,query:'blue_square'),throwsA(isA<Exception>()));expect(clock.elapsedMilliseconds,lessThan(2500));expect(requests,1);}
        else{final page=await gallery.search(source:OnlineGallerySource.danbooru,query:'blue_square');expect(page.items.single.id,'123');expect(page.items.single.author,'neutral_artist');expect(page.items.single.cover.width,32);expect(requests,scenario=='retry'?2:1);}
      }finally{client.close();}
      result('Native gallery $scenario',['online-gallery']);
    });
  }
  for(final scenario in ['manifest','fallback','unavailable']) {
    testWidgets('native flows update $scenario',(tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:SafeArea(child:Text('Native update')))));
      var requests=0;final server=await _flowLoopback();servers.add(server);
      server.listen((request) async {requests++;await request.drain<void>();
        if(request.uri.path.endsWith('latest.yml')){request.response.statusCode=scenario=='manifest'?200:503;request.response.write('version: 99.0.0\n');}
        else {expect(request.uri.path,endsWith('/releases/latest'));request.response.statusCode=scenario=='unavailable'?503:200;request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'tag_name':'v99.0.1','html_url':'https://github.com/2786886095/novelai-image-desktop/releases/tag/v99.0.1','assets':[]}));}
        await request.response.close();});
      final client=IOClient(HttpClient());
      try{final update=await checkAppUpdateWithClient(client,isAndroid:false);expect(update.hasUpdate,scenario!='unavailable');
        if(scenario=='unavailable'){expect(update.error,'network');expect(requests,4);}else{expect(update.latestVersion,scenario=='manifest'?'99.0.0':'99.0.1');expect(requests,scenario=='manifest'?1:3);}}
      finally{client.close();}result('Native update $scenario',['updates']);
    });
  }
  for(final scenario in ['batch','batch-cancel','comic-503','artist-promote']) {
    testWidgets('native flows durable generation $scenario',(tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:SafeArea(child:Text('Native durable generation')))));
      var posts=0;final server=await _tlsLoopback();servers.add(server);final image=im.Image(width:64,height:64);im.fill(image,color:im.ColorRgb8(0,0,255));final bytes=im.encodePng(image),zip=ZipEncoder().encode(Archive()..addFile(ArchiveFile('image.png',bytes.length,bytes)));
      server.listen((request) async {if(await _serveAccountVerification(request))return;posts++;expect(request.uri.path,'/ai/generate-image');expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');final body=jsonDecode(await utf8.decoder.bind(request).join()) as Map;expect(body['action'],scenario=='batch'?'img2img':'generate');request.response.statusCode=scenario=='comic-503'?503:200;request.response.headers.set('content-type','application/zip');request.response.add(zip);await request.response.close();});
      await _activateNeutralAccount(app,server.port);app.settings.streamPreviewEnabled=false;final params=GenerateParams(positivePrompt:'blue square',width:64,height:64,seed:123,seedMode:'fixed');
      if(scenario=='batch-cancel'){await expectLater(app.generateBatchRedrawItems(sourceBytes:await source.readAsBytes(),itemParams:params,itemExtras:GenerateExtras(),strength:.4,groupName:'Neutral batch',cancelled:()=>true),throwsA(isA<Exception>()));expect(posts,0);expect(app.history,isEmpty);}
      else if(scenario=='batch'){final items=await app.generateBatchRedrawItems(sourceBytes:await source.readAsBytes(),itemParams:params,itemExtras:GenerateExtras(),strength:.4,groupName:'Neutral batch');expect(items.single.feature,'batch-redraw');expect(await File(items.single.filePath).readAsBytes(),bytes);expect((await Storage().getHistory()).length,1);expect(posts,1);}
      else if(scenario=='comic-503'){await expectLater(app.generateComicPanel(panelParams:params,panelExtras:GenerateExtras(),projectTitle:'Neutral comic'),throwsA(isA<Exception>()));expect(posts,1);expect(await storage.getHistory(),isEmpty);}
      else{final recipes=drawArtistRecipes(pool:const [ArtistTagRecord(1,'neutral_artist',123)],count:1,minArtists:1,maxArtists:1,drawSeed:123);expect(recipes.single.artists,['neutral_artist']);params.positivePrompt=recipes.single.prompt;
        final temporary=await app.generateArtistLabTemporary(panelParams:params,panelExtras:GenerateExtras());expect(await File(temporary.filePath).exists(),true);expect(await storage.getHistory(),isEmpty);final saved=await app.saveArtistLabFavorite(temporary);expect(saved.feature,'artist-lab');expect(await File(temporary.filePath).exists(),false);expect(await File(saved.filePath).readAsBytes(),bytes);expect((await Storage().getHistory()).length,1);expect(posts,1);}
      result('Native durable generation $scenario',[scenario.startsWith('batch')?'batch':scenario.startsWith('comic')?'comic':'random-artists','works']);
    });
  }

  testWidgets('native flows full phone navigation',(tester) async {
    final previousErrorHandler=FlutterError.onError;FlutterError.onError=(details){print('NATIVE_LAYOUT_ORIGINAL_ERROR:${details.exceptionAsString()}');print('NATIVE_LAYOUT_ORIGINAL_STACK:${details.stack}');previousErrorHandler?.call(details);};addTearDown(()=>FlutterError.onError=previousErrorHandler);
    final server=await _flowLoopback();servers.add(server);server.listen((request) async {await request.drain<void>();request.response.headers.contentType=ContentType.json;request.response.write('[]');await request.response.close();});
    app.booted=true;app.needsNetworkOnboarding=false;
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const NovelAIApp()));await tester.pumpAndSettle(const Duration(milliseconds:100),EnginePhase.sendSemanticsUpdate,const Duration(seconds:10));
    var shell=tester.widget<StudioAdaptiveShell>(find.byType(StudioAdaptiveShell));expect(shell.destinations.length,15);final labels=shell.destinations.map((d)=>d.label).toList();
    for(var index=0;index<labels.length;index++){
      final nav=find.byKey(const ValueKey('studio-phone-navigation'));expect(nav,findsOneWidget);
      final direct=find.descendant(of:nav,matching:find.text(labels[index]));
      if(direct.evaluate().isNotEmpty){await tester.tap(direct.hitTestable());}
      else{await tester.tap(find.descendant(of:nav,matching:find.text(shell.moreLabel)).hitTestable());await tester.pumpAndSettle();final destination=find.descendant(of:find.byType(BottomSheet),matching:find.text(labels[index]));await tester.ensureVisible(destination);await tester.pumpAndSettle();await tester.tap(destination.hitTestable());}
      await tester.pumpAndSettle(const Duration(milliseconds:100),EnginePhase.sendSemanticsUpdate,const Duration(seconds:10));shell=tester.widget<StudioAdaptiveShell>(find.byType(StudioAdaptiveShell));expect(shell.selectedIndex,index);expect(tester.takeException(),isNull,reason:labels[index]);
    }
    result('Native phone all15 navigation',['navigation']);
  });

}
