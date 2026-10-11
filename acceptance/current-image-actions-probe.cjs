const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');
const { app } = require('electron');
const root = path.resolve(process.argv[2]);
const report = path.resolve(process.argv[3]);
fs.mkdirSync(path.dirname(report), { recursive: true });
assert.equal(fs.existsSync(report), false, 'Never overwrite completed evidence');
const profile = fs.mkdtempSync(path.join(path.dirname(report), 'image-actions-profile-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
const evidence = { source: root, sourceSha: process.argv[4], platform: process.platform,
  runtime: process.versions, kind: 'integration', paidCalls: 0, visibleWindows: 0,
  desktopInputInjection: 0, provider: 'isolated-loopback-fixture-not-production',
  fixtureSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  cases: [], requests: [], pass: false };
let server, mode = 'success';
app.whenReady().then(async () => {
  try {
    const req = require('node:module').createRequire(path.join(root, 'package.json'));
    const store = req('./dist-electron/electron/ipc/store.js');
    const nai = req('./dist-electron/electron/ipc/nai.js');
    const edit = req('./dist-electron/electron/ipc/openai-image-edit.js');
    const types = req('./dist-electron/src/types.js');
    const { PNG } = req('pngjs');
    const JSZip = req('jszip');
    function solid(width, height, rgb) {
      const image = new PNG({ width, height });
      for (let pixel = 0; pixel < image.data.length; pixel += 4) {
        image.data[pixel] = rgb[0]; image.data[pixel + 1] = rgb[1];
        image.data[pixel + 2] = rgb[2]; image.data[pixel + 3] = 255;
      }
      return PNG.sync.write(image);
    }
    async function zipped(bytes) { const zip = new JSZip(); zip.file('image_0.png', bytes); return zip.generateAsync({ type: 'nodebuffer' }); }
    const original = solid(832, 1216, [30, 100, 200]);
    const generated = solid(832, 1216, [200, 110, 40]);
    const generatedZip = await zipped(generated);
    const upscaledZip = await zipped(solid(1664, 2432, [200, 110, 40]));
    const mask = new PNG({ width: 832, height: 1216 });
    for (let y = 448; y < 768; y++) for (let x = 256; x < 576; x++) {
      const pixel = (y * mask.width + x) * 4;
      mask.data[pixel] = mask.data[pixel + 1] = mask.data[pixel + 2] = mask.data[pixel + 3] = 255;
    }
    const maskBytes = PNG.sync.write(mask);
    server = http.createServer((request, response) => {
      const chunks = []; request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        try {
          const url = new URL(request.url, 'http://127.0.0.1');
          const allowed = ['/ai/generate-image', '/ai/upscale', '/ai/augment-image', '/v1/images/edits'];
          if (!allowed.includes(url.pathname)) {
            evidence.requests.push({ path: url.pathname, status: 404, method: request.method });
            response.writeHead(404); response.end('{}'); return;
          }
          assert.equal(request.method, 'POST');
          const isEdit = url.pathname === '/v1/images/edits';
          assert.equal(request.headers.authorization, 'Bearer ' + (isEdit ? 'neutral-edit-fixture-token' : 'neutral-fixture-token'));
          const bytes = Buffer.concat(chunks);
          let payload;
          if (isEdit) {
            const multipart = bytes.toString('latin1');
            assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
            for (const field of ['model', 'prompt', 'image', 'mask']) assert.match(multipart, new RegExp('name="' + field + '"'));
            assert.equal(multipart.includes('neutral-edit-fixture-token'), false);
          } else {
            payload = JSON.parse(bytes.toString('utf8'));
            const p = payload.parameters ?? payload;
            if (p.image) { const upload = PNG.sync.read(Buffer.from(p.image, 'base64')); assert.equal(upload.width, p.width); assert.equal(upload.height, p.height); }
            if (payload.action === 'infill') { const uploadedMask = PNG.sync.read(Buffer.from(p.mask, 'base64')); assert.equal(uploadedMask.width, p.width); assert.equal(uploadedMask.height, p.height); }
          }
          const status = mode === 'server-error' ? 503 : 200;
          const params = payload?.parameters ?? payload;
          evidence.requests.push({ path: url.pathname, status, method: request.method, mode,
            model: payload?.model, action: payload?.action, width: params?.width, height: params?.height,
            strength: params?.strength, noise: params?.noise, upscaledEnhance: params?.upscaled_enhance,
            reqType: params?.req_type, defry: params?.defry, imageUpload: Boolean(params?.image), maskUpload: Boolean(params?.mask),
            multipart: isEdit, bytes: bytes.length });
          if (status !== 200) { response.writeHead(status, { 'content-type': 'application/json' }); response.end('{"message":"fixture rejection, never resubmit"}'); }
          else if (isEdit) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ b64_json: generated.toString('base64') }] })); }
          else { response.writeHead(200, { 'content-type': 'application/zip' }); response.end(url.pathname === '/ai/upscale' ? upscaledZip : generatedZip); }
        } catch (error) { evidence.serverError = error.stack; response.writeHead(500); response.end('{}'); }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const output = path.join(profile, 'output');
    for (const [key, value] of Object.entries({ outputDir: output, imageBaseUrl: base, apiBaseUrl: base,
      proxyMode: 'direct', allowCustomEndpoint: false, allowCustomEndpointFallback: false })) store.setSetting(key, value);
    store.setToken('neutral-fixture-token');
    const sourcePath = path.join(profile, 'neutral-source.png'); fs.writeFileSync(sourcePath, original);
    assert.equal((await nai.loadImageFromPath(sourcePath)).ok, true);
    const params = { ...types.DEFAULT_PARAMS, model: 'nai-diffusion-5-full', effort: 'high', width: 832, height: 1216,
      positivePrompt: 'A blue square on a white background.', negativePrompt: '', seedMode: 'fixed', seed: 246813579 };
    function point(image, x, y) { return Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)); }
    async function invoke(name, action, expected, check, requestMode = 'success') {
      mode = requestMode; const before = store.getHistory().length;
      const requestStart = evidence.requests.length; const result = await action();
      const requests = evidence.requests.slice(requestStart).filter(r => r.method === 'POST');
      assert.equal(result.ok, expected, result.message);
      assert.equal(requests.length, 1, 'Exactly one generation-shaped POST per action');
      assert.equal(store.getHistory().length - before, expected ? 1 : 0);
      const items = result.items ?? (result.item ? [result.item] : []);
      assert.equal(items.length, expected ? 1 : 0);
      const files = items.map(item => {
        assert.equal(path.relative(output, item.filePath).startsWith('..'), false);
        const bytes = fs.readFileSync(item.filePath), image = PNG.sync.read(bytes);
        if (check) check(image, requests[0], item);
        return { path: item.filePath, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), width: image.width, height: image.height };
      });
      evidence.cases.push({ name, pass: true, ok: result.ok, expected, attempts: requests.length,
        historyBefore: before, historyAfter: store.getHistory().length, files, message: result.message, request: requests[0] });
    }
    const normalImage = (image, request) => { assert.equal(image.width, 832); assert.equal(image.height, 1216); assert.deepEqual(point(image, 0, 0), [200, 110, 40, 255]); assert.equal(request.action, 'img2img'); assert.equal(request.noise, 0); };
    await invoke('Image-to-image uploads source and saves exactly one image/history row', () => nai.generateI2I(params, { strength: 0.4, noise: 0.9, extraNoiseSeed: 246813578 }), true, (image, request, item) => { normalImage(image, request); assert.equal(request.strength, 0.4); assert.equal(item.actualSeed, 246813579); });
    await invoke('Enhance forwards its mode without forwarding removed noise control', () => nai.generateI2I(params, { strength: 0.1, noise: 0.8, extraNoiseSeed: 246813578, upscaledEnhance: true }), true, (image, request) => { normalImage(image, request); assert.equal(request.upscaledEnhance, true); });
    await invoke('NovelAI inpaint uploads a mask and preserves pixels outside selection', () => nai.inpaintImage(params, 'nai-diffusion-5-inpainting', maskBytes.toString('base64'), 1, 0.9), true, (image, request) => { assert.equal(image.width, 832); assert.equal(image.height, 1216); assert.equal(request.action, 'infill'); assert.equal(request.maskUpload, true); assert.equal(request.noise, 0); assert.deepEqual(point(image, 0, 0), [30, 100, 200, 255]); assert.deepEqual(point(image, 416, 608), [200, 110, 40, 255]); });
    await invoke('Director colorize uploads the source and saves a processed result', () => nai.augmentImg('colorize', { ...types.DEFAULT_AUGMENT_OPTIONS, colorizePrompt: 'warm orange', defry: 9 }), true, (image, request) => { assert.equal(request.reqType, 'colorize'); assert.equal(request.defry, 5); assert.equal(image.width, 832); assert.equal(image.height, 1216); });
    await invoke('Upscale validates a real 2x ZIP output and saves one history row', () => nai.upscaleImg(2, 'nai-upscale'), true, image => { assert.equal(image.width, 1664); assert.equal(image.height, 2432); });
    await invoke('Inpaint 503 never repeats a possibly billed POST or saves phantom history', () => nai.inpaintImage(params, 'nai-diffusion-5-inpainting', maskBytes.toString('base64'), 1), false, undefined, 'server-error');
    const editInput = { source: original, mask: maskBytes, prompt: 'Turn the selected square orange.',
      settings: { baseUrl: base + '/v1', model: 'fixture-edit-model', quality: 'high', inputFidelity: '', size: 'auto' },
      apiKey: 'neutral-edit-fixture-token', pasteBack: true, growPx: 0, featherPx: 0, matchColors: false };
    mode = 'success'; let start = evidence.requests.length;
    const edited = await edit.runOpenAIImageEdit(editInput, { route: async () => ({ proxy: false }) });
    assert.equal(edited.batch.complete, true); assert.equal(edited.images.length, 1);
    const resultImage = PNG.sync.read(edited.images[0]);
    assert.deepEqual(point(resultImage, 0, 0), [30, 100, 200, 255]);
    assert.deepEqual(point(resultImage, 416, 608), [200, 110, 40, 255]);
    assert.equal(evidence.requests.slice(start).filter(r => r.path === '/v1/images/edits').length, 1);
    assert.equal(JSON.stringify(edited.request).includes(editInput.apiKey), false);
    const editedPath = path.join(profile, 'openai-edited.png'); fs.writeFileSync(editedPath, edited.images[0]);
    evidence.cases.push({ name: 'Independent OpenAI edit performs one multipart POST; source geometry/outside pixels preserved; summary has no key', pass: true, attempts: 1, output: editedPath, request: edited.request });
    mode = 'server-error'; start = evidence.requests.length;
    const failed = await edit.runOpenAIImageEdit(editInput, { route: async () => ({ proxy: false }) });
    assert.equal(failed.batch.complete, false); assert.equal(failed.images.length, 0);
    assert.equal(evidence.requests.slice(start).filter(r => r.path === '/v1/images/edits').length, 1);
    evidence.cases.push({ name: 'OpenAI edit 503 never retries or returns phantom images', pass: true, attempts: 1, outputImages: 0, error: failed.batch.error });
    assert.equal(evidence.serverError, undefined);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'), crypto.createHash('sha256').update(original).digest('hex'));
    evidence.sourceImageUnchanged = true; evidence.pass = true;
  } catch (error) { evidence.error = error.stack; console.error(error.stack); }
  finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(report, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ pass: evidence.pass, paidCalls: 0, visibleWindows: 0, cases: evidence.cases.map(c => ({ name: c.name, pass: c.pass, attempts: c.attempts })) }));
    app.exit(evidence.pass ? 0 : 1);
  }
});
