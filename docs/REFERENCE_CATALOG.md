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

## Publishing limitation

The current local drop is about 1.9 GB for precise references. GitHub/Gitee normal Git repositories are not suitable for this payload (individual-file and repository limits); publish images through Git LFS, a release/object store, or a Hugging Face dataset, while keeping the small catalog manifest and website in GitHub. Set `VITE_REFERENCE_CATALOG_URL` to the published manifest URL. The app tries Gitee, GitHub, then its bundled manifest by default.

The Pages workflow is `.github/workflows/reference-catalog-pages.yml`. It publishes the catalog UI and manifest; image assets must be uploaded to the configured storage and retain the manifest's relative `assets/` paths.
