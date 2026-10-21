"""Private local acceptance runner. Credentials arrive only on stdin, never in artifacts.

Uses the upstream frozen encoder, predictor, surrogate, search and native V4.5 payload.
Only the generation transport is replaced with a serial, durable HTTP adapter.
"""
import hashlib
import io
import json
import math
import os
import re
import stat
import uuid
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
from artist_detective.io import atomic_json as _upstream_atomic_json, file_sha256
from artist_detective.novelai import NovelAIGenerator
from artist_detective.captions.budget import NovelAIPromptBudget
from artist_detective.reconstruction.proposals import predict_recipes
from artist_detective.reconstruction.scoring import joined
from artist_detective.reconstruction.search import SearchConfig, run_search


WINDOWS_REPLACE_DELAYS = (0.025, 0.05, 0.1, 0.2, 0.4, 0.8)


def atomic_json(path, value):
    """Keep upstream temp/write/fsync/replace semantics; retry only local sharing conflicts.

    Never retry generation, delete the destination, bypass permissions, or fall
    back to a non-atomic write. Permanent denial still raises the original error.
    """
    for attempt in range(len(WINDOWS_REPLACE_DELAYS) + 1):
        try:
            return _upstream_atomic_json(path, value)
        except OSError as error:
            if (getattr(error, "winerror", None) not in (5, 32, 33)
                    or attempt == len(WINDOWS_REPLACE_DELAYS)):
                error.local_persistence_path = str(path)
                raise
            time.sleep(WINDOWS_REPLACE_DELAYS[attempt])


def persist_progress(output, budget, stage, **values):
    output = Path(output)
    completed = len(list((output / "spool/results").glob("*/*.json")))
    event = {"stage": stage, "completed": completed, "budget": budget, **values}
    atomic_json(output / "status.json", event)
    print(json.dumps({k: v for k, v in event.items() if k not in ("results",)}), flush=True)


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


NETWORK_CODES = frozenset({"connection-refused", "dns", "timeout", "reset", "tls", "cancelled", "other"})


def network_failure_message(kind, request_url, language="en-US", code="other"):
    """Describe the observed boundary, never assume that a proxy caused it."""
    origin = urlsplit(request_url).hostname
    if kind == "connect":
        texts = {
            "zh-CN": "连接 {origin} 未建立，本次请求未提交。可检查网络、代理设置及服务状态后手动继续；已完成图片保留。",
            "zh-TW": "未能建立 {origin} 連線，本次請求未提交。可檢查網路、代理設定及服務狀態後手動繼續；已完成圖片保留。",
            "en-US": "Could not establish the connection to {origin}; this request was not submitted. Check network, proxy settings and service availability before manually resuming. Completed images retained.",
            "ja-JP": "{origin} との接続が成立せず、今回は送信されていません。ネットワーク・プロキシ設定・サービス状態を確認して手動で続行できます。生成済み画像は保持します。",
            "ko-KR": "{origin} 연결이 성립되지 않아 이번 요청은 전송되지 않았습니다. 네트워크·프록시 설정·서비스 상태 확인 후 수동으로 계속할 수 있습니다. 완료 이미지는 보존됩니다.",
        }
    else:
        texts = {
            "zh-CN": "与 {origin} 的请求结果尚未确认，可能已经生成或扣费。不会自动重发；已完成图片保留。手动继续须明确确认可能再次扣费。",
            "zh-TW": "與 {origin} 的請求結果尚未確認，可能已生成或扣費。不會自動重送；已完成圖片保留。手動繼續須明確確認可能再次扣費。",
            "en-US": "The outcome of the request to {origin} is uncertain; it may already have generated or been charged. No automatic replay. Completed images retained. Manually resending requires explicit confirmation of a possible additional charge.",
            "ja-JP": "{origin} へのリクエスト結果が未確認で、生成や課金が済んでいる可能性があります。自動再送せず生成済み画像を保持します。手動再送には追加課金の可能性への明示的な確認が必要です。",
            "ko-KR": "{origin} 요청 결과가 불확실하며 이미 생성·과금됐을 수 있습니다. 자동 재전송하지 않고 완료 이미지를 보존합니다. 수동 재전송에는 추가 과금 가능성에 대한 명시적 확인이 필요합니다.",
        }
    return texts.get(language, texts["en-US"]).format(origin=origin) + " [" + kind + "]"


