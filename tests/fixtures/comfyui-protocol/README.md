# ComfyUI protocol TEST FIXTURE — no ML inference

This Python-stdlib HTTP service is explicitly a **protocol test fixture**, not ComfyUI. It does not contain or load a GPU model, download dependencies, install nodes, or open a browser. The three example API graphs use synthetic `fixture_*` filenames and always produce the same 1×1 purple PNG. They are not evidence that MOSS, Anima, or Krea2 can perform real generation.

## Run

Use Python 3 and an independent temporary ledger file:

```text
python main.py --disable-auto-launch --listen 127.0.0.1 --port 8188 --fixture-ledger ABSOLUTE_TEMP_LEDGER_PATH
```

`COMFY_FIXTURE_LEDGER` can supply the ledger path instead. `COMFY_FIXTURE_MODE` selects `ok`, `delay`, `startup-error`, `reject`, `generation-error`, or `hang`. `COMFY_FIXTURE_STARTUP_DELAY` and `COMFY_FIXTURE_GENERATION_DELAY` control seconds. Equivalent `--fixture-*` command-line options are available. Port zero requests an ephemeral port; the actual port appears in the `ready` ledger event. The default address is loopback, and non-loopback addresses are rejected.

Use `COMFY_TEST_PYTHON` to select a test interpreter. Tests otherwise use `python` on Windows or `python3` elsewhere. Runtime tests must not be described as passing when Python is missing: report the explicit skip or failure.

The caller must hide its subprocess console on Windows (`windowsHide: true` in Node). The fixture itself never imports/calls a browser launcher. `/` returns JSON 404, not a website. Startup arguments and all POST bodies are recorded in the ledger; do not send credentials, private prompts, or real user workflows to this fixture.

## Supported protocol subset

- `GET /system_stats` explicitly reports `fixture: true` and version `0.0.0-protocol-fixture`; there is no installed PyTorch.
- `GET /object_info[/CLASS]` supplies realistic required/optional/hidden, input_order, output and module metadata for UNETLoader, CLIPLoader, VAELoader, CLIPTextEncode, KSampler, EmptyLatentImage, VAEDecode and SaveImage. The module name is `FIXTURE_ONLY`, not a trusted core module.
- `POST /prompt` checks basic required fields, values and typed links. Success yields prompt_id/number/node_errors. A real single worker transfers the five-element queue item from pending to running, then to history. The fixture does not simulate tensor operations or arbitrary graph semantics.
- `GET /queue`, `GET /prompt`, `GET /history[/ID]` are self-consistent: unfinished tasks are not present in history; terminal tasks leave the queue. Success is completed=true/status_str=success. Errors/interruption are completed=false/status_str=error with execution messages and no successful output.
- `GET /view` only returns explicitly registered in-memory fixture outputs. It does not read arbitrary filesystem paths.
- `POST /queue` supports pending delete/clear. `POST /interrupt` supports a prompt_id limited to the current running task. `POST /history` supports clear/delete.
- The `/api/` route prefix is accepted. Every response has `X-Comfy-Protocol-Test-Fixture: true`.

No WebSocket, upload, model scanning, UI workflow conversion or real custom-node execution is implemented. `/ws` returns 501 so product code must use history/queue polling without resubmitting the prompt.

Mode behavior: `startup-error` exits 23 before binding; bind failure exits 24. `delay` delays readiness (default 1 second). `reject` returns HTTP 400 without queue/history. `generation-error` enters running then fails. `hang` stays running until targeted interrupt. These controls only exist in this fixture.

## Primary protocol references

Independently implemented against the public protocol and inspected standard node schemas, not a copied ComfyUI executor:

- [ComfyUI server routes](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py)
- [Standard node schemas](https://github.com/Comfy-Org/ComfyUI/blob/master/nodes.py)
- [CLI argument definitions](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py)

These upstream branches can change. Real model support must be verified against the user's installed object_info and actual inference, not this fixture.
