#!/usr/bin/env python3
"""
Large-Model-on-Light-Hardware Engine: Local Hardware & Model Agent
Runs on the user's PC to inspect physical hardware, detect local runtimes (Ollama/llama.cpp),
scan local model directories dynamically, and securely bridge telemetry to the hosted frontend.
"""

import os
import sys
import time
import platform
import logging
from typing import Dict, Any, Optional

import psutil
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# Ensure repository root or executable directory is in sys.path
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from pathlib import Path

from engine.hardware import HardwareDetector, SystemSampler
from engine.runtimes import (
    scan_and_update_models,
    OllamaManager,
    LlamaServerManager,
    RuntimeRegistry,
)
from engine.config import load_config, get_deployment_info, format_bytes, find_system_llama_server

runtime_registry = RuntimeRegistry()
llama_manager = LlamaServerManager()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("local_agent")

app = FastAPI(
    title="Large-Model Engine: Local Hardware Agent",
    description="Lightweight local agent exposing hardware detection and model discovery",
    version="2.0.0",
)


# Chrome/Edge Private Network Access (PNA) and CORS Middleware
class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "*")
        is_pna = (
            request.headers.get("access-control-request-private-network") == "true"
        )

        if request.method == "OPTIONS":
            response = Response(status_code=200)
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, DELETE, OPTIONS, HEAD"
            )
            response.headers["Access-Control-Allow-Headers"] = (
                request.headers.get(
                    "access-control-request-headers",
                    "Content-Type, Authorization, X-API-Key, X-Requested-With",
                )
            )
            if is_pna:
                response.headers["Access-Control-Allow-Private-Network"] = "true"
            return response

        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        if is_pna or "access-control-request-private-network" in request.headers:
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


