# Online character precise-reference catalog

The desktop reference-preset page now includes an online catalog. It only exposes one legal NovelAI precise-reference image per `(game, category, character/form)` and never downloads the raw or processed source images.

## Catalog format

`public/reference-catalog/index.json` follows `langbai-reference-catalog/v1`:

- `game` and `category` (`游戏内角色图` / `角色立绘`)
- `roleId`, localized `names` (`zh-CN`, `zh-TW`, `ja-JP`, `ko-KR`, `en-US`)
- one legal `width`/`height`, byte `bytes`, and `downloadUrl`
- optional `variant`, `sha256`, and `source`

Regenerate it from the local asset drop with:

```powershell
node scripts/build-reference-catalog.mjs
```

The generator prefers `1024x1536`, then `1472x1472`, then `1536x1024`, so duplicate dimensions are collapsed before publishing.

## Publishing

The precise-reference payload is published through Git LFS in <https://github.com/2786886095/novelai-reference-assets>. The catalog's `downloadUrl` values use GitHub media URLs, so the website and client fetch the real PNG objects rather than missing relative Pages paths.

Set `REFERENCE_ASSET_BASE_URL` when regenerating a remotely usable manifest. `VITE_REFERENCE_CATALOG_URL` can override the manifest endpoint at build time. The app tries the published Pages manifest, Gitee, GitHub, then its bundled manifest.

The Pages workflow is `.github/workflows/reference-catalog-pages.yml`. It publishes the catalog UI and manifest.

Current catalog UI: <https://2786886095.github.io/novelai-image-desktop/>

Current catalog manifest: <https://2786886095.github.io/novelai-image-desktop/reference-catalog/index.json>
