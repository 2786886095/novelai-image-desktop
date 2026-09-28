"""Offline runtime acceptance: integrity, real GPU load, one local encode. No API calls."""
import os
import sys
import json
import tempfile
import threading
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'

def main():
    root = Path(sys.argv[1]).resolve(strict=True)
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    for name in manifest['files']:
        target = (root / name).resolve(strict=True)
        if not target.is_relative_to(root):
            raise ValueError('Model manifest points outside model directory')
    import torch
    import numpy as np
    from PIL import Image
    from artist_detective.desktop.assets import verify
    from artist_detective.desktop.worker import Resources
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable: check NVIDIA driver and PyTorch CUDA runtime')
    with tempfile.TemporaryDirectory(prefix='detective-runtime-check-') as work:
        verify(str(root), Path(work) / 'assets.json')
        resources = Resources(root, 'cuda:0', Path(work), threading.Event())
        try:
            resources.load()
            fixture = Path(work) / 'probe.png'
            Image.new('RGB', (448, 448), (110, 130, 160)).save(fixture)
            encoded = resources.scorer.encode([fixture])['whole']
            if encoded.shape != (1, 256) or not np.isfinite(encoded).all():
                raise RuntimeError('Model encoding returned invalid values')
            score, _ = resources.scorer.bind(fixture)
            similarity = float(score([fixture])[0])
            if not np.isfinite(similarity) or similarity < 0.99:
                raise RuntimeError('Model self-score verification failed')
            print('DETECTIVE_CHECK_OK:' + json.dumps({
                'python': sys.version.split()[0], 'torch': torch.__version__,
                'cuda': torch.version.cuda, 'gpu': torch.cuda.get_device_name(0),
                'architecture': json.loads((root / 'inference.json').read_text('utf8'))['architecture'],
                'selfScore': similarity,
            }), flush=True)
        finally:
            resources.prefetch_pool.shutdown(wait=True)

if __name__ == '__main__':
    main()
