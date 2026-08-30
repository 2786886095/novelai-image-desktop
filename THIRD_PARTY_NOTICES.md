# Third-Party Notices

This project is independently implemented. The following open-source project
and public data services were reviewed for interoperability and product-design
research:

## Aaalice NAI Launcher

- Project: https://github.com/Aaalice233/Aaalice_NAI_Launcher
- License: MIT
- Copyright: its respective contributors

No Flutter/Dart source file from that project is bundled in this application.
Its source-neutral gallery adapter boundaries and backup workflow were studied
as architectural references.

The application may also download two immutable, checksum-pinned database
assets published through that project's GitHub Releases. They are not bundled
with this application and are installed only after the user confirms local
database replacement:

- `tag_catalog.db`, derived from the ComfyUI-Lora-Manager tag catalog snapshot
  (upstream project: https://github.com/willmiao/ComfyUI-Lora-Manager;
  Unlicense / public-domain upstream data).
- `cooccurrence-v2.db.gz`, derived from
  https://huggingface.co/datasets/newtextdoc1111/danbooru-tag-csv (MIT).

Before activation, downloads are checked by byte length, SHA-256, SQLite
schema, metadata, record count, and SQLite integrity check. Replacing either
database does not replace or delete user images, reference presets, favorites,
or history.

## NovelAI QuickTagCloud

- Site: https://novelai.quicktagcloud.com/
- Public data bootstrap: https://novelai.quicktagcloud.com/data-source.json

Gallery entries, images, prompts, credits, and attribution remain owned by
their respective authors and providers. This application acts only as a
read-only client and preserves source attribution in the gallery UI.

## Booru APIs

- Danbooru / Safebooru public Posts API
- Gelbooru public DAPI

Availability, content rules, rate limits, and rights are controlled by each
service. Users must comply with the selected source's terms and local law.
