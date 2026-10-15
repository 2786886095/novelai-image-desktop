/* Owned host only. Downloaded code runs exclusively in a fresh dedicated Worker.
 * No JS/native interface, storage, navigation, or network is exposed to it. */
(() => {
  'use strict';
  const MAX_PAYLOAD = 92 * 1024 * 1024;
  let chunks = [], size = 0, started = false, worker, timer, blobUrl;
  globalThis.naiMetadataReady = true;
  globalThis.naiMetadataResult = null;
  const finish = result => {
    if (globalThis.naiMetadataResult !== null) return;
    clearTimeout(timer);
    if (worker) worker.terminate();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    chunks = []; size = 0;
    globalThis.naiMetadataResult = result;
  };
  globalThis.naiMetadataChunk = chunk => {
    if (started || typeof chunk !== 'string' || (size += chunk.length) > MAX_PAYLOAD)
      throw Error('Metadata payload exceeds safety limit');
    chunks.push(chunk);
  };
  const decode = value => {
    const raw = atob(value), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  };
  globalThis.naiMetadataStart = kernel => {
    if (started) return;
    started = true;
    try {
      if (typeof Worker !== 'function' || !globalThis.crypto?.subtle || typeof WebAssembly !== 'object')
        throw Error('Isolated Worker / WASM unavailable');
      const data = JSON.parse(chunks.join(''));
      chunks = []; size = 0;
      if (!Array.isArray(data.assets) || data.assets.length !== 10 || typeof data.image !== 'string')
        throw Error('Invalid official metadata input');
      const image = decode(data.image);
      const assets = data.assets.map(a => ({id:a.id, bytes:decode(a.base64)}));
      blobUrl = URL.createObjectURL(new Blob([kernel], {type:'application/javascript'}));
      worker = new Worker(blobUrl);
      timer = setTimeout(() => finish({ok:false,error:'Official metadata Worker timed out; no offline fallback.'}), 15000);
      worker.onerror = () => finish({ok:false,error:'Official metadata Worker failed; no offline fallback.'});
      worker.onmessage = event => {
        const r = event.data;
        if (!r || typeof r !== 'object' || typeof r.ok !== 'boolean')
          finish({ok:false,error:'Invalid official metadata response.'});
        else finish(r);
      };
      worker.postMessage({assets,image}, [image]);
    } catch (_) {
      finish({ok:false,error:'Isolated official metadata runtime unavailable; no offline fallback.'});
    }
  };
  globalThis.naiMetadataCancel = () => finish({ok:false,error:'Official metadata read cancelled.'});
})();
