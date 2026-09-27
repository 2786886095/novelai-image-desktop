"""Separate two-image character-tag validation; never merge scores with search."""
import importlib.util
import json
import sys
import threading
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location("live", Path(__file__).with_name("artist-detective-live.py"))
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)

def main(command):
    source = Path(command["source"])
    final_path = source / "result.json"
    if final_path.exists():
        result = json.loads(final_path.read_text())
        winner = result["finalists"][0]
        seeds = result["final_seeds"][:2]
        recipe_phase = "fresh-seed-finalist"
    else:
        # An interrupted search remains interrupted. This separate check does not
        # relabel an interim search candidate as a validated final winner.
        rows = [row for file in sorted((source / "search").glob("round-??.json"))
                for row in json.loads(file.read_text())["results"]]
        winner = max(rows, key=lambda row: row["mean_score"])
        seeds = [render["seed"] for render in winner["renders"][:2]]
        recipe_phase = "interim-search-best-not-finalist"
    if "comparison_seeds" in command:
        seeds = command["comparison_seeds"]
        if (not isinstance(seeds, list) or len(seeds) != 2 or len(set(seeds)) != 2
                or any(type(seed) is not int or not 0 <= seed < 2**32 for seed in seeds)):
            raise ValueError("Comparison requires two distinct uint32 seeds")
    output = Path(command.get("output", source / "identity-validation")).resolve()
    output.mkdir(parents=True, exist_ok=True)
    prompt = (source / "identity-prompt.txt").read_text(encoding="utf-8").strip()
    for tag in ("wise (zenless zone zero)", "vivian (zenless zone zero)"):
        if tag not in prompt:
            raise ValueError("Required character tag absent")
    caption = json.loads(json.loads((source / "vision-caption.json").read_text())["content"])
    deadline = time.monotonic() + 900
    def check():
        if time.monotonic() >= deadline or (output / "STOP").exists():
            raise RuntimeError("Identity validation stopped")
    def progress(stage, **extra):
        event = {"stage": stage, "budget": 2, "completed": len(list((output / "spool/results").glob("*/*.json")))}
        live.atomic_json(output / "status.json", event)
        print(json.dumps(event), flush=True)
    progress("loading")
    resources = live.Resources(Path(command["assets"]), "cuda:0", source / "cache", threading.Event())
    resources.load()
    score, _ = resources.scorer.bind(Path(command["image"]))
    generator = live.LiveGenerator(output / "spool", Path(command["assets"]) / "retrieval/catalog.json", 2, command.pop("token"), check, progress)
    generator.prompt_budget = live.NovelAIPromptBudget(Path(command["assets"]) / "tokenizers/t5")
    requests = [{"prompt": prompt, "style": caption["style_tags"], "artists": winner["artists"], "width": 832,
                 "height": 1216, "seed": seed} for seed in seeds]
    try:
        images = generator.generate(requests)
        scores = score([Path(row["image"]) for row in images])
        live.atomic_json(output / "result.json", {"separate_validation": True,
            "note": "Content prompt changed: not a controlled score improvement over the 300-image run.",
            "prompt": prompt, "artists": winner["artists"], "recipe_phase": recipe_phase, "model": "nai-diffusion-4-5-full",
            "renders": [{"image": row["image"], "sha256": row["image_sha256"], "score": value, "seed": request["seed"]}
                        for row, value, request in zip(images, scores, requests, strict=True)]})
        progress("complete")
    finally:
        generator.client.close()
        resources.prefetch_pool.shutdown(wait=True)

if __name__ == "__main__":
    command = json.load(sys.stdin)
    secret = command.get("token", "")
    try:
        main(command)
    except Exception as error:
        output = Path(command.get("output", Path(command["source"]) / "identity-validation")).resolve()
        output.mkdir(parents=True, exist_ok=True)
        detail = str(error).replace(secret, "[redacted]") if secret else str(error)
        live.atomic_json(output / "failure.json", {"type": type(error).__name__, "message": detail[:600]})
        print("IDENTITY_FAILED " + type(error).__name__, flush=True)
        sys.exit(1)
