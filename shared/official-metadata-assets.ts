/**
 * Public NovelAI importer assets pinned to the successful 2026-10-14 research
 * oracle (build-TfctsWXpff2fKS). Only asset IDs, never images, cross the download
 * bridge. Updating this list requires reviewing the new source and hashes.
 */
export const OFFICIAL_METADATA_ASSETS = [
  { id: "png-text", url: "https://novelai.net/_next/static/chunks/159qi3n0pd5bk.js?dpl=adc4a06-38324999487-1", bytes: 33637, sha256: "dca4d498087fef012bfb64f9b018353b19d2ed4a29adf34d81381655d537c2d3", kind: "script" },
  { id: "exif", url: "https://novelai.net/_next/static/chunks/0ihfw_miiaq3x.js?dpl=adc4a06-38324999487-1", bytes: 110350, sha256: "9c2b9d4bd760219fdd00dc47c85f48e0ae5f62f593d3d7b79519b359bfe73ca9", kind: "script" },
  { id: "importer", url: "https://novelai.net/_next/static/chunks/3qqpacqil01xo.js?dpl=adc4a06-38324999487-1", bytes: 93700, sha256: "ccc09f51c10b016ef5beee07215b9c5b536fc8c24dba8c039889aef43f673fe8", kind: "script" },
  { id: "codec", url: "https://novelai.net/_next/static/chunks/2yq7i0rhk014r.js?dpl=adc4a06-38324999487-1", bytes: 122748, sha256: "26c69634e2b0e1853dacf0225c650b6149b41a5c34e77ae703733edfffd19705", kind: "script" },
  { id: "png-wrapper", url: "https://novelai.net/_next/static/chunks/2cmbh-ttrqe87.js?dpl=adc4a06-38324999487-1", bytes: 18258, sha256: "f06f5cf236f2fc819fb23b11e6f2ee78d92f2e40d3bca491bb7845dc97e99be9", kind: "script" },
  { id: "webp-wrapper", url: "https://novelai.net/_next/static/chunks/3wo9uwu6m25cz.js?dpl=adc4a06-38324999487-1", bytes: 4525, sha256: "48224d4e38c4216fb642895108917f95cfd6c54a973c78f6ee4a378ea768b97e", kind: "script" },
  { id: "alpha-helper", url: "https://novelai.net/_next/static/chunks/36em9uxgx5ezv.js?dpl=adc4a06-38324999487-1", bytes: 68327, sha256: "ee7367c1dc87df31830981ee26f420c8a7a21ae61d3d61fb06b65bcd4ae80dc0", kind: "slice" },
  { id: "buffer-runtime", url: "https://novelai.net/_next/static/chunks/3tpszwyszbe-d.js?dpl=adc4a06-38324999487-1", bytes: 33287, sha256: "4cfde054f284191fbaa471b768d50005272bc6aea301f0e2b6aaf14a5849821b", kind: "script" },
  { id: "png-wasm", url: "https://novelai.net/_next/static/media/squoosh_png_bg.35bzug4-gdaxi.wasm", bytes: 181088, sha256: "263d6e658808a74b72a1a99c5cc1d619237e70c150db6e41d5d84d3d117ab9be", kind: "wasm" },
  { id: "webp-wasm", url: "https://novelai.net/_next/static/media/webp_dec.17wqxm7heilu7.wasm", bytes: 137960, sha256: "30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344", kind: "wasm" },
] as const;

export type OfficialMetadataAssetId = (typeof OFFICIAL_METADATA_ASSETS)[number]["id"];
export type OfficialMetadataAssetPayload = { id: OfficialMetadataAssetId; bytes: ArrayBuffer };
export const OFFICIAL_METADATA_ASSET_TIMEOUT_MS = 20_000;
export const OFFICIAL_METADATA_WORKER_TIMEOUT_MS = 15_000;
export const OFFICIAL_METADATA_MAX_ASSET_BYTES = 2 * 1024 * 1024;
