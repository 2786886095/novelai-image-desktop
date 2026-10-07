"""Private local acceptance runner. Credentials arrive only on stdin, never in artifacts.

Uses the upstream frozen encoder, predictor, surrogate, search and native V4.5 payload.
Only the generation transport is replaced with a serial, durable HTTP adapter.
"""
import hashlib
import io
import json
import math
import os
import sys
import threading
import time
import zipfile
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx
from PIL import Image

from artist_detective.desktop.assets import runtime_config
from artist_detective.desktop.locking import exclusive_lock
from artist_detective.desktop.worker import Resources
from artist_detective.io import atomic_json, file_sha256
from artist_detective.novelai import NovelAIGenerator
from artist_detective.captions.budget import NovelAIPromptBudget
from artist_detective.reconstruction.proposals import predict_recipes
from artist_detective.reconstruction.scoring import joined
from artist_detective.reconstruction.search import SearchConfig, run_search


def configure_parameters(value=None):
    """Validate once per isolated runner, before constructing its durable spool."""
    from artist_detective.novelai_payload import SETTINGS
    value = {} if value is None else value
    if not isinstance(value, dict):
        raise ValueError("Invalid generation parameters")
    original = SETTINGS["request"]["parameters"]
    p = {"model": "nai-diffusion-4-5-full", "width": 832, "height": 1216,
         "steps": 28, "scale": 5, "sampler": "k_euler_ancestral", "noiseSchedule": "karras",
         "cfgRescale": 0, "searchSeed": 246813579, "proposalPoolMultiplier": 8,
         "negativePrompt": original["negative_prompt"], "qualityPrompt": SETTINGS["quality"], **value}
    if p["model"] != "nai-diffusion-4-5-full":
        raise ValueError("Only NAI 4.5 Full is supported")
    if (p["width"],p["height"]) not in {(832,1216),(1216,832),(1024,1024)}:
        raise ValueError("Unsupported image size")
    for name,low,high,integer in [("steps",1,50,True),("scale",1,10,False),("cfgRescale",0,1,False),("searchSeed",0,2**32-1,True),("proposalPoolMultiplier",1,32,True)]:
        v=p[name]
        if type(v) not in (int,float) or not math.isfinite(v) or not low<=v<=high or (integer and type(v) is not int):
            raise ValueError("Invalid parameter: " + name)
    if p["sampler"] not in {"k_euler_ancestral","k_euler","k_dpmpp_2m","k_dpmpp_sde"} or p["noiseSchedule"] not in {"karras","exponential","polyexponential","native"}:
        raise ValueError("Invalid sampler or noise schedule")
    for name in ("negativePrompt","qualityPrompt"):
        if not isinstance(p[name],str) or len(p[name])>8000:
            raise ValueError("Invalid prompt parameter")
    SETTINGS["request"]["model"] = p["model"]
    original.update({"steps":p["steps"],"scale":p["scale"],"sampler":p["sampler"],"noise_schedule":p["noiseSchedule"],"cfg_rescale":p["cfgRescale"],"negative_prompt":p["negativePrompt"]})
    original["v4_negative_prompt"]["caption"]["base_caption"] = p["negativePrompt"]
    SETTINGS["quality"] = p["qualityPrompt"]
    return p


def generation_request_url(base):
    """Validate the frozen, host-approved endpoint without making any request."""
    if not isinstance(base, str):
        raise ValueError("Invalid generation endpoint")
    parts = urlsplit(base.strip())
    local = parts.hostname in {"localhost", "127.0.0.1", "::1"}
    if (not parts.hostname or parts.username is not None or parts.password is not None
            or parts.query or parts.fragment or not (parts.scheme == "https" or (parts.scheme == "http" and local))):
        raise ValueError("Generation endpoint must use HTTPS (or local HTTP), without URL credentials, query or fragment")
    # Accessing port also rejects malformed authority fields before any paid call.
    _ = parts.port
    prefix = parts.path.rstrip("/")
    for suffix in ("/ai/generate-image-stream", "/ai/generate-image"):
        if prefix.endswith(suffix):
            prefix = prefix[:-len(suffix)]
            break
    return urlunsplit((parts.scheme, parts.netloc, prefix + "/ai/generate-image", "", ""))


