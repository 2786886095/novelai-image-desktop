// Executed by the packaged Electron binary, not by a development Node process.
const {createRequire} = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const load = createRequire(path.join(path.resolve(process.argv[2]), 'package.json'));
(async () => {
  console.log('PACKAGED_PROBE_START',process.platform,process.arch);
  const appRoot=path.resolve(process.argv[2]);
  const checker=path.join(appRoot+'.unpacked','scripts','artist-detective-check.py');
  if(!fs.existsSync(checker)||!fs.readFileSync(checker,'utf8').includes('DETECTIVE_CHECK_OK:'))throw Error('Packaged model validation script missing');
  for(const name of ['detective-models.js','detective-runtime-check.js'])if(!fs.existsSync(path.join(appRoot,'dist-electron','electron','ipc',name)))throw Error('Packaged model management module missing: '+name);
  console.log('PACKAGED_DETECTIVE_VALIDATION_OK');
  const sharp = load('sharp');
  const png = await sharp({create:{width:3,height:2,channels:3,background:'#7047d8'}}).png().toBuffer();
  const metadata = await sharp(png).metadata();
  if (metadata.width !== 3 || metadata.height !== 2) throw Error('Packaged image codec mismatch');
  console.log('PACKAGED_SHARP_OK');
  const ort = load('onnxruntime-node'); // Loads the architecture-specific native binding.
  if (!ort.InferenceSession || !ort.Tensor) throw Error('Packaged ONNX runtime missing');
  console.log('PACKAGED_ONNX_OK');
  const transformers = load('@huggingface/transformers');
  if (typeof transformers.pipeline !== 'function') throw Error('Packaged scorer pipeline missing');
  console.log('PACKAGED_RUNTIME_OK', process.platform, process.arch, 'sharp', sharp.versions.sharp, 'PNG 3x2', 'ONNX', 'transformers');
})().catch(error => { console.error(error); process.exitCode=1; });
