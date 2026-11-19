import datetime
import json
import logging
import platform
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import psutil

from engine.config import (
    BASE_DIR,
    BENCHMARKS_FILE,
    EVALUATIONS_FILE,
    BenchmarkRunRequest,
    QualityEvaluationRequest,
    file_lock,
    find_system_llama_server,
    format_bytes,
    load_config,
    load_models_catalog,
    logger,
)
from engine.hardware import HardwareDetector, SystemSampler
from engine.runtimes import OllamaManager, llama_manager, runtime_registry
from engine.telemetry import telemetry


def load_benchmarks() -> List[Dict[str, Any]]:
    with file_lock:
        if not BENCHMARKS_FILE.is_file() or BENCHMARKS_FILE.stat().st_size == 0:
            return []
        try:
            with open(BENCHMARKS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading benchmarks.json: {e}")
            return []


def save_benchmarks(benchmarks: List[Dict[str, Any]]) -> None:
    with file_lock:
        try:
            with open(BENCHMARKS_FILE, "w", encoding="utf-8") as f:
                json.dump(benchmarks, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving benchmarks.json: {e}")


def load_evaluations() -> List[Dict[str, Any]]:
    with file_lock:
        if not EVALUATIONS_FILE.is_file() or EVALUATIONS_FILE.stat().st_size == 0:
            return []
        try:
            with open(EVALUATIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading evaluations.json: {e}")
            return []


def save_evaluations(evals: List[Dict[str, Any]]) -> None:
    with file_lock:
        try:
            with open(EVALUATIONS_FILE, "w", encoding="utf-8") as f:
                json.dump(evals, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving evaluations.json: {e}")


STANDARD_QUALITY_TASKS = [
    {
        "id": "instruction_following",
        "name": "Instruction Following & Output Constraints",
        "prompt": "List exactly 3 advantages of quantized models over full-precision models. Number each item 1 to 3 with no introductory or concluding text.",
        "max_tokens": 150,
    },
    {
        "id": "factual_qa",
        "name": "Factual Retrieval & Precision",
        "prompt": "What is the standard memory bus width in bits of a dual-channel DDR4 memory architecture? State the number and a brief one-sentence reason.",
        "max_tokens": 100,
    },
    {
        "id": "summarization",
        "name": "Technical Summarization",
        "prompt": "Summarize this paragraph in exactly one sentence: 'Quantization reduces the precision of model weights from 16-bit floating point to lower-bit representations like 4-bit integers. This drastically lowers RAM and VRAM footprint and allows larger models to execute on constrained consumer hardware with minimal degradation in perplexity.'",
        "max_tokens": 120,
    },
    {
        "id": "reasoning",
        "name": "Mathematical & Memory Reasoning",
        "prompt": "If a 4-bit quantized model requires 4 GB of weights in RAM and a 2048-token KV cache requires 512 MB, what is the total minimum RAM in GB needed to hold both? Show the calculation and final number.",
        "max_tokens": 120,
    },
    {
        "id": "code_generation",
        "name": "Python Function Generation",
        "prompt": "Write a concise Python function `calculate_throughput(tokens, duration_sec)` that returns tokens divided by duration, safely returning 0.0 if duration_sec is 0 or negative.",
        "max_tokens": 180,
    },
    {
        "id": "structured_json",
        "name": "Structured JSON Extraction",
        "prompt": "Extract the hardware specifications from this sentence into a valid JSON object with keys 'cpu_cores' (int) and 'ram_gb' (int): 'This system has an 8-core processor and 16GB of DDR4 memory.' Respond with valid JSON only.",
        "max_tokens": 100,
    },
]


def evaluate_task_response(task_id: str, text: str) -> Tuple[float, str]:
    if not text or not text.strip():
        return 0.0, "Empty response generated"

    t_lower = text.lower()

    if task_id == "instruction_following":
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        numbered = [l for l in lines if re.match(r"^(\d+[\.\)]|\-\s|\*\s)", l)]
        if len(numbered) == 3:
            return 10.0, "Exactly 3 numbered items provided as instructed."
        elif len(numbered) in (2, 4):
            return 7.0, f"Found {len(numbered)} items instead of exactly 3."
        else:
            return 4.0, "Failed to follow strict numbering constraint."

    elif task_id == "factual_qa":
        if "128" in text or "64" in text:
            return 10.0, "Correct factual retrieval (128-bit dual channel / 64-bit per channel)."
        return 4.0, "Memory bus width value was not clearly identified."

    elif task_id == "summarization":
        sentences = [s.strip() for s in re.split(r"[\.\!\?]+", text) if s.strip()]
        has_keywords = any(w in t_lower for w in ["quantization", "ram", "vram", "memory", "precision"])
        if len(sentences) <= 1 and has_keywords:
            return 10.0, "Clear one-sentence summary capturing core compression concept."
        elif has_keywords:
            return 7.5, "Good summary content, but exceeded single-sentence constraint."
        return 5.0, "Summary missed key quantization/memory concepts."

    elif task_id == "reasoning":
        if "4.5" in text or "4,608" in text or "4608" in text or "9/2" in text:
            return 10.0, "Correct calculation: 4 GB + 512 MB (0.5 GB) = 4.5 GB."
        elif "4" in text and "512" in text:
            return 6.0, "Identified values but did not correctly sum to 4.5 GB."
        return 3.0, "Incorrect mathematical reasoning."

    elif task_id == "code_generation":
        has_def = "def calculate_throughput" in text
        has_div = "/" in text
        has_zero_check = any(w in text for w in ["<= 0", "<=0", "== 0", "==0", "ZeroDivisionError", "if duration"])
        has_ret = "return" in text
        if has_def and has_div and has_zero_check and has_ret:
            return 10.0, "Clean Python function with safe zero/negative division handling."
        elif has_def and has_div and has_ret:
            return 7.0, "Function generated but lacks zero-division safety guard."
        return 4.0, "Incomplete or invalid Python syntax."

    elif task_id == "structured_json":
        try:
            json_str = text
            if "```json" in text:
                json_str = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                json_str = text.split("```")[1].split("```")[0].strip()
            match = re.search(r"\{[^{}]*\}", json_str)
            if match:
                data = json.loads(match.group(0))
                if "cpu_cores" in data and "ram_gb" in data:
                    return 10.0, f"Valid JSON with exact required keys: {data}"
                return 7.0, f"Valid JSON but keys differed: {list(data.keys())}"
        except Exception:
            pass
        return 2.0, "Failed to produce valid JSON."

    return 6.0, "General response evaluated."


def read_historical_benchmarks() -> Dict[str, Any]:
    def parse_table(file_path: Path) -> List[Dict[str, str]]:
        if not file_path.is_file():
            return []
        try:
            content = file_path.read_text(encoding="utf-8")
            lines = [l.strip() for l in content.splitlines() if l.strip()]
            t_lines = [l for l in lines if l.startswith("|") and l.endswith("|")]
            if len(t_lines) < 2:
                return []
            headers = [c.strip() for c in t_lines[0][1:-1].split("|")]
            results = []
            for line in t_lines[2:]:
                cols = [c.strip() for c in line[1:-1].split("|")]
                if len(cols) == len(headers):
                    results.append(dict(zip(headers, cols)))
            return results
        except Exception as e:
            logger.debug(f"Benchmark parse error in {file_path}: {e}")
            return []

    matrix_file = BASE_DIR / "benchmark" / "02_Benchmark_Test_Matrix.md"
    results_file = BASE_DIR / "benchmark" / "03_Benchmark_Results.md"
    hw_file = BASE_DIR / "benchmark" / "01_Hardware_Profile.md"

    return {
        "test_matrix": parse_table(matrix_file),
        "ssd_vs_hdd_comparison": parse_table(results_file),
        "hardware_profile": parse_table(hw_file),
        "notes": [
            "Benchmark matrix reflects recorded test-workstation baseline data (read-only).",
            "B01: Qwen3.5-0.8B ran at ~19.8-20.5 t/s on CPU.",
            "B02: Ollama llama3.2:1b ran at 12.77 t/s generation and 65.24 t/s prompt evaluation.",
            "B03-B04: Qwen3.5-4B ran at 4.3-4.7 t/s on CPU.",
            "B05-B06: GT 730 offload (-ngl 1, -ngl 5) showed no speed advantage over CPU due to PCIe 2.0 / DDR3 bandwidth limits.",
            "B07-B08: SSD and HDD loading achieved ~4.0s vs 4.6s with similar generation speeds post-load.",
        ],
    }


def run_diagnostics_suite() -> Dict[str, Any]:
    cfg = load_config()
    checks = []

    checks.append({
        "name": "Backend Server Health",
        "category": "core",
        "status": "ok",
        "message": f"FastAPI engine active on Python {platform.python_version()} ({platform.system()} {platform.machine()})",
    })

    try:
        vm = psutil.virtual_memory()
        avail_gb = round(vm.available / (1024 ** 3), 2)
        if avail_gb < 1.5:
            checks.append({
                "name": "System Memory Headroom",
                "category": "hardware",
                "status": "warning",
                "message": f"Low available RAM ({avail_gb} GB free of {round(vm.total / (1024**3), 1)} GB). Inference might page to disk.",
                "remediation": "Close memory-heavy applications before running larger models.",
            })
        else:
            checks.append({
                "name": "System Memory Headroom",
                "category": "hardware",
                "status": "ok",
                "message": f"Available RAM is healthy: {avail_gb} GB free ({vm.percent}% utilized).",
            })
    except Exception as e:
        checks.append({
            "name": "System Memory Headroom",
            "category": "hardware",
            "status": "warning",
            "message": f"Could not read memory: {e}",
        })

    llama_exe_str = cfg.llama_cpp.executable_path or find_system_llama_server()
    llama_exe = Path(llama_exe_str) if llama_exe_str else None
    if llama_exe and not llama_exe.is_absolute():
        llama_exe = (BASE_DIR / llama_exe).resolve()

    if llama_exe and llama_exe.is_file():
        checks.append({
            "name": "llama.cpp Executable Discovery",
            "category": "runtime",
            "status": "ok",
            "message": f"Found llama-server binary at: {llama_exe}",
        })
    else:
        checks.append({
            "name": "llama.cpp Executable Discovery",
            "category": "runtime",
            "status": "warning",
            "message": "llama-server executable not found or not configured.",
            "remediation": "Install llama.cpp or set custom binary path in Settings tab.",
        })

    ollama_stat = OllamaManager.get_status(cfg.ollama.base_url)
    if ollama_stat["reachable"]:
        checks.append({
            "name": "Ollama Service Availability",
            "category": "runtime",
            "status": "ok",
            "message": f"Connected to Ollama service (v{ollama_stat['version']}) at {cfg.ollama.base_url}",
        })
    else:
        checks.append({
            "name": "Ollama Service Availability",
            "category": "runtime",
            "status": "warning",
            "message": f"Ollama service is unreachable at {cfg.ollama.base_url}",
            "remediation": "Start the Ollama daemon or verify the configured base URL in Settings.",
        })

    models = load_models_catalog()
    avail_models = [m for m in models if m.is_available]
    if avail_models:
        checks.append({
            "name": "Model Registry Verification",
            "category": "models",
            "status": "ok",
            "message": f"Found {len(avail_models)} available model(s) ready for execution.",
        })
    else:
        checks.append({
            "name": "Model Registry Verification",
            "category": "models",
            "status": "warning",
            "message": "No available models found in registry.",
            "remediation": "Add a model directory in Settings or import models via Ollama.",
        })

    overall = "ok"
    for c in checks:
        if c.get("status") == "error":
            overall = "error"
            break
        elif c.get("status") == "warning" and overall != "error":
            overall = "warning"

    return {
        "status": "ok",
        "overall_status": overall,
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_checks": len(checks),
        "passed": sum(1 for c in checks if c["status"] == "ok"),
        "warnings": sum(1 for c in checks if c["status"] == "warning"),
        "errors": sum(1 for c in checks if c["status"] == "error"),
        "checks": checks,
    }


async def run_single_inference(
    model_id: Optional[str] = None,
    runtime: Optional[str] = None,
    prompt: str = "Explain quantization in AI in 50 words.",
    max_tokens: int = 128,
    temperature: float = 0.2,
    context_length: int = 2048,
    threads: int = 4,
    gpu_layers: int = 0,
) -> Dict[str, Any]:
    cfg = load_config()
    catalog = {m.id: m for m in load_models_catalog()}
    target_model = None

    if model_id:
        target_model = catalog.get(model_id)
        if not target_model:
            for m in catalog.values():
                if m.name == model_id or m.file_name == model_id:
                    target_model = m
                    break
    if not target_model and cfg.active_model_id:
        target_model = catalog.get(cfg.active_model_id)
    if not target_model and catalog:
        target_model = list(catalog.values())[0]

    target_runtime = runtime
    if not target_runtime and target_model:
        if target_model.format == "Ollama" or target_model.source == "ollama_api" or (target_model.runtime_compatibility and "ollama" in target_model.runtime_compatibility and "llama.cpp server" not in target_model.runtime_compatibility):
            target_runtime = "ollama"
        elif target_model.format == "GGUF" or (target_model.runtime_compatibility and "llama.cpp server" in target_model.runtime_compatibility and "ollama" not in target_model.runtime_compatibility):
            target_runtime = "llama.cpp server"
    if not target_runtime:
        target_runtime = cfg.active_runtime

    model_name = target_model.name if target_model else (model_id or "default")
    model_path = target_model.path if target_model else (model_id or "")

    t0 = time.perf_counter()
    response_text = ""
    prompt_tokens = 0
    completion_tokens = 0
    prompt_tps = 0.0
    eval_tps = 0.0
    ttft_sec = None

    if target_runtime == "ollama":
        stat = OllamaManager.get_status(cfg.ollama.base_url)
        if not stat["reachable"]:
            raise RuntimeError(f"Ollama service is unreachable at {cfg.ollama.base_url}")

        url = f"{cfg.ollama.base_url}/api/generate"
        payload = {
            "model": model_path or model_name,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": context_length,
                "num_thread": threads,
            },
        }
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Ollama returned HTTP {resp.status_code}: {resp.text}")
            data = resp.json()
            response_text = data.get("response", "")
            prompt_tokens = data.get("prompt_eval_count", 0)
            completion_tokens = data.get("eval_count", len(response_text.split()))
            prompt_eval_dur = data.get("prompt_eval_duration", 0)
            eval_dur = data.get("eval_duration", 0)
            if prompt_eval_dur > 0:
                prompt_tps = prompt_tokens / (prompt_eval_dur / 1e9)
            if eval_dur > 0:
                eval_tps = completion_tokens / (eval_dur / 1e9)
            ttft_sec = (prompt_eval_dur / 1e9) if prompt_eval_dur > 0 else (time.perf_counter() - t0)

    elif target_runtime in ("llama.cpp server", "llama.cpp"):
        if not llama_manager.is_running():
            raise RuntimeError("llama.cpp server is not running. Please start it first.")
        url = f"http://{cfg.llama_cpp.host}:{cfg.llama_cpp.port}/completion"
        payload = {
            "prompt": prompt,
            "temperature": temperature,
            "n_predict": max_tokens,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"llama-server returned HTTP {resp.status_code}: {resp.text}")
            data = resp.json()
            response_text = data.get("content", "")
            timings = data.get("timings", {})
            prompt_tokens = timings.get("prompt_n", 0)
            completion_tokens = timings.get("predicted_n", len(response_text.split()))
            prompt_tps = timings.get("prompt_per_second", 0.0)
            eval_tps = timings.get("predicted_per_second", 0.0)
            prompt_ms = timings.get("prompt_ms", 0.0)
            ttft_sec = prompt_ms / 1000.0 if prompt_ms > 0 else (time.perf_counter() - t0)

    else:
        raise RuntimeError(f"Runtime '{target_runtime}' execution adapter is not configured or not running locally.")

    total_time = time.perf_counter() - t0
    if eval_tps == 0.0 and completion_tokens > 0 and total_time > 0:
        eval_tps = completion_tokens / total_time
    ttft_ms = (ttft_sec * 1000.0) if ttft_sec else (total_time * 500.0)

    return {
        "model": model_name,
        "runtime": target_runtime,
        "response": response_text,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "eval_tps": eval_tps,
        "prompt_tps": prompt_tps,
        "ttft_ms": ttft_ms,
        "duration_ms": total_time * 1000.0,
    }


async def execute_benchmark_run(req: BenchmarkRunRequest) -> Dict[str, Any]:
    hw = HardwareDetector.get_full_hardware_profile()
    initial_ram = psutil.virtual_memory().used / (1024 ** 2)
    prompt = req.prompt or "Explain how memory quantization enables large language models to run on consumer hardware."

    try:
        inf = await run_single_inference(
            model_id=req.model_id,
            runtime=req.runtime,
            prompt=prompt,
            max_tokens=req.max_tokens or 128,
            context_length=req.context_length or 2048,
            threads=req.threads or 4,
            gpu_layers=req.gpu_layers or 0,
        )
        post_ram = psutil.virtual_memory().used / (1024 ** 2)
        peak_ram_mb = max(initial_ram, post_ram)
        peak_vram_mb = 0.0
        if hw.get("gpu") and hw["gpu"].get("vram_used_bytes"):
            peak_vram_mb = hw["gpu"]["vram_used_bytes"] / (1024 ** 2)

        SystemSampler.record_throughput(inf["eval_tps"])

        bench_record = {
            "id": f"bench_{uuid.uuid4().hex[:8]}",
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "model": inf["model"],
            "model_id": req.model_id or inf["model"],
            "runtime": inf["runtime"],
            "prompt": prompt,
            "context_length": req.context_length or 2048,
            "threads": req.threads or 4,
            "gpu_layers": req.gpu_layers or 0,
            "tokens": inf["completion_tokens"],
            "duration_ms": round(inf["duration_ms"], 1),
            "eval_tps": round(inf["eval_tps"], 2),
            "prompt_tps": round(inf["prompt_tps"], 2),
            "ttft_ms": round(inf["ttft_ms"], 1),
            "peak_ram_mb": round(peak_ram_mb, 1),
            "peak_vram_mb": round(peak_vram_mb, 1),
            "status": "completed",
            "notes": req.notes or "Automated benchmark run",
            "response_preview": inf["response"][:140] + "..." if len(inf["response"]) > 140 else inf["response"],
            "hardware": {
                "cpu": hw.get("cpu", {}).get("model", platform.processor()),
                "ram_total_gb": hw.get("ram", {}).get("total_gb", 0),
                "gpu": hw.get("gpu", {}).get("model", "N/A") if hw.get("gpu") else "N/A",
                "os": f"{platform.system()} {platform.release()}",
            },
        }
    except Exception as e:
        logger.error(f"Benchmark run failed: {e}")
        bench_record = {
            "id": f"bench_{uuid.uuid4().hex[:8]}",
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "model": req.model_id or "Unknown",
            "model_id": req.model_id or "Unknown",
            "runtime": req.runtime or "Unknown",
            "prompt": prompt,
            "context_length": req.context_length or 2048,
            "threads": req.threads or 4,
            "gpu_layers": req.gpu_layers or 0,
            "tokens": 0,
            "duration_ms": 0.0,
            "eval_tps": 0.0,
            "prompt_tps": 0.0,
            "ttft_ms": 0.0,
            "peak_ram_mb": round(initial_ram, 1),
            "peak_vram_mb": 0.0,
            "status": "failed",
            "error": str(e),
            "notes": req.notes or "Run failed",
            "response_preview": "",
            "hardware": {
                "cpu": hw.get("cpu", {}).get("model", platform.processor()),
                "ram_total_gb": hw.get("ram", {}).get("total_gb", 0),
                "gpu": hw.get("gpu", {}).get("model", "N/A") if hw.get("gpu") else "N/A",
                "os": f"{platform.system()} {platform.release()}",
            },
        }

    benches = load_benchmarks()
    benches.insert(0, bench_record)
    save_benchmarks(benches)
    return bench_record


async def execute_quality_evaluation(req: QualityEvaluationRequest) -> Dict[str, Any]:
    hw = HardwareDetector.get_full_hardware_profile()
    tasks_to_run = STANDARD_QUALITY_TASKS
    if req.test_suite:
        selected_set = set(req.test_suite)
        tasks_to_run = [t for t in STANDARD_QUALITY_TASKS if t["id"] in selected_set]
        if not tasks_to_run:
            tasks_to_run = STANDARD_QUALITY_TASKS

    task_results = []
    model_name_used = req.model_id or "default"
    runtime_used = req.runtime or "default"

    for t in tasks_to_run:
        try:
            inf = await run_single_inference(
                model_id=req.model_id,
                runtime=req.runtime,
                prompt=t["prompt"],
                max_tokens=t["max_tokens"],
                temperature=0.1,
            )
            model_name_used = inf["model"]
            runtime_used = inf["runtime"]
            score, rationale = evaluate_task_response(t["id"], inf["response"])
            task_results.append({
                "task_id": t["id"],
                "task_name": t["name"],
                "prompt": t["prompt"],
                "response": inf["response"],
                "score": round(score, 1),
                "max_score": 10.0,
                "rationale": rationale,
                "duration_ms": round(inf["duration_ms"], 1),
            })
        except Exception as e:
            logger.error(f"Quality task {t['id']} error: {e}")
            task_results.append({
                "task_id": t["id"],
                "task_name": t["name"],
                "prompt": t["prompt"],
                "response": f"Evaluation error: {e}",
                "score": 0.0,
                "max_score": 10.0,
                "rationale": f"Inference execution failed: {e}",
                "duration_ms": 0.0,
            })

    composite_score = round(sum(r["score"] for r in task_results) / len(task_results), 1) if task_results else 0.0

    eval_record = {
        "id": f"eval_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "model": model_name_used,
        "model_id": req.model_id or model_name_used,
        "runtime": runtime_used,
        "tasks": task_results,
        "composite_score": composite_score,
        "max_score": 10.0,
        "human_rating": None,
        "human_feedback": None,
        "hardware": {
            "cpu": hw.get("cpu", {}).get("model", platform.processor()),
            "ram_total_gb": hw.get("ram", {}).get("total_gb", 0),
            "gpu": hw.get("gpu", {}).get("model", "N/A") if hw.get("gpu") else "N/A",
            "os": f"{platform.system()} {platform.release()}",
        },
    }

    evals = load_evaluations()
    evals.insert(0, eval_record)
    save_evaluations(evals)
    return eval_record
