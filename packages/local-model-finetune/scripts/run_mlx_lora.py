#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import signal
import subprocess
import sys
import time

# Xet-backed range downloads have been flaky on this machine; prefer the plain Hub path.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import httpx

from huggingface_hub import get_hf_file_metadata, hf_hub_url, snapshot_download
from mlx_lm import utils as mlx_utils


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--data-dir")
    parser.add_argument("--adapter-path")
    parser.add_argument("--max-seconds", type=int, default=300)
    parser.add_argument("--iters", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accumulation-steps", type=int, default=4)
    parser.add_argument("--num-layers", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--max-seq-length", type=int, default=1024)
    parser.add_argument("--save-every", type=int, default=8)
    parser.add_argument("--optimizer", default="adamw")
    parser.add_argument("--mask-prompt", action="store_true")
    parser.add_argument("--grad-checkpoint", action="store_true")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    return parser.parse_args()


def build_command(args):
    command = [
        sys.executable,
        "-m",
        "mlx_lm",
        "lora",
        "--model",
        args.model,
        "--train",
        "--data",
        args.data_dir,
        "--adapter-path",
        args.adapter_path,
        "--iters",
        str(args.iters),
        "--batch-size",
        str(args.batch_size),
        "--grad-accumulation-steps",
        str(args.grad_accumulation_steps),
        "--num-layers",
        str(args.num_layers),
        "--learning-rate",
        str(args.learning_rate),
        "--max-seq-length",
        str(args.max_seq_length),
        "--save-every",
        str(args.save_every),
        "--steps-per-report",
        "2",
        "--steps-per-eval",
        str(max(args.save_every, 4)),
        "--optimizer",
        args.optimizer,
    ]

    if args.mask_prompt:
        command.append("--mask-prompt")
    if args.grad_checkpoint:
        command.append("--grad-checkpoint")

    return command


def latest_adapter_path(adapter_dir: pathlib.Path):
    candidates = list(adapter_dir.rglob("*.safetensors"))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    return candidates[0]


def write_manifest(path: pathlib.Path, payload):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def safetensors_file_complete(file_path: pathlib.Path) -> bool:
    if not file_path.exists():
        return False
    if file_path.stat().st_size < 16:
        return False

    try:
        with file_path.open("rb") as handle:
            header_size = int.from_bytes(handle.read(8), "little")
            if header_size <= 0:
                return False
            header = json.loads(handle.read(header_size).decode("utf-8"))
    except Exception:
        return False

    max_offset = 0
    for value in header.values():
        if not isinstance(value, dict):
            continue
        offsets = value.get("data_offsets")
        if (
            isinstance(offsets, list)
            and len(offsets) == 2
            and all(isinstance(offset, int) for offset in offsets)
        ):
            max_offset = max(max_offset, offsets[1])

    expected_size = 8 + header_size + max_offset
    return file_path.stat().st_size >= expected_size


def safetensors_size_info(file_path: pathlib.Path):
    if not file_path.exists() or file_path.stat().st_size < 16:
        return None

    try:
        with file_path.open("rb") as handle:
            header_size = int.from_bytes(handle.read(8), "little")
            if header_size <= 0:
                return None
            header = json.loads(handle.read(header_size).decode("utf-8"))
    except Exception:
        return None

    max_offset = 0
    for value in header.values():
        if not isinstance(value, dict):
            continue
        offsets = value.get("data_offsets")
        if (
            isinstance(offsets, list)
            and len(offsets) == 2
            and all(isinstance(offset, int) for offset in offsets)
        ):
            max_offset = max(max_offset, offsets[1])

    expected_size = 8 + header_size + max_offset
    actual_size = file_path.stat().st_size
    return {
        "actual_bytes": actual_size,
        "expected_bytes": expected_size,
        "download_percent": round(actual_size / expected_size * 100, 2) if expected_size else None,
    }


def inspect_model_files(model_path: str):
    root = pathlib.Path(model_path)
    index_path = root / "model.safetensors.index.json"
    missing_files = []
    actual_bytes = None
    expected_bytes = None
    download_percent = None
    if index_path.exists():
        try:
            data = json.loads(index_path.read_text(encoding="utf-8"))
            required = sorted(set(data.get("weight_map", {}).values()))
        except Exception:
            required = []
        if required:
            if len(required) == 1:
                size_info = safetensors_size_info(root / required[0])
                if size_info:
                    actual_bytes = size_info["actual_bytes"]
                    expected_bytes = size_info["expected_bytes"]
                    download_percent = size_info["download_percent"]
            missing_files = [
                filename
                for filename in required
                if not safetensors_file_complete(root / filename)
            ]
            return {
                "complete": len(missing_files) == 0,
                "missing_files": missing_files,
                "actual_bytes": actual_bytes,
                "expected_bytes": expected_bytes,
                "download_percent": download_percent,
            }

    safetensors_files = list(root.rglob("*.safetensors"))
    safetensors = any(safetensors_file_complete(path) for path in safetensors_files)
    if len(safetensors_files) == 1:
        size_info = safetensors_size_info(safetensors_files[0])
        if size_info:
            actual_bytes = size_info["actual_bytes"]
            expected_bytes = size_info["expected_bytes"]
            download_percent = size_info["download_percent"]
    return {
        "complete": safetensors,
        "missing_files": [] if safetensors else [path.name for path in safetensors_files] or ["*.safetensors"],
        "actual_bytes": actual_bytes,
        "expected_bytes": expected_bytes,
        "download_percent": download_percent,
    }


def model_is_complete(model_path: str) -> bool:
    return inspect_model_files(model_path)["complete"]


def ensure_repo_model_scaffold_downloaded(model_name: str) -> str:
    allow_patterns = [
        "*.json",
        "*.model",
        "*.txt",
        "*.jinja",
    ]
    last_error = None
    for attempt in range(1, 6):
        try:
            return snapshot_download(
                repo_id=model_name,
                allow_patterns=allow_patterns,
                max_workers=1,
                etag_timeout=30,
            )
        except Exception as error:
            last_error = error
            if attempt == 5:
                break
            print(
                f"snapshot_download attempt {attempt} failed for {model_name}; retrying in {attempt * 3}s: {error}",
                file=sys.stderr,
            )
            time.sleep(attempt * 3)

    raise last_error


def download_repo_file_with_resume(model_name: str, filename: str, target_path: pathlib.Path, deadline: float | None = None):
    resolve_url = hf_hub_url(model_name, filename)
    metadata = get_hf_file_metadata(resolve_url)
    direct_url = metadata.location or resolve_url
    expected_size = metadata.size
    chunk_bytes = 8 * 1024 * 1024

    target_path.parent.mkdir(parents=True, exist_ok=True)
    last_error = None
    attempt = 0
    while True:
        attempt += 1
        if deadline is not None and time.time() >= deadline:
            return

        existing_size = target_path.stat().st_size if target_path.exists() else 0
        if expected_size and existing_size >= expected_size:
            if target_path.suffix != ".safetensors" or safetensors_file_complete(target_path):
                return

        headers = {}
        mode = "ab"
        range_end = None
        if existing_size > 0:
            range_end = min(existing_size + chunk_bytes - 1, expected_size - 1)
            headers["Range"] = f"bytes={existing_size}-{range_end}"
        else:
            mode = "wb"
            range_end = min(chunk_bytes - 1, expected_size - 1)
            headers["Range"] = f"bytes=0-{range_end}"

        try:
            request_timeout = 60.0
            if deadline is not None:
                remaining = max(1.0, deadline - time.time())
                request_timeout = min(20.0, remaining + 2.0)
            with httpx.stream(
                "GET",
                direct_url,
                headers=headers,
                follow_redirects=True,
                timeout=request_timeout,
            ) as response:
                response.raise_for_status()

                if existing_size > 0 and response.status_code == 200:
                    target_path.unlink(missing_ok=True)
                    existing_size = 0
                    mode = "wb"

                with target_path.open(mode) as handle:
                    for chunk in response.iter_bytes(chunk_size=64 * 1024):
                        if chunk:
                            handle.write(chunk)
                            handle.flush()

            completed_size = target_path.stat().st_size if target_path.exists() else 0
            if expected_size and completed_size >= expected_size:
                if target_path.suffix != ".safetensors" or safetensors_file_complete(target_path):
                    return
            elif completed_size > existing_size:
                continue
        except Exception as error:
            last_error = error
            print(
                f"direct download attempt {attempt} failed for {model_name}/{filename}: {error}",
                file=sys.stderr,
            )
            if deadline is not None and time.time() >= deadline:
                return
            time.sleep(min(attempt * 2, 20))
            continue

        last_error = RuntimeError(
            f"Downloaded {model_name}/{filename}, but the file is still incomplete at {target_path}."
        )
        if deadline is not None and time.time() >= deadline:
            return
        time.sleep(min(attempt * 2, 20))
        if attempt >= 200:
            raise last_error or RuntimeError(f"Failed to download {model_name}/{filename}.")


def main():
    args = parse_args()
    adapter_dir = pathlib.Path(args.adapter_path) if args.adapter_path else None
    if adapter_dir is None and not args.prepare_only:
        raise SystemExit("--adapter-path is required unless --prepare-only is used")
    if args.data_dir is None and not args.prepare_only:
        raise SystemExit("--data-dir is required unless --prepare-only is used")

    if adapter_dir:
        adapter_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = adapter_dir / ("prepare-manifest.json" if args.prepare_only else "run-manifest.json")
        log_path = adapter_dir / "train.log"
    else:
        manifest_path = pathlib.Path("prepare-manifest.json")
        log_path = pathlib.Path("train.log")
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    bootstrap_start = time.time()

    if pathlib.Path(args.model).exists():
        local_model_path = str(pathlib.Path(args.model).resolve())
        bootstrap_source = "local_path"
        inspection = inspect_model_files(local_model_path)
        prepared = inspection["complete"]
        missing_files = inspection["missing_files"]
    else:
        try:
            local_model_path = str(mlx_utils.hf_repo_to_path(args.model))
            bootstrap_source = "cache_only"
            inspection = inspect_model_files(local_model_path)
            prepared = inspection["complete"]
            missing_files = inspection["missing_files"]
        except Exception:
            local_model_path = ""
            bootstrap_source = "missing"
            prepared = False
            missing_files = ["model cache not found"]
    bootstrap_elapsed = round(time.time() - bootstrap_start, 2)

    if args.check_only:
        payload = {
            "requested_model": args.model,
            "checked_model": args.model,
            "prepared": prepared,
            "prepared_model_path": local_model_path or None,
            "bootstrap_seconds": bootstrap_elapsed,
            "bootstrap_source": bootstrap_source,
            "missing_files": missing_files,
            "actual_bytes": inspection.get("actual_bytes"),
            "expected_bytes": inspection.get("expected_bytes"),
            "download_percent": inspection.get("download_percent"),
            "reason": None
            if prepared
            else f"Training model is not fully prepared locally yet. Missing files: {', '.join(missing_files)}.",
        }
        print(json.dumps(payload, indent=2))
        return 0

    if args.prepare_only:
        deadline = bootstrap_start + args.max_seconds if args.max_seconds > 0 else None
        if not prepared:
            if pathlib.Path(args.model).exists():
                bootstrap_source = "local_path_incomplete"
            else:
                if not local_model_path:
                    local_model_path = str(ensure_repo_model_scaffold_downloaded(args.model))
                bootstrap_source = "download_resume"
                model_root = pathlib.Path(local_model_path)
                inspection = inspect_model_files(local_model_path)
                prepared = inspection["complete"]
                missing_files = inspection["missing_files"]
                for missing_file in missing_files:
                    download_repo_file_with_resume(
                        args.model,
                        missing_file,
                        model_root / missing_file,
                        deadline=deadline,
                    )
                bootstrap_elapsed = round(time.time() - bootstrap_start, 2)
                inspection = inspect_model_files(local_model_path)
                prepared = inspection["complete"]
                missing_files = inspection["missing_files"]
        payload = {
            "requested_model": args.model,
            "checked_model": args.model,
            "prepared_model_path": local_model_path,
            "bootstrap_seconds": bootstrap_elapsed,
            "bootstrap_source": bootstrap_source,
            "manifest_path": str(manifest_path) if manifest_path else None,
            "missing_files": missing_files,
            "reason": None
            if prepared
            else f"Model preparation paused before completion. Remaining files: {', '.join(missing_files)}.",
            "status": "prepared" if prepared else "partial",
        }
        if manifest_path:
            write_manifest(manifest_path, payload)
        print(json.dumps(payload, indent=2))
        return 0

    args.model = local_model_path
    if not prepared:
        print(
            f"Prepared model path is incomplete. Missing files: {', '.join(missing_files)}",
            file=sys.stderr,
        )
        return 1
    start = time.time()
    command = build_command(args)

    with log_path.open("w", encoding="utf-8") as log_file:
        log_file.write("COMMAND: " + " ".join(command) + "\n\n")
        log_file.flush()

        process = subprocess.Popen(
            command,
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )

        timed_out = False
        try:
            process.wait(timeout=args.max_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)

    elapsed = round(time.time() - start, 2)
    adapter_file = latest_adapter_path(adapter_dir)

    manifest = {
        "model": args.model,
        "data_dir": args.data_dir,
        "adapter_dir": str(adapter_dir),
        "adapter_path": str(adapter_file) if adapter_file else None,
        "prepared_model_path": local_model_path,
        "log_path": str(log_path),
        "started_at": started_at,
        "bootstrap_seconds": bootstrap_elapsed,
        "bootstrap_source": bootstrap_source,
        "elapsed_seconds": elapsed,
        "max_seconds": args.max_seconds,
        "status": "timed_out" if timed_out else "failed" if process.returncode != 0 else "completed",
        "trainer": "mlx_lm.lora",
        "iters": args.iters,
        "batch_size": args.batch_size,
        "grad_accumulation_steps": args.grad_accumulation_steps,
        "num_layers": args.num_layers,
        "learning_rate": args.learning_rate,
        "max_seq_length": args.max_seq_length,
        "save_every": args.save_every,
        "optimizer": args.optimizer,
    }
    write_manifest(manifest_path, manifest)

    if process.returncode != 0 and not adapter_file:
        print(f"Training failed. See log: {log_path}", file=sys.stderr)
        return process.returncode

    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