def transport_failure_message(status, request_url, language="en-US"):
    parts = urlsplit(request_url)
    origin = parts.scheme + "://" + parts.netloc
    if status in (401, 403):
        texts = {
            "zh-CN": "生图接口 {origin} 拒绝鉴权（HTTP {status}）。请检查当前账户的 Token 是否有效、是否属于该接口。未自动切换官方、未重发付费请求；已生成图片保留。",
            "zh-TW": "生圖介面 {origin} 拒絕驗證（HTTP {status}）。請檢查目前帳戶的 Token 是否有效、是否屬於該介面。未自動切換官方、未重送付費請求；已生成圖片保留。",
            "en-US": "Generation endpoint {origin} rejected authorization (HTTP {status}). Check that the current account token is valid for this endpoint. No automatic switch to the official service or paid-request retry; completed images retained.",
            "ja-JP": "生成先 {origin} が認証を拒否しました（HTTP {status}）。現在のアカウントの Token がこの接続先で有効か確認してください。公式サービスへの自動切替・有料リクエストの再送は行わず、生成済み画像は保持します。",
            "ko-KR": "생성 서버 {origin}에서 인증이 거부되었습니다(HTTP {status}). 현재 계정 Token이 이 서버에서 유효한지 확인하세요. 공식 서버 자동 전환이나 유료 요청 재전송은 하지 않으며, 생성된 이미지는 유지됩니다.",
        }
        return texts.get(language, texts["en-US"]).format(origin=origin, status=status)
    return f"Generation endpoint {origin}: HTTP {status}; paid request not retried; completed images retained"


def network_failure_message(kind, request_url, language="en-US"):
    origin = urlsplit(request_url).hostname
    texts = {
        "zh-CN": "自动迭代连接 {origin} 失败，已使用软件的代理设置。请检查代理是否运行及端口是否正确，或切换合适的连接方式。未切换生图接口；结果不确定时不重发付费请求，已生成图片保留。",
        "zh-TW": "自動迭代連線 {origin} 失敗，已使用軟體的代理設定。請檢查代理與連接埠，或切換合適的連線方式。未切換生圖介面；結果不確定時不重送付費請求，已生成圖片保留。",
        "en-US": "Iteration could not connect to {origin} using the application's proxy settings. Check the proxy and port or select the appropriate connection mode. No endpoint switch or retry of uncertain paid requests; completed images retained.",
        "ja-JP": "アプリのプロキシ設定で {origin} に接続できません。プロキシとポートを確認してください。接続先の自動切替・結果不明の有料リクエスト再送は行わず、生成済み画像は保持します。",
        "ko-KR": "앱의 프록시 설정으로 {origin}에 연결하지 못했습니다. 프록시와 포트를 확인하세요. 서버 자동 변경이나 결과가 불확실한 유료 요청 재전송은 하지 않으며 생성된 이미지는 유지됩니다.",
    }
    return texts.get(language, texts["en-US"]).format(origin=origin) + " [" + kind + "]"


