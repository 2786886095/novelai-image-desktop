"""TEST ONLY: stdlib ComfyUI HTTP protocol fixture; not an ML runtime.

No GPU, models, dependencies, websocket implementation, or browser launch.
See README.md for protocol limits and COMFY_FIXTURE_MODE.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import queue
import signal
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
import uuid
import zlib

IDENTITY = "ComfyUI protocol TEST FIXTURE (not ComfyUI; no inference)"


def node(name, required, outputs, *, optional=None, hidden=None, category="testing", output_node=False):
    inputs = {"required": required}
    if optional: inputs["optional"] = optional
    if hidden: inputs["hidden"] = hidden
    return {"name": name, "display_name": name, "description": IDENTITY,
            "python_module": "FIXTURE_ONLY", "category": category,
            "input": inputs, "input_order": {k: list(v) for k, v in inputs.items()},
            "is_input_list": False, "output": outputs, "output_name": outputs,
            "output_is_list": [False] * len(outputs), "output_node": output_node}


OBJECT_INFO = {
    "UNETLoader": node("UNETLoader", {"unet_name": [["fixture_moss.safetensors", "fixture_anima.safetensors", "fixture_krea2.safetensors"]],
        "weight_dtype": [["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"], {"advanced": True}]}, ["MODEL"], category="model/loaders"),
    "CLIPLoader": node("CLIPLoader", {"clip_name": [["fixture_text_encoder.safetensors"]],
        "type": [["stable_diffusion", "chroma", "krea2", "moss_image"]]}, ["CLIP"],
        optional={"device": [["default", "cpu"], {"advanced": True}]}, category="model/loaders"),
    "VAELoader": node("VAELoader", {"vae_name": [["fixture_vae.safetensors", "pixel_space"]]}, ["VAE"], category="model/loaders"),
    "CLIPTextEncode": node("CLIPTextEncode", {"text": ["STRING", {"multiline": True, "dynamicPrompts": True}],
        "clip": ["CLIP"]}, ["CONDITIONING"], category="conditioning"),
    "KSampler": node("KSampler", {"model": ["MODEL"], "seed": ["INT", {"default": 0, "min": 0, "max": 18446744073709551615, "control_after_generate": True}],
        "steps": ["INT", {"default": 20, "min": 1, "max": 10000}], "cfg": ["FLOAT", {"default": 8.0, "min": 0, "max": 100}],
        "sampler_name": [["euler", "euler_ancestral", "dpmpp_2m"]], "scheduler": [["normal", "simple", "karras"]],
        "positive": ["CONDITIONING"], "negative": ["CONDITIONING"], "latent_image": ["LATENT"],
        "denoise": ["FLOAT", {"default": 1.0, "min": 0, "max": 1}]}, ["LATENT"], category="sampling"),
    "EmptyLatentImage": node("EmptyLatentImage", {"width": ["INT", {"default": 512, "min": 16, "max": 16384, "step": 8}],
        "height": ["INT", {"default": 512, "min": 16, "max": 16384, "step": 8}],
        "batch_size": ["INT", {"default": 1, "min": 1, "max": 4096}]}, ["LATENT"], category="latent"),
    "VAEDecode": node("VAEDecode", {"samples": ["LATENT"], "vae": ["VAE"]}, ["IMAGE"], category="latent"),
    "SaveImage": node("SaveImage", {"images": ["IMAGE"], "filename_prefix": ["STRING", {"default": "ComfyUI"}]}, [],
        hidden={"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}, category="image", output_node=True),
}


def tiny_png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    # One opaque purple pixel, explicitly synthetic fixture output.
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\x77\x44\xcc\xff")) + chunk(b"IEND", b"")


class State:
    def __init__(self, args):
        self.args = args
        self.mode = args.fixture_mode
        self.lock = threading.RLock()
        self.log_lock = threading.Lock()
        self.pending = []
        self.running = None
        self.history = {}
        self.files = {}
        self.number = 0
        self.interrupted = set()
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.ledger = Path(args.fixture_ledger).resolve()
        self.ledger.parent.mkdir(parents=True, exist_ok=True)

    def log(self, event, **fields):
        row = {"event": event, "fixture": True, "pid": os.getpid(), "time": time.time(), **fields}
        with self.log_lock:
            with self.ledger.open("a", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
                f.flush()

    def snapshot_queue(self):
        with self.lock:
            return {"queue_running": [copy.deepcopy(self.running)] if self.running else [],
                    "queue_pending": copy.deepcopy(self.pending)}

    def validate(self, prompt):
        errors = {}
        if not isinstance(prompt, dict) or not prompt:
            return {"type": "prompt_no_outputs", "message": "Fixture requires a nonempty API prompt graph", "details": "TEST FIXTURE", "extra_info": {}}, errors
        for nid, raw in prompt.items():
            failures = []
            kind = raw.get("class_type") if isinstance(raw, dict) else None
            info = OBJECT_INFO.get(kind)
            inputs = raw.get("inputs", {}) if isinstance(raw, dict) else {}
            if not info: failures.append({"type": "invalid_prompt", "message": "Unknown fixture node", "details": str(kind), "extra_info": {}})
            elif not isinstance(inputs, dict): failures.append({"type": "invalid_inputs", "message": "Inputs must be an object", "details": "", "extra_info": {}})
            else:
                for key, spec in info["input"]["required"].items():
                    value = inputs.get(key)
                    message = None
                    if key not in inputs: message = "Required input missing"
                    elif isinstance(spec[0], list):
                        if value not in spec[0]: message = "Value not in list"
                    elif spec[0] in ("MODEL", "CLIP", "VAE", "CONDITIONING", "LATENT", "IMAGE"):
                        if not (isinstance(value, list) and len(value) == 2 and isinstance(value[1], int) and not isinstance(value[1], bool)):
                            message = "Expected node link"
                        else:
                            parent = prompt.get(str(value[0]))
                            parent_info = OBJECT_INFO.get(parent.get("class_type")) if isinstance(parent, dict) else None
                            if not parent_info or value[1] < 0 or value[1] >= len(parent_info["output"]) or parent_info["output"][value[1]] != spec[0]: message = "Invalid node link or output type"
                    elif spec[0] == "STRING" and not isinstance(value, str): message = "Expected string"
                    elif spec[0] in ("INT", "FLOAT"):
                        if isinstance(value, bool) or not isinstance(value, (int, float)) or (spec[0] == "INT" and not isinstance(value, int)): message = "Expected number"
                        elif len(spec) > 1 and (value < spec[1].get("min", value) or value > spec[1].get("max", value)): message = "Number outside fixture range"
                    if message: failures.append({"type": "invalid_input", "message": message, "details": key, "extra_info": {"input_name": key}})
            if failures: errors[str(nid)] = {"errors": failures, "dependent_outputs": [], "class_type": kind}
        if errors or not any(isinstance(n, dict) and n.get("class_type") == "SaveImage" for n in prompt.values()):
            return {"type": "prompt_outputs_failed_validation", "message": "Fixture prompt rejected", "details": "Check node_errors", "extra_info": {}}, errors
        return None, {}

    def worker(self):
        while not self.stop.is_set():
            self.wake.wait(.1)
            with self.lock:
                if not self.pending:
                    self.wake.clear()
                    continue
                item = self.pending.pop(0)
                self.running = item
            pid = item[1]
            self.log("execution_start", prompt_id=pid)
            start = int(time.time() * 1000)
            deadline = time.monotonic() + self.args.fixture_generation_delay
            while not self.stop.is_set():
                with self.lock: interrupted = pid in self.interrupted
                if interrupted or (self.mode != "hang" and time.monotonic() >= deadline): break
                self.stop.wait(.03)
            if self.stop.is_set(): break
            with self.lock:
                interrupted = pid in self.interrupted
                self.interrupted.discard(pid)
                failed = self.mode == "generation-error" or interrupted
                outputs = {}
                if not failed:
                    for outid in item[4]:
                        filename = f"fixture_{pid}_{outid}.png"
                        self.files[(filename, "", "output")] = tiny_png()
                        outputs[outid] = {"images": [{"filename": filename, "subfolder": "", "type": "output"}]}
                details = {"prompt_id": pid, "timestamp": int(time.time() * 1000)}
                if failed:
                    details.update({"node_id": "7", "node_type": "KSampler", "executed": [], "exception_message": "TEST FIXTURE interrupted" if interrupted else "TEST FIXTURE controlled generation error", "exception_type": "FixtureError", "traceback": [], "current_inputs": {}, "current_outputs": []})
                event = "execution_interrupted" if interrupted else "execution_error" if failed else "execution_success"
                self.history[pid] = {"prompt": copy.deepcopy(item), "outputs": outputs,
                    "status": {"status_str": "error" if failed else "success", "completed": not failed,
                        "messages": [["execution_start", {"prompt_id": pid, "timestamp": start}], [event, details]]}}
                self.running = None
            self.log(event, prompt_id=pid, outputs=outputs)


class Handler(BaseHTTPRequestHandler):
    server_version = "ComfyProtocolTestFixture/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    @property
    def state(self): return self.server.state

    def reply(self, value=None, status=200, content_type="application/json"):
        data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Comfy-Protocol-Test-Fixture", "true")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def route(self):
        parsed = urlsplit(self.path)
        p = parsed.path
        if p.startswith("/api/"): p = p[4:]
        return p, parse_qs(parsed.query, keep_blank_values=True)

    def do_GET(self):
        self.state.log("request", method="GET", path=self.path)
        p, query = self.route()
        if p == "/system_stats":
            return self.reply({"system": {"os": sys.platform, "ram_total": 1024**3, "ram_free": 1024**3,
                "comfyui_version": "0.0.0-protocol-fixture", "python_version": sys.version,
                "pytorch_version": "NOT INSTALLED - TEST FIXTURE", "embedded_python": False,
                "argv": sys.argv, "fixture": True, "fixture_identity": IDENTITY}, "devices": []})
        if p == "/object_info": return self.reply(OBJECT_INFO)
        if p.startswith("/object_info/"):
            name = unquote(p[len("/object_info/"):])
            return self.reply({name: OBJECT_INFO[name]} if name in OBJECT_INFO else {})
        if p == "/queue": return self.reply(self.state.snapshot_queue())
        if p == "/prompt":
            q = self.state.snapshot_queue()
            return self.reply({"exec_info": {"queue_remaining": len(q["queue_running"]) + len(q["queue_pending"])}})
        if p == "/history" or p.startswith("/history/"):
            with self.state.lock:
                if p == "/history": result = copy.deepcopy(self.state.history)
                else:
                    pid = unquote(p[len("/history/"):])
                    result = {pid: copy.deepcopy(self.state.history[pid])} if pid in self.state.history else {}
            return self.reply(result)
        if p == "/view":
            key = tuple(query.get(k, [d])[0] for k, d in (("filename", ""), ("subfolder", ""), ("type", "output")))
            with self.state.lock: data = self.state.files.get(key)
            return self.reply(data, content_type="image/png") if data is not None else self.reply({"error": "Fixture output not found"}, 404)
        if p == "/ws": return self.reply({"error": "Fixture deliberately does not implement WebSocket"}, 501)
        return self.reply({"error": "TEST FIXTURE: unknown route"}, 404)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 8 * 1024 * 1024: return self.reply({"error": "Fixture body too large"}, 413)
            raw = self.rfile.read(length)
            data = json.loads(raw) if raw else {}
            if not isinstance(data, dict): raise ValueError("Expected object")
        except (ValueError, json.JSONDecodeError): return self.reply({"error": "Request body must be a JSON object"}, 400)
        self.state.log("request", method="POST", path=self.path, body=data, body_sha256=hashlib.sha256(raw).hexdigest())
        p, _ = self.route()
        if p == "/prompt":
            error, node_errors = self.state.validate(data.get("prompt"))
            if self.state.mode == "reject": error = {"type": "prompt_outputs_failed_validation", "message": "TEST FIXTURE controlled rejection", "details": "COMFY_FIXTURE_MODE=reject", "extra_info": {}}
            if error: return self.reply({"error": error, "node_errors": node_errors}, 400)
            with self.state.lock:
                pid = data.get("prompt_id") or str(uuid.uuid4())
                try:
                    if str(uuid.UUID(pid)) != pid: raise ValueError()
                except (ValueError, AttributeError, TypeError): return self.reply({"error": {"type": "invalid_prompt_id", "message": "UUID required"}, "node_errors": {}}, 400)
                if pid in self.state.history or (self.state.running and self.state.running[1] == pid) or any(i[1] == pid for i in self.state.pending): return self.reply({"error": "Fixture duplicate prompt id"}, 409)
                number = self.state.number
                self.state.number += 1
                prompt = copy.deepcopy(data["prompt"])
                extra = copy.deepcopy(data.get("extra_data", {}))
                if "client_id" in data: extra["client_id"] = data["client_id"]
                outs = [nid for nid, n in prompt.items() if n["class_type"] == "SaveImage"]
                self.state.pending.append([number, pid, prompt, extra, outs])
                self.state.wake.set()
            self.state.log("prompt_accepted", prompt_id=pid, number=number)
            return self.reply({"prompt_id": pid, "number": number, "node_errors": {}})
        if p == "/queue":
            with self.state.lock:
                if data.get("clear"): self.state.pending.clear()
                deleted = data.get("delete", [])
                self.state.pending = [i for i in self.state.pending if i[1] not in deleted]
            return self.reply(b"", content_type="text/plain")
        if p == "/interrupt":
            with self.state.lock:
                if self.state.running and (not data.get("prompt_id") or data["prompt_id"] == self.state.running[1]): self.state.interrupted.add(self.state.running[1])
            return self.reply(b"", content_type="text/plain")
        if p == "/history":
            with self.state.lock:
                if data.get("clear"): self.state.history.clear()
                for pid in data.get("delete", []): self.state.history.pop(pid, None)
            return self.reply(b"", content_type="text/plain")
        return self.reply({"error": "TEST FIXTURE: unknown route"}, 404)


def main():
    parser = argparse.ArgumentParser(description=IDENTITY)
    parser.add_argument("--disable-auto-launch", action="store_true")
    parser.add_argument("--listen", default="127.0.0.1", choices=["127.0.0.1"])
    parser.add_argument("--port", type=int, default=8188)
    parser.add_argument("--fixture-ledger", default=os.environ.get("COMFY_FIXTURE_LEDGER"))
    parser.add_argument("--fixture-mode", default=os.environ.get("COMFY_FIXTURE_MODE", "ok"), choices=["ok", "delay", "startup-error", "reject", "generation-error", "hang"])
    parser.add_argument("--fixture-startup-delay", type=float, default=float(os.environ.get("COMFY_FIXTURE_STARTUP_DELAY", "0")))
    parser.add_argument("--fixture-generation-delay", type=float, default=float(os.environ.get("COMFY_FIXTURE_GENERATION_DELAY", "0.25")))
    args = parser.parse_args()
    if not args.fixture_ledger: parser.error("--fixture-ledger or COMFY_FIXTURE_LEDGER is required")
    if not 0 <= args.port <= 65535: parser.error("port out of range")
    if args.fixture_startup_delay < 0 or args.fixture_generation_delay < 0: parser.error("delay cannot be negative")
    state = State(args)
    state.log("startup", argv=sys.argv, parsed_args=vars(args), identity=IDENTITY, browser_launch_attempts=0)
    print(IDENTITY, flush=True)
    if args.fixture_mode == "startup-error":
        state.log("startup_error", exit_code=23)
        print("TEST FIXTURE controlled startup failure", file=sys.stderr, flush=True)
        return 23
    delay = args.fixture_startup_delay or (1.0 if args.fixture_mode == "delay" else 0)
    if delay: time.sleep(delay)
    try:
        server = ThreadingHTTPServer((args.listen, args.port), Handler)
    except OSError as e:
        state.log("bind_error", error=str(e))
        print(str(e), file=sys.stderr, flush=True)
        return 24
    server.daemon_threads = True
    server.state = state
    worker = threading.Thread(target=state.worker, daemon=True)
    worker.start()
    state.log("ready", host=args.listen, port=server.server_port, browser_launch_attempts=0)
    print(f"TEST FIXTURE ready http://{args.listen}:{server.server_port}; no browser launch", flush=True)
    def stop(signum, frame):
        state.log("signal", signal=signum)
        state.stop.set()
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, "SIGTERM"): signal.signal(signal.SIGTERM, stop)
    try: server.serve_forever(poll_interval=.1)
    finally:
        state.stop.set()
        server.server_close()
        state.log("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