def record_run_failure(output, command, error, secrets):
    """Preserve the original error even if the diagnostic file is also unwritable."""
    output = Path(output)

    def safe_text(value):
        text = str(value)
        for secret in secrets:
            if secret:
                text = text.replace(secret, "[redacted]")
        return text[:600]

    details = getattr(error, "resume_details", {})
    detail = safe_text(details.get("message") if details else error)
    local_file = getattr(error, "local_persistence_path", None)
    if local_file:
        labels = {
            "zh-CN": "本地文件写入失败（不是网络断开）：",
            "zh-TW": "本機檔案寫入失敗（並非網路中斷）：",
            "en-US": "Local file write failed (not a network disconnect): ",
            "ja-JP": "ローカルファイルの書き込みに失敗（ネットワーク切断ではありません）: ",
            "ko-KR": "로컬 파일 쓰기 실패(네트워크 연결 끊김 아님): ",
        }
        detail = (labels.get(command.get("language"), labels["en-US"]) + detail)[:600]
    safe_details = {**details, "message": detail} if details else {}
    failure = {"type": type(error).__name__, **safe_details, "message": detail}
    if local_file:
        failure.update({"category": "local-storage", "localFile": Path(local_file).name,
                        "winerror": getattr(error, "winerror", None)})
    # run.log is already open in the host: don't lose this primary diagnosis if
    # the filesystem also refuses failure.json or the paused status update.
    print("RUN_FAILED " + type(error).__name__ + ": " + detail, flush=True)
    updates = [(output / "failure.json", failure)]
    if details:
        updates.append((output / "status.json", {"stage": "paused", "completed": len(list((output / "spool/results").glob("*/*.json"))), "budget": command["budget"], **safe_details}))
    for destination, value in updates:
        try:
            atomic_json(destination, value)
        except Exception as persistence_error:
            print("RUN_FAILURE_RECORD_FAILED " + type(persistence_error).__name__ + ": "
                  + safe_text(persistence_error), flush=True)