app.add_middleware(PrivateNetworkAccessMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/api/v1/agent/status")
def get_agent_status():
    """Agent handshake endpoint used by the hosted website to verify local PC connection."""
    hw = HardwareDetector.get_cpu_info()
    ram = HardwareDetector.get_ram_info()
    gpu = HardwareDetector.get_gpu_info()

    return {
        "status": "ok",
        "service": "lmlhe-local-agent",
        "connected": True,
        "role": "local_hardware_agent",
        "version": "2.0.0",
        "timestamp": time.time(),
        "machine": {
            "hostname": platform.node(),
            "os": f"{platform.system()} {platform.release()}",
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
        },
        "quick_spec": {
            "cpu": hw.get("name", "Processor"),
            "cores": hw.get("physical_cores", 1),
            "threads": hw.get("logical_threads", 1),
            "ram_total_gb": ram.get("total_gb", 0),
            "ram_free_gb": ram.get("available_gb", 0),
            "gpu": gpu.get("name") if gpu.get("detected") else "CPU-Only",
            "vram": gpu.get("dedicated_vram_formatted", "0 B"),
        },
    }


@app.get("/api/v1/hardware")
@app.get("/api/v1/agent/hardware")
def get_local_hardware():
    """Returns the actual physical hardware specification of the local computer."""
    profile = HardwareDetector.get_full_hardware_profile()
    profile["deployment"] = {
        "is_hosted": False,
        "environment": "local_workstation",
        "provider": "Local Physical Computer",
        "target_scope": "local_workstation",
        "badge_text": "LOCAL PC (CONNECTED)",
        "description": f"Verified physical machine: {platform.node()}",
        "hardware_notice": "Telemetry reflects your physical local hardware and discrete GPU.",
    }
    return profile


@app.get("/api/v1/models")
@app.get("/api/v1/agent/models")
def get_local_models():
    """Dynamically scans local Ollama daemon and configured GGUF directories."""
    models = scan_and_update_models(refresh_only=False)
    cfg = load_config()
    return {
        "status": "ok",
        "source": "local_agent",
        "total_models": len(models),
        "active_model_id": cfg.active_model_id,
        "models": [m.model_dump() for m in models],
    }


@app.get("/api/v1/runtimes")
@app.get("/api/v1/agent/runtimes")
def get_local_runtimes():
    """Inspects installed local runtimes (Ollama daemon, llama.cpp binary)."""
    cfg = load_config()
    llama_exe_str = cfg.llama_cpp.executable_path or find_system_llama_server()
    llama_exe = Path(llama_exe_str) if llama_exe_str else None
    if llama_exe and not llama_exe.is_absolute():
        llama_exe = (Path(BASE_DIR) / llama_exe).resolve()

    llama_detected = bool(llama_exe and llama_exe.is_file())
    ollama_stat = OllamaManager.get_status(cfg.ollama.base_url)

    all_adapters = runtime_registry.list_all()
    supported_names = [a["runtime_id"] for a in all_adapters]

    return {
        "active_runtime": cfg.active_runtime,
        "supported_runtimes": supported_names,
        "all_runtimes": all_adapters,
        "adapters": {a["runtime_id"]: a for a in all_adapters},
        "llama_cpp": {
            "detected": llama_detected,
            "executable_path": str(llama_exe) if llama_exe else "Not configured",
            "status": llama_manager.get_status(),
        },
        "ollama": {
            "detected": ollama_stat["reachable"],
            "version": ollama_stat.get("version", "unknown"),
            "base_url": cfg.ollama.base_url,
            "running_models": ollama_stat.get("running_models", []),
        },
    }


@app.get("/api/v1/metrics")
@app.get("/api/v1/metrics/live")
@app.get("/api/v1/agent/metrics")
def get_local_metrics():
    """Returns live telemetry from the local system (CPU %, RAM, GPU)."""
    cpu_sample = SystemSampler.sample_cpu()
    ram_info = HardwareDetector.get_ram_info()
    gpu_info = HardwareDetector.get_gpu_info()

    return {
        "timestamp": time.time(),
        "source": "local_agent",
        "cpu": {
            "utilization_percent": cpu_sample["overall"],
            "per_core_percent": cpu_sample["per_core"],
        },
        "ram": {
            "total_gb": ram_info["total_gb"],
            "used_gb": ram_info["used_gb"],
            "available_gb": ram_info["available_gb"],
            "utilization_percent": ram_info["utilization_percent"],
        },
        "gpu": gpu_info,
        "inference": {
            "state": "idle",
            "tokens_per_second": 0.0,
            "tokens_generated": 0,
            "last_duration_sec": 0.0,
            "time_to_first_token_sec": None,
        },
    }


@app.get("/api/v1/config")
def get_local_config():
    """Returns local engine configuration."""
    cfg = load_config()
    data = cfg.model_dump()
    data["deployment"] = {
        "is_hosted": False,
        "environment": "local_workstation",
        "provider": "Local Physical Computer",
        "target_scope": "local_workstation",
        "badge_text": "LOCAL PC (CONNECTED)",
        "description": f"Verified physical machine: {platform.node()}",
        "hardware_notice": "Telemetry reflects your physical local hardware and discrete GPU.",
    }
    return data


@app.post("/api/v1/models/select")
def select_local_model(req: Dict[str, Any]):
    """Selects active model on the local agent."""
    model_id = req.get("model_id")
    if not model_id:
        raise HTTPException(status_code=400, detail="model_id required")
    cfg = load_config()
    cfg.active_model_id = model_id
    if "ollama" in model_id.lower():
        cfg.active_runtime = "ollama"
    from engine.config import save_config_locked
    save_config_locked(cfg)
    return {"status": "ok", "active_model_id": model_id, "active_runtime": cfg.active_runtime}


@app.post("/v1/chat/completions")
@app.post("/api/v1/chat/completions")
async def local_chat_completions(request: Request):
    """Executes or streams OpenAI-compatible completions via local Ollama or llama.cpp."""
    import httpx
    body = await request.json()
    cfg = load_config()
    model_name = body.get("model") or cfg.active_model_id or "llama3.2:1b"
    # Resolve target model for Ollama
    if model_name.startswith("ollama_"):
        model_name = model_name.replace("ollama_", "").replace("_", ":")
    
    ollama_url = f"{cfg.ollama.base_url}/api/chat"
    payload = {
        "model": model_name,
        "messages": body.get("messages", []),
        "stream": body.get("stream", False),
        "options": {
            "temperature": body.get("temperature", 0.7),
            "num_predict": body.get("max_tokens", 512),
        },
    }

    if body.get("stream"):
        from fastapi.responses import StreamingResponse
        async def stream_ollama():
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", ollama_url, json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            import json
                            chunk = json.loads(line)
                            content = chunk.get("message", {}).get("content", "")
                            done = chunk.get("done", False)
                            openai_chunk = {
                                "id": f"chatcmpl-local-{int(time.time())}",
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": model_name,
                                "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": "stop" if done else None}],
                            }
                            yield f"data: {json.dumps(openai_chunk)}\n\n"
                            if done:
                                yield "data: [DONE]\n\n"
                        except Exception:
                            pass
        return StreamingResponse(stream_ollama(), media_type="text/event-stream")
    else:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(ollama_url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("message", {}).get("content", "")
                return {
                    "id": f"chatcmpl-local-{int(time.time())}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": model_name,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": data.get("prompt_eval_count", 0), "completion_tokens": data.get("eval_count", 0), "total_tokens": (data.get("prompt_eval_count", 0) + data.get("eval_count", 0))},
                }
            raise HTTPException(status_code=resp.status_code, detail=resp.text)


def find_available_port(start_port: int = 8008) -> int:
    import socket

    for p in [start_port, 8000, 8080, 8001, 8009, 8888]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return start_port


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(
        description="LMLHE Local Hardware & Model Agent"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to bind (default auto-select 8008 or 8000)",
    )
    parser.add_argument(
        "--host", type=str, default="127.0.0.1", help="Host interface to bind"
    )
    args = parser.parse_args()

    port = args.port or find_available_port(8008)

    # Print spec banner on startup
    hw = HardwareDetector.get_cpu_info()
    ram = HardwareDetector.get_ram_info()
    gpu = HardwareDetector.get_gpu_info()
    cfg = load_config()
    ollama_stat = OllamaManager.get_status(cfg.ollama.base_url)
    ollama_ok = bool(ollama_stat.get("reachable"))

    print(
        "=" * 74
        + "\n  Large-Model-on-Light-Hardware Engine: Local Hardware & Model Agent\n"
        + "=" * 74
    )
    print(
        f"  [+] Machine Host:   {platform.node()} ({platform.system()} {platform.release()})"
    )
    print(
        f"  [+] CPU Detected:   {hw.get('name')} ({hw.get('physical_cores')} Cores, {hw.get('logical_threads')} Threads)"
    )
    print(
        f"  [+] Physical RAM:   {ram.get('total_gb'):.2f} GB Total ({ram.get('available_gb'):.2f} GB Free)"
    )
    print(
        f"  [+] GPU Detected:   {gpu.get('name') if gpu.get('detected') else 'None (CPU-Only)'} ({gpu.get('dedicated_vram_formatted', '0 B')} Dedicated VRAM)"
    )
    print(
        f"  [+] Ollama Daemon:  {'Online (http://127.0.0.1:11434)' if ollama_ok else 'Not running or not installed'}"
    )
    print(f"  [+] Local Agent:    http://{args.host}:{port}")
    print(
        f"  [+] Bridge Active:  Open https://lmlhe.onrender.com/ to inspect your PC\n"
        + "=" * 74
    )

    uvicorn.run(app, host=args.host, port=port, log_level="warning")
