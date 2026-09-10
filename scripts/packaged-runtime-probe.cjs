// Executed by the packaged Electron binary, not by a development Node process.
const {createRequire} = require('node:module');
const path = require('node:path');
const load = createRequire(path.join(path.resolve(process.argv[2]), 'package.json'));
(async () => {
  console.log('PACKAGED_PROBE_START',process.platform,process.arch);
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