class LiveGenerator(NovelAIGenerator):
    def __init__(self, root, catalog, budget, token, check, progress,
                 image_base_url="https://image.novelai.net", language="en-US", transport_bridge=None,
                 resume=False, resume_authorization=None):
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
        self.resume = resume
        self.resume_authorization = resume_authorization
        self._validate_resume()
        self.client = httpx.Client(trust_env=False, timeout=httpx.Timeout(180, connect=30),
                                   limits=httpx.Limits(max_keepalive_connections=0), follow_redirects=False)
        self.next_request_at = 0.0

    def _directory(self, name):
        directory = self.store.root / name
        directory.mkdir(exist_ok=True)
        info = directory.lstat()
        if directory.is_symlink() or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise RuntimeError("Recovery directory contains an external alias")
        return directory

    def _archive_error(self, key):
        current = self._directory("transport-errors") / f"{key}.json"
        if current.exists():
            history = self._directory("transport-history")
            os.replace(current, history / f"{key}.{time.time_ns()}.{uuid.uuid4()}.json")

    def _pause(self, key, reason, code="other", status=None):
        code = code if code in NETWORK_CODES else "other"
        message = network_failure_message("connect" if reason == "connect" else "uncertain", self.request_url, self.language, code)
        if reason == "rate_limited":
            message = "NovelAI HTTP 429 persists after bounded backoff; completed images retained"
        return {"paused": True, "resumable": True, "pendingRequestHash": key,
                "reason": reason, "safeCode": code,
                "requiresPaidReplayConfirmation": reason == "uncertain", "message": message,
                **({"httpStatus": status} if isinstance(status, int) else {})}

    def _persist_pause(self, key, reason, code="other", status=None):
        self._archive_error(key)
        value = {"request_hash": key, "status": status if isinstance(status, int) else reason,
                 **self._pause(key, reason, code, status)}
        atomic_json(self.store.root / "transport-errors" / f"{key}.json", value)
        return value

    @staticmethod
    def _error_with_details(error, details):
        error.resume_details = details
        return error

    def _verify_cached(self):
        pending = []
        for marker in sorted((self.store.root / "requests").glob("*.json")):
            key = marker.stem
            if not re.fullmatch(r"[a-f0-9]{64}", key):
                raise RuntimeError("Invalid saved request identity")
            path = self.store.result_path(key)
            if path.exists():
                value = json.loads(path.read_text())
                image = Path(value["image"]).resolve(strict=True)
                if not image.is_relative_to(self.store.root.resolve()):
                    raise RuntimeError("Cached image points outside its spool")
                self.store.result(key, verify=True)
            else:
                pending.append(key)
        return pending

    @staticmethod
    def _definite_preconnect(previous, key):
        return (previous.get("status") == "connect" and previous.get("reason") == "connect"
                and previous.get("request_hash") == key and previous.get("pendingRequestHash") == key
                and previous.get("requiresPaidReplayConfirmation") is False)

    @staticmethod
    def _definite_rate_limit(previous, key):
        return (previous.get("status") == 429 and previous.get("reason") == "rate_limited"
                and previous.get("request_hash") == key and previous.get("pendingRequestHash") == key
                and previous.get("requiresPaidReplayConfirmation") is False)

    def _validate_resume(self):
        if type(self.resume) is not bool:
            raise ValueError("Invalid resume flag")
        auth = self.resume_authorization
        if auth is not None:
            if not self.resume or not isinstance(auth, dict) or set(auth) != {"requestHash", "consentId", "allowUncertainReplay"} or auth["allowUncertainReplay"] is not True:
                raise ValueError("Invalid explicit single-request replay authorization")
            if not isinstance(auth["requestHash"], str) or not re.fullmatch(r"[a-f0-9]{64}", auth["requestHash"]):
                raise ValueError("Invalid recovery request hash")
            try:
                consent = uuid.UUID(auth["consentId"])
                if consent.version != 4 or str(consent) != auth["consentId"]:
                    raise ValueError()
            except (ValueError, TypeError, AttributeError):
                raise ValueError("Invalid recovery consent identity") from None
            if (self.store.root / "recovery" / f"{auth['consentId']}.json").exists():
                raise RuntimeError("Recovery consent was already consumed; a new explicit confirmation is required")
        if not self.resume:
            return
        pending = self._verify_cached()
        if len(list((self.store.root / "requests").glob("*.json"))) > self.max_renders:
            raise ValueError("Saved requests exceed the frozen image budget")
        if len(pending) > 1:
            raise RuntimeError("Multiple unresolved requests; keep this spool for diagnosis")
        if auth is not None and pending != [auth["requestHash"]]:
            raise ValueError("Recovery consent does not match the unresolved request")
        if pending:
            key = pending[0]
            path = self.store.root / "transport-errors" / f"{key}.json"
            previous = json.loads(path.read_text()) if path.exists() else {}
            safe = self._definite_rate_limit(previous, key) or self._definite_preconnect(previous, key)
            if auth is not None and safe:
                raise ValueError("An uncertain-paid replay authorization is not applicable to this request")
            if not safe and auth is None:
                details = self._pause(key, "uncertain", previous.get("safeCode", "other"))
                raise self._error_with_details(RuntimeError("Unresolved previous submission; explicit paid replay confirmation is required"), details)

    def _consume_authorization(self, key, marker, error_marker):
        auth = self.resume_authorization
        if auth is None or auth["requestHash"] != key:
            raise RuntimeError("Unresolved previous submission; not automatically resending a paid request")
        receipt = self._directory("recovery") / f"{auth['consentId']}.json"
        value = {"schema": "single-uncertain-replay-consent/v1", "requestHash": key,
                 "consentId": auth["consentId"], "possibleExtraPaidAttempt": 1,
                 "createdEpoch": time.time(), "originalRequestSha256": file_sha256(marker),
                 "previousDiagnosticSha256": file_sha256(error_marker) if error_marker.exists() else None}
        try:
            descriptor = os.open(receipt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            raise RuntimeError("Recovery consent was already consumed") from None
        # A partial receipt after a crash also consumes the nonce conservatively.
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        self.resume_authorization = None
        orphan = self.store.result_path(key).with_suffix(".png")
        if orphan.exists():
            info = orphan.lstat()
            if not stat.S_ISREG(info.st_mode) or orphan.is_symlink() or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT or info.st_size > 64 * 1024 * 1024:
                raise RuntimeError("Unresolved image artifact is not a bounded local regular file")
            archive = self._directory("recovery-artifacts") / f"{key}.{time.time_ns()}.{uuid.uuid4()}.png"
            # Preserve an image saved before its receipt JSON could be committed.
            os.replace(orphan, archive)

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
                self._archive_error(key)
                self.wait(max(0, self.next_request_at - time.monotonic()))
                try:
                    response = self.client.post(
                        self.transport_url,
                        headers=self.transport_headers, json=payload,
                    )
                    failure = response.headers.get("x-studio-network-failure")
                    if self.transport_url != self.request_url and failure:
                        kind = "connect" if failure == "connect" else "uncertain"
                        code = response.headers.get("x-studio-network-code", "other")
                        details = self._persist_pause(key, kind, code)
                        error_type = httpx.ConnectError if kind == "connect" else httpx.ReadError
                        raise self._error_with_details(error_type(details["message"]), details)
                    self.next_request_at = time.monotonic() + 3.0
                    break
                except (httpx.ConnectError, httpx.ConnectTimeout) as error:
                    code = "timeout" if isinstance(error, httpx.ConnectTimeout) else "other"
                    details = getattr(error, "resume_details", None) or self._persist_pause(key, "connect", code)
                    if connection_attempt == 2:
                        raise self._error_with_details(type(error)(details["message"]), details) from None
                    self.progress("generating", request_hash=key, connection_retry=connection_attempt + 1)
                    self.wait(2 * (connection_attempt + 1))
                except httpx.TransportError as error:
                    code = "timeout" if isinstance(error, httpx.TimeoutException) else "reset" if isinstance(error, httpx.ReadError) else "other"
                    details = getattr(error, "resume_details", None) or self._persist_pause(key, "uncertain", code)
                    raise self._error_with_details(type(error)(details["message"]), details) from None
            if response.status_code != 429:
                return response
            delay = self.retry_seconds(response.headers.get("Retry-After"), rate_attempt)
            event = {"status": 429, "request_hash": key, "retry_not_before": time.time() + delay, "wait_seconds": delay, **self._pause(key, "rate_limited", status=429)}
            atomic_json(error_marker, event)
            atomic_json(self.store.root / "rate-limits" / f"{key}.{time.time_ns()}.json", event)
            if rate_attempt == 6:
                raise self._error_with_details(RuntimeError("NovelAI HTTP 429 persists after bounded backoff; completed images retained"), event)
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
            if self.resume_authorization is not None and self.resume_authorization["requestHash"] != key:
                raise RuntimeError("Next uncached request differs from explicit recovery authorization")
            if marker.exists():
                previous_error = json.loads(error_marker.read_text()) if error_marker.exists() else {}
                if self._definite_rate_limit(previous_error, key):
                    retry_rejected = True
                    delay = max(60, previous_error.get("retry_not_before", 0) - time.time())
                    self.progress("rate_limited", request_hash=key, wait_seconds=delay, resuming=True)
                    self.wait(delay)
                elif self.resume and self._definite_preconnect(previous_error, key):
                    retry_rejected = True
                elif self.resume_authorization is not None:
                    self._consume_authorization(key, marker, error_marker)
                    retry_rejected = True
                else:
                    details = self._pause(key, "uncertain", previous_error.get("safeCode", "other"))
                    raise self._error_with_details(RuntimeError("Unresolved previous submission; not automatically resending a paid request"), details)
            count = sum(not p.name.endswith(".error.json") for p in (self.store.root / "requests").glob("*.json"))
            if not retry_rejected and count >= self.max_renders:
                raise ValueError("Configured image budget exhausted")
            # A progress write is local bookkeeping, not evidence of a sent
            # request. Fail here before creating a NEW intent marker so a local
            # status lock cannot be misclassified as an uncertain paid attempt.
            self.progress("generating", request_hash=key)
            if marker.exists():
                if json.loads(marker.read_text()) != record:
                    raise RuntimeError("Saved request differs from the frozen payload")
            else:
                atomic_json(marker, record)
            # Any subsequent uncertain failure must not inherit a stale 429 marker.
            self._archive_error(key)
            response = self.submit(job["request"], key, marker)
            self._archive_error(key)
            if response.status_code != 200:
                details = self._persist_pause(key, "uncertain", status=response.status_code)
                raise self._error_with_details(RuntimeError(transport_failure_message(response.status_code, self.request_url, self.language)), details)
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
        persist_progress(out, command["budget"], stage, **values)

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
                              transport_bridge=command.get("transportBridge"),
                              resume=command.get("resume", False), resume_authorization=command.get("resumeAuthorization"))
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
        # No automatic replay: durable pause metadata names only the one pending request.
        record_run_failure(output, command, error, secrets)
        sys.exit(1)