class LiveGenerator(NovelAIGenerator):
    def __init__(self, root, catalog, budget, token, check, progress,
                 image_base_url="https://image.novelai.net", language="en-US", transport_bridge=None):
        # The upstream spool scans every requests/*.json as a render request.
        # Keep transport diagnostics outside that directory, including old runs.
        root = Path(root)
        for old_error in (root / "requests").glob("*.error.json"):
            error = json.loads(old_error.read_text(encoding="utf-8"))
            if not isinstance(error.get("status"), int) or not 400 <= error["status"] <= 599:
                raise ValueError("Invalid legacy transport diagnostic")
            atomic_json(root / "transport-errors" / old_error.name.replace(".error.json", ".json"), error)
            old_error.unlink()
        super().__init__(root, None, catalog, max_renders=budget)
        self.token, self.check, self.progress = token, check, progress
        self.request_url = generation_request_url(image_base_url)
        self.language = language
        self.transport_url = self.request_url
        self.transport_headers = {"Authorization": "Bearer " + token}
        if transport_bridge is not None:
            if not isinstance(transport_bridge, dict):
                raise ValueError("Invalid host generation bridge")
            bridge = urlsplit(transport_bridge.get("url", ""))
            key = transport_bridge.get("key", "")
            if (bridge.scheme != "http" or bridge.hostname != "127.0.0.1" or not bridge.port
                    or bridge.path != "/generate" or bridge.username or bridge.password
                    or bridge.query or bridge.fragment or not isinstance(key, str)
                    or len(key) != 64 or any(c not in "0123456789abcdef" for c in key)):
                raise ValueError("Invalid host generation bridge")
            self.transport_url = transport_bridge["url"]
            # Never send the upstream Token to the loopback capability endpoint.
            self.transport_headers = {"x-studio-bridge-key": key}
        self.client = httpx.Client(trust_env=False, timeout=httpx.Timeout(180, connect=30),
                                   limits=httpx.Limits(max_keepalive_connections=0), follow_redirects=False)
        self.next_request_at = 0.0

    def wait(self, seconds):
        # Short cancellable sleeps also make transport fixtures deterministic.
        for _ in range(math.ceil(seconds * 10)):
            self.check()
            time.sleep(0.1)

    @staticmethod
    def retry_seconds(header, attempt):
        backoff = min(900, 60 * 2 ** attempt)
        try:
            delay = float(header)
        except (TypeError, ValueError):
            try:
                delay = parsedate_to_datetime(header).timestamp() - time.time()
            except (TypeError, ValueError, OverflowError):
                delay = 0
        return max(backoff, delay if math.isfinite(delay) else 0)

    def submit(self, payload, key, marker):
        error_marker = self.store.root / "transport-errors" / f"{key}.json"
        for rate_attempt in range(7):
            for connection_attempt in range(3):
                self.check()
                error_marker.unlink(missing_ok=True)
                self.wait(max(0, self.next_request_at - time.monotonic()))
                try:
                    response = self.client.post(
                        self.transport_url,
                        headers=self.transport_headers, json=payload,
                    )
                    failure = response.headers.get("x-studio-network-failure")
                    if self.transport_url != self.request_url and failure:
                        message = network_failure_message(failure, self.request_url, self.language)
                        if failure == "connect":
                            raise httpx.ConnectError(message)
                        raise httpx.ReadError(message)
                    self.next_request_at = time.monotonic() + 3.0
                    break
                except (httpx.ConnectError, httpx.ConnectTimeout):
                    if connection_attempt == 2:
                        raise
                    self.progress("generating", request_hash=key, connection_retry=connection_attempt + 1)
                    self.wait(2 * (connection_attempt + 1))
            if response.status_code != 429:
                return response
            delay = self.retry_seconds(response.headers.get("Retry-After"), rate_attempt)
            event = {"status": 429, "retry_not_before": time.time() + delay, "wait_seconds": delay}
            atomic_json(error_marker, event)
            atomic_json(self.store.root / "rate-limits" / f"{key}.{time.time_ns()}.json", event)
            if rate_attempt == 6:
                raise RuntimeError("NovelAI HTTP 429 persists after bounded backoff; completed images retained")
            self.progress("rate_limited", request_hash=key, retry=rate_attempt + 1, wait_seconds=delay)
            self.wait(delay)
        raise RuntimeError("Generation transport exhausted")

    def generate(self, requests):
        result = []
        for value in requests:
            self.check()
            record = self.store.prepare(value)
            key = record["request_hash"]
            cached = self.store.result(key, verify=True)
            if cached:
                result.append(cached)
                continue
            job = self.store.native_jobs([record])[0]
            if job["request"]["model"] != "nai-diffusion-4-5-full":
                raise ValueError("This acceptance run is restricted to NAI 4.5 Full")
            if self.prompt_budget:
                self.prompt_budget.check_prompt(job["request"]["input"])
            marker = self.store.root / "requests" / f"{key}.json"
            error_marker = self.store.root / "transport-errors" / f"{key}.json"
            retry_rejected = False
            if marker.exists():
                previous_error = json.loads(error_marker.read_text()) if error_marker.exists() else {}
                if previous_error.get("status") != 429:
                    raise RuntimeError("Unresolved previous submission; not automatically resending a paid request")
                retry_rejected = True
                delay = max(60, previous_error.get("retry_not_before", 0) - time.time())
                self.progress("rate_limited", request_hash=key, wait_seconds=delay, resuming=True)
                self.wait(delay)
            count = sum(not p.name.endswith(".error.json") for p in (self.store.root / "requests").glob("*.json"))
            if not retry_rejected and count >= self.max_renders:
                raise ValueError("Configured image budget exhausted")
            atomic_json(marker, record)
            # Any subsequent uncertain failure must not inherit a stale 429 marker.
            error_marker.unlink(missing_ok=True)
            self.progress("generating", request_hash=key)
            response = self.submit(job["request"], key, marker)
            error_marker.unlink(missing_ok=True)
            if response.status_code != 200:
                atomic_json(error_marker, {"status": response.status_code})
                raise RuntimeError(transport_failure_message(response.status_code, self.request_url, self.language))
            if len(response.content) > 64 * 1024 * 1024:
                raise RuntimeError("Generation response exceeded image size bound")
            with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                members = [n for n in archive.infolist() if n.filename.lower().endswith(".png")]
                if len(members) != 1 or members[0].file_size > 64 * 1024 * 1024:
                    raise RuntimeError("Expected exactly one bounded PNG in generation ZIP")
                content = archive.read(members[0])
            with Image.open(io.BytesIO(content)) as pixels:
                if pixels.size != (record["body"]["width"], record["body"]["height"]):
                    raise RuntimeError("Generated image dimensions differ from request")
                pixels.verify()
            path = self.store.result_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            image = path.with_suffix(".png")
            image.write_bytes(content)
            native = {**job, "artists": [
                {**a, "canonical_tag": self.store.lookup[a["tag"]]["canonical_tag"]}
                for a in job["artists"]], "request": self.presentation_request(job["request"])}
            saved = {**record, "image": str(image), "image_sha256": hashlib.sha256(content).hexdigest(),
                     "native_job": native, "native_payload": job["request"]}
            atomic_json(path, saved)
            result.append(saved)
            self.progress("generated", image=str(image), request_hash=key)
        return result


