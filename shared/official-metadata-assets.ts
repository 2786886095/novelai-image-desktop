/**
 * Public NovelAI Inspect importer assets pinned to deployment
 * 2e9f80b-43264994153-1 (2026-11-13). Only asset IDs, never images, cross the download
 * bridge. Updating this list requires reviewing the new source and hashes.
 */
export const OFFICIAL_METADATA_ASSETS = [
  { id: "png-text", url: "https://novelai.net/_next/static/chunks/44by8s4n3nxte.js?dpl=2e9f80b-43264994153-1", bytes: 31384, sha256: "19b942f00fe73421d9ffd2740f2f527716bb9328fe7bcd62cd70dc7a5e0140a2", kind: "script" },
  { id: "exif", url: "https://novelai.net/_next/static/chunks/0o-3fp603pdj6.js?dpl=2e9f80b-43264994153-1", bytes: 110285, sha256: "ec36765a368f6234d960bdf0b6dece31c90b3c537160cad7df6a9fc41bfce7e8", kind: "script" },
  { id: "importer", url: "https://novelai.net/_next/static/chunks/217d_wdvrdzx7.js?dpl=2e9f80b-43264994153-1", bytes: 20343, sha256: "673dda22d0e8a973c21082c403bf9e4e53930bcea48ab79e4e46b51a0be4dc6c", kind: "script" },
  { id: "codec", url: "https://novelai.net/_next/static/chunks/09ef663ae8-r2.js?dpl=2e9f80b-43264994153-1", bytes: 121867, sha256: "031e2931a76e218f9bce47c86ea2901c934469975444f947b3791721e69a3d01", kind: "script" },
  { id: "png-wrapper", url: "https://novelai.net/_next/static/chunks/1vzlu-si8tges.js", bytes: 4474, sha256: "af299d8969640585f44be1900d3b465e1aa2f7c47df9f8055e5d90470e58420f", kind: "script" },
  { id: "webp-wrapper", url: "https://novelai.net/_next/static/chunks/40c0kcr1hnr6b.js", bytes: 18258, sha256: "5a796bc117ad066c8df14c527753d6ea2e654be10da58df83377c80bddbff8e9", kind: "script" },
  { id: "alpha-helper", url: "https://novelai.net/_next/static/chunks/2gk65nl2bm8-4.js?dpl=2e9f80b-43264994153-1", bytes: 59519, sha256: "311c69db72807ae4663efa6feff9cc6154b6b02892ff75b88f36a68d8451cfbb", kind: "slice" },
  { id: "buffer-runtime", url: "https://novelai.net/_next/static/chunks/0miy8r9k9748n.js?dpl=2e9f80b-43264994153-1", bytes: 33169, sha256: "a96bd4c1bea039c3de62bbbbe6b9394e7bc6797018f12e769cf75c6d033de8c1", kind: "script" },
  { id: "png-wasm", url: "https://novelai.net/_next/static/media/squoosh_png_bg.35bzug4-gdaxi.wasm", bytes: 181088, sha256: "263d6e658808a74b72a1a99c5cc1d619237e70c150db6e41d5d84d3d117ab9be", kind: "wasm" },
  { id: "webp-wasm", url: "https://novelai.net/_next/static/media/webp_dec.17wqxm7heilu7.wasm", bytes: 137960, sha256: "30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344", kind: "wasm" },
] as const;

export type OfficialMetadataAssetId = (typeof OFFICIAL_METADATA_ASSETS)[number]["id"];
export type OfficialMetadataAssetPayload = { id: OfficialMetadataAssetId; bytes: ArrayBuffer };
export const OFFICIAL_METADATA_ASSET_TIMEOUT_MS = 20_000;
export const OFFICIAL_METADATA_WORKER_TIMEOUT_MS = 15_000;
export const OFFICIAL_METADATA_MAX_ASSET_BYTES = 2 * 1024 * 1024;