def main(command):
    # Validate routing before loading large local models. Do not send anything.
    generation_request_url(command.get("imageBaseUrl", "https://image.novelai.net"))
    out = Path(command["output"]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    # Scale the run watchdog with the user's budget; per-request timeout stays 180s.
    deadline = time.monotonic() + max(3 * 3600, command["budget"] * 180 + 600)
    cancelled = threading.Event()
    def check():
        if (out / "STOP").exists() or time.monotonic() >= deadline:
            cancelled.set()
            raise RuntimeError("Run stopped; completed images retained")
    def progress(stage, **values):
        completed = len(list((out / "spool/results").glob("*/*.json")))
        event = {"stage": stage, "completed": completed, "budget": command["budget"], **values}
        atomic_json(out / "status.json", event)
        print(json.dumps({k: v for k, v in event.items() if k not in ("results",)}), flush=True)

    asset = Path(command["assets"])
    image = Path(command["image"])
    config = runtime_config(asset)
    if command.get("prompt", "").strip():
        hypothesis = {"content_tags": command["prompt"].strip(), "style_tags": command.get("style", "").strip()}
        atomic_json(out / "fixed-prompt.json", hypothesis)
    else:
        caption = json.loads((out / "vision-caption.json").read_text(encoding="utf-8"))
        if caption["status"] != 200 or caption["finish_reason"] != "stop":
            raise ValueError("Vision response was not complete")
        hypothesis = json.loads(caption["content"])
    budget = command["budget"]
    parameters = configure_parameters(command.get("parameters"))
    atomic_json(out / "generation-parameters.json", parameters)
    search_config = SearchConfig.for_budget(budget, random_seed=parameters["searchSeed"], proposal_pool_multiplier=parameters["proposalPoolMultiplier"])
    progress("loading", rounds=search_config.rounds)
    resources = Resources(asset, "cuda:0", out / "cache", cancelled)
    resources.load()
    check()
    target = {"id": int(file_sha256(image)[:8], 16), "image": str(image),
              "image_sha256": file_sha256(image), "width": parameters["width"], "height": parameters["height"]}
    proposal_path = out / "proposals.json"
    if proposal_path.exists():
        proposed = json.loads(proposal_path.read_text(encoding="utf-8"))
    else:
        progress("retrieving")
        features = resources.scorer.encode([image])
        features["metric"] = joined(features["whole"], features["local"], features["valid"])
        proposed = predict_recipes(config["index_dir"], config["feature_dir"], config["predictor"], [target],
            "cuda:0", encoder_checkpoint=config["encoder"], encoder_sha256=config["encoder_sha256"],
            encoder=resources.scorer.encoder, proposal_index=resources.proposals, features=features)
        atomic_json(proposal_path, proposed)
    score, reference = resources.scorer.bind(image)
    generator = LiveGenerator(out / "spool", asset / "retrieval/catalog.json", budget, command.pop("token"), check, progress,
                              image_base_url=command.get("imageBaseUrl", "https://image.novelai.net"),
                              language=command.get("language", "en-US"),
                              transport_bridge=command.get("transportBridge"))
    generator.prompt_budget = NovelAIPromptBudget(asset / "tokenizers/t5")
    initial = proposed["targets"][0]["initializers"]
    rank = resources.surrogate.for_target(hypothesis["content_tags"], hypothesis["style_tags"], reference)
    def scored(stage, **event):
        check()
        if stage == "scored":
            rows = event["results"]
            progress("scored", phase=event["phase"], best=max(r["mean_score"] for r in rows))
    result = run_search({**target, **hypothesis}, initial["hybrid"], initial["shortlist"], generator, score,
        out / "search", search_config, artist_weights=initial["predicted_weights"],
        scorer_identity=resources.scorer.identity, proposal_ranker=rank,
        proposal_ranker_identity=resources.surrogate.identity, on_progress=scored)
    atomic_json(out / "result.json", result)
    progress("complete", best=result["finalists"][0]["mean_score"])
    generator.client.close()
    resources.prefetch_pool.shutdown(wait=True)


if __name__ == "__main__":
    command = json.load(sys.stdin)
    secrets = [command.get("token", ""), command.get("transportBridge", {}).get("key", "")]
    output = Path(command["output"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    try:
        with exclusive_lock(output / "run.lock", blocking=False):
            main(command)
    except Exception as error:
        # Never persist raw request objects, headers, credentials or exception tracebacks.
        detail = str(error)
        for secret in secrets:
            if secret:
                detail = detail.replace(secret, "[redacted]")
        atomic_json(output / "failure.json", {"type": type(error).__name__, "message": detail[:600]})
        print("RUN_FAILED " + type(error).__name__ + ": " + detail[:600], flush=True)
        sys.exit(1)
