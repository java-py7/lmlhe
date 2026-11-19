import datetime
import json
import logging
import os
import platform
import re
import socket
import sys
import threading
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import httpx
import psutil
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

# Re-export all symbols from engine package for backward compatibility
from engine import (
    BASE_DIR,
    STORAGE_DIR,
    BENCHMARKS_FILE,
    CONFIG_FILE,
    MODELS_FILE,
    EVALUATIONS_FILE,
    APP_LOG_FILE,
    LLAMA_LOG_FILE,
    CATALOG_CACHE_FILE,
    file_lock,
    logger,
    format_bytes,
    find_system_llama_server,
    SecuritySettings,
    LlamaCppSettings,
    OllamaSettings,
    EngineConfig,
    ModelEntry,
    ChatMessage,
    ChatCompletionRequest,
    InferenceGenerateRequest,
    SelectModelRequest,
    StartLlamaServerRequest,
    SwitchRuntimeRequest,
    AddDirectoryRequest,
    DirectoryRequest,
    AddModelRequest,
    RecommendationRequest,
    BenchmarkRunRequest,
    QualityEvaluationRequest,
    QualityRatingRequest,
    ConfigValidateRequest,
    ModelDownloadRequest,
    GenerateRequest,
    OpenAIChatRequest,
    HumanFeedbackRequest,
    ValidateConfigRequest,
    DownloadModelRequest,
    AdvisorRecommendationRequest,
    AdvisorSetupRequest,
    resolve_compatible_runtime,
    load_config,
    save_config,
    load_config_locked,
    save_config_locked,
    load_models_catalog,
    save_models_catalog,
    load_models_catalog_locked,
    parse_gguf_metadata,
    parse_safetensors_metadata,
    parse_onnx_metadata,
    SystemSampler,
    HardwareDetector,
    InferenceTelemetry,
    telemetry,
    LlamaServerManager,
    llama_manager,
    OllamaManager,
    start_ollama_runtime,
    scan_and_update_models,
    BaseRuntimeAdapter,
    LlamaCppAdapter,
    OllamaAdapter,
    TransformersAdapter,
    ONNXRuntimeAdapter,
    MLXAdapter,
    ExLlamaV2Adapter,
    MLCLLMAdapter,
    RuntimeRegistry,
    runtime_registry,
    evaluate_model_compatibility,
    RUNTIME_INSTALL_GUIDES,
    RecommendationEngine,
    VERIFIED_ONLINE_MODELS,
    OnlineModelCatalog,
    online_catalog,
    AIModelAdvisorEngine,
    ModelSetupManager,
    setup_manager,
    load_benchmarks,
    save_benchmarks,
    load_evaluations,
    save_evaluations,
    STANDARD_QUALITY_TASKS,
    evaluate_task_response,
    read_historical_benchmarks,
    run_diagnostics_suite,
    run_single_inference,
    execute_benchmark_run,
    execute_quality_evaluation,
)

server_start_time = time.time()


def verify_api_access(request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    is_local = client_ip in ("127.0.0.1", "::1", "localhost", "testclient")

    cfg = load_config()
    sec = cfg.security

    if not is_local:
        if not sec.allow_remote_access:
            raise HTTPException(
                status_code=403,
                detail="Remote network access to this inference engine is disabled. Enable remote access in Settings.",
            )

    auth_header = request.headers.get("Authorization")
    api_key_header = request.headers.get("X-API-Key")
    provided_key = None
    if api_key_header:
        provided_key = api_key_header.strip()
    elif auth_header and auth_header.startswith("Bearer "):
        provided_key = auth_header[7:].strip()

    if sec.api_key:
        if (not is_local) or sec.require_auth_for_local:
            if not provided_key or provided_key != sec.api_key:
                raise HTTPException(
                    status_code=401,
                    detail="Unauthorized: Missing or invalid API key.",
                )


app = FastAPI(
    title="Large-Model-on-Light-Hardware Engine",
    description="Unified cross-platform local AI inference engine, dynamic hardware intelligence, and Project 3 API abstraction",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    logger.info("Initializing Large-Model-on-Light-Hardware Engine...")
    load_config()
    scan_and_update_models(refresh_only=True)


@app.on_event("shutdown")
def on_shutdown():
    logger.info("Shutting down engine...")
    llama_manager.stop()


@app.get("/api/v1/health")
def get_health():
    cfg = load_config()
    is_ollama = cfg.active_runtime == "ollama"
    runtime_conn = False
    if is_ollama:
        runtime_conn = OllamaManager.get_status(cfg.ollama.base_url)["reachable"]
    else:
        runtime_conn = llama_manager.is_running()

    models = {m.id: m for m in load_models_catalog()}
    active_m = models.get(cfg.active_model_id)

    return {
        "status": "healthy",
        "version": "1.0.0",
        "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "uptime_sec": round(time.time() - server_start_time, 1),
        "active_runtime": cfg.active_runtime,
        "runtime_connected": runtime_conn,
        "active_model": active_m.name if active_m else "None",
        "security": {
            "remote_access_enabled": cfg.security.allow_remote_access,
            "auth_required": bool(cfg.security.api_key),
        },
    }


@app.get("/api/v1/hardware", dependencies=[Depends(verify_api_access)])
def get_hardware():
    return HardwareDetector.get_full_hardware_profile()


@app.get("/api/v1/runtimes", dependencies=[Depends(verify_api_access)])
def get_runtimes():
    cfg = load_config()
    llama_exe_str = cfg.llama_cpp.executable_path or find_system_llama_server()
    llama_exe = Path(llama_exe_str) if llama_exe_str else None
    if llama_exe and not llama_exe.is_absolute():
        llama_exe = (BASE_DIR / llama_exe).resolve()

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
            "version": ollama_stat["version"],
            "base_url": cfg.ollama.base_url,
            "running_models": ollama_stat["running_models"],
        },
    }


@app.get("/api/v1/runtimes/{runtime_id}/status", dependencies=[Depends(verify_api_access)])
def get_single_runtime_status(runtime_id: str):
    return runtime_registry.get_status(runtime_id)


@app.get("/api/v1/runtime/status", dependencies=[Depends(verify_api_access)])
@app.get("/api/v1/runtimes/status", dependencies=[Depends(verify_api_access)])
def get_runtime_status():
    cfg = load_config()
    adapter = runtime_registry.get(cfg.active_runtime)
    if adapter:
        return {
            "runtime": cfg.active_runtime,
            "details": adapter.get_metrics() if cfg.active_runtime == "llama.cpp server" else OllamaManager.get_status(cfg.ollama.base_url),
        }
    return {
        "runtime": cfg.active_runtime,
        "details": {},
    }


@app.post("/api/v1/runtimes/switch", dependencies=[Depends(verify_api_access)])
def switch_runtime(req: SwitchRuntimeRequest):
    valid = [a["runtime_id"] for a in runtime_registry.list_all()]
    if req.runtime not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid runtime '{req.runtime}'. Choose from {valid}")
    cfg = load_config()
    # Compatibility validation
    if cfg.active_model_id:
        models = {m.id: m for m in load_models_catalog()}
        model = models.get(cfg.active_model_id)
        if model:
            adapter = runtime_registry.get(req.runtime)
            if adapter:
                val = adapter.validate_model(model)
                if not val.get("compatible", False):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Model '{model.name}' is incompatible with {req.runtime}: {val.get('message', 'Unsupported format')}",
                    )
    cfg.active_runtime = req.runtime
    save_config(cfg)
    return {"status": "ok", "active_runtime": cfg.active_runtime}


@app.post("/api/v1/runtimes/llama/start", dependencies=[Depends(verify_api_access)])
def start_llama_server(req: StartLlamaServerRequest):
    cfg = load_config()
    models = {m.id: m for m in load_models_catalog()}

    model_id = req.model_id or cfg.active_model_id
    if not model_id or model_id not in models:
        raise HTTPException(status_code=400, detail=f"Model ID '{model_id}' not found in registry")

    target_model = models[model_id]

    # If the target model is an Ollama model, route directly to start_ollama_runtime
    # Never spawn llama-server.exe for an Ollama model!
    if target_model.format == "Ollama" or target_model.source == "ollama_api" or ("ollama" in target_model.runtime_compatibility and "llama.cpp server" not in target_model.runtime_compatibility):
        return start_ollama_runtime(target_model)

    if "llama.cpp" not in target_model.runtime_compatibility and "llama.cpp server" not in target_model.runtime_compatibility:
        raise HTTPException(status_code=400, detail=f"Model '{target_model.name}' is not compatible with llama.cpp")

    if not target_model.is_available or not Path(target_model.path).is_file():
        raise HTTPException(status_code=400, detail=f"Model file '{target_model.path}' is missing or inaccessible on disk")

    exe_path = cfg.llama_cpp.executable_path or find_system_llama_server()
    if not exe_path or not Path(exe_path).is_file():
        raise HTTPException(status_code=400, detail="llama-server executable not found. Configure path in Settings or install llama.cpp.")

    host = cfg.llama_cpp.host
    port = req.port if req.port is not None else cfg.llama_cpp.port
    threads = req.threads if req.threads is not None else cfg.llama_cpp.threads
    gpu_layers = req.gpu_layers if req.gpu_layers is not None else cfg.llama_cpp.gpu_layers
    context_size = req.context_size if req.context_size is not None else cfg.llama_cpp.context_size
    batch_size = req.batch_size if req.batch_size is not None else cfg.llama_cpp.batch_size
    ubatch_size = req.ubatch_size if req.ubatch_size is not None else cfg.llama_cpp.ubatch_size
    use_mmap = req.use_mmap if req.use_mmap is not None else cfg.llama_cpp.use_mmap
    flash_attn = req.flash_attn if req.flash_attn is not None else cfg.llama_cpp.flash_attn

    cfg.active_runtime = "llama.cpp server"
    cfg.active_model_id = model_id
    cfg.llama_cpp.executable_path = exe_path
    cfg.llama_cpp.port = port
    cfg.llama_cpp.threads = threads
    cfg.llama_cpp.gpu_layers = gpu_layers
    cfg.llama_cpp.context_size = context_size
    cfg.llama_cpp.batch_size = batch_size
    cfg.llama_cpp.ubatch_size = ubatch_size
    cfg.llama_cpp.use_mmap = use_mmap
    cfg.llama_cpp.flash_attn = flash_attn
    save_config(cfg)

    res = llama_manager.start(
        exe_path=exe_path,
        model_path=target_model.path,
        host=host,
        port=port,
        threads=threads,
        gpu_layers=gpu_layers,
        context_size=context_size,
        batch_size=batch_size,
        ubatch_size=ubatch_size,
        use_mmap=use_mmap,
        flash_attn=flash_attn,
    )
    return res


@app.post("/api/v1/runtimes/llama/stop", dependencies=[Depends(verify_api_access)])
def stop_llama_server():
    return llama_manager.stop()


@app.post("/api/v1/runtimes/start", dependencies=[Depends(verify_api_access)])
def start_active_runtime(req: Optional[StartLlamaServerRequest] = None):
    cfg = load_config()
    models = {m.id: m for m in load_models_catalog()}
    target_model = models.get(cfg.active_model_id)

    if target_model and (target_model.format == "Ollama" or target_model.source == "ollama_api" or ("ollama" in target_model.runtime_compatibility and "llama.cpp server" not in target_model.runtime_compatibility)):
        return start_ollama_runtime(target_model)
    elif cfg.active_runtime == "ollama":
        if target_model:
            return start_ollama_runtime(target_model)
        stat = OllamaManager.get_status(cfg.ollama.base_url)
        if not stat["reachable"]:
            raise HTTPException(
                status_code=503,
                detail=f"Ollama service is unreachable at {cfg.ollama.base_url}. Please ensure Ollama is installed and running.",
            )
        return {
            "status": "ok",
            "runtime": "ollama",
            "message": f"Ollama service is active and responsive (v{stat['version']})",
            "details": stat,
        }
    else:
        if req is None:
            req = StartLlamaServerRequest()
        return start_llama_server(req)


@app.post("/api/v1/runtimes/stop", dependencies=[Depends(verify_api_access)])
def stop_active_runtime():
    cfg = load_config()
    if cfg.active_runtime == "ollama":
        telemetry.finish_generation(error="Inference stopped by user request")
        return {
            "status": "ok",
            "runtime": "ollama",
            "message": "Ollama inference session stopped successfully",
        }
    else:
        return llama_manager.stop()


@app.get("/api/v1/models", dependencies=[Depends(verify_api_access)])
def get_models():
    cfg = load_config()
    models = scan_and_update_models(refresh_only=True)
    return {
        "active_model_id": cfg.active_model_id,
        "models": [m.model_dump() for m in models],
        "model_directories": cfg.model_directories,
        "total_count": len(models),
        "available_count": sum(1 for m in models if m.is_available),
    }


@app.post("/api/v1/models/scan", dependencies=[Depends(verify_api_access)])
def scan_models():
    models = scan_and_update_models(refresh_only=False)
    return {
        "status": "ok",
        "count": len(models),
        "available_count": sum(1 for m in models if m.is_available),
        "models": [m.model_dump() for m in models],
    }


@app.post("/api/v1/models/refresh", dependencies=[Depends(verify_api_access)])
def refresh_models():
    models = scan_and_update_models(refresh_only=True)
    return {
        "status": "ok",
        "count": len(models),
        "available_count": sum(1 for m in models if m.is_available),
        "models": [m.model_dump() for m in models],
    }


@app.post("/api/v1/models/select", dependencies=[Depends(verify_api_access)])
def select_model(req: SelectModelRequest):
    models = {m.id: m for m in load_models_catalog()}
    target_id = req.model_id
    if target_id not in models:
        for mid, m in models.items():
            if m.name == target_id or m.file_name == target_id:
                target_id = mid
                break
        else:
            raise HTTPException(status_code=404, detail=f"Model ID '{req.model_id}' not found in registry")

    target_model = models[target_id]
    cfg = load_config()
    cfg.active_model_id = target_id
    cfg.active_runtime = resolve_compatible_runtime(target_model, cfg.active_runtime)
    save_config(cfg)
    return {
        "status": "ok",
        "active_model_id": cfg.active_model_id,
        "active_runtime": cfg.active_runtime,
        "model": target_model.model_dump(),
    }


@app.post("/api/v1/models/add", dependencies=[Depends(verify_api_access)])
def add_model(req: AddModelRequest):
    raw_path = str(req.path).strip()
    clean_path = raw_path.strip('\'"').strip()
    for fake in ["C:\\fakepath\\", "C:/fakepath/", "fakepath\\", "fakepath/"]:
        if clean_path.lower().startswith(fake.lower()):
            clean_path = clean_path[len(fake):]
            break

    target_file = None
    cfg = load_config()

    p = Path(clean_path)
    if p.is_file():
        target_file = p.resolve()
    elif not p.is_absolute():
        candidate = (BASE_DIR / p).resolve()
        if candidate.is_file():
            target_file = candidate
        else:
            candidate = (BASE_DIR / "models" / p).resolve()
            if candidate.is_file():
                target_file = candidate
            else:
                candidate = (BASE_DIR / "models" / p.name).resolve()
                if candidate.is_file():
                    target_file = candidate

    if not target_file:
        for d_str in cfg.model_directories:
            dir_p = (BASE_DIR / d_str).resolve() if not Path(d_str).is_absolute() else Path(d_str).resolve()
            if dir_p.is_dir():
                cand1 = (dir_p / p).resolve()
                if cand1.is_file():
                    target_file = cand1
                    break
                cand2 = (dir_p / p.name).resolve()
                if cand2.is_file():
                    target_file = cand2
                    break

    if not target_file:
        user_dirs = [
            Path.home() / "models",
            Path.home() / "Downloads",
        ]
        for ud in user_dirs:
            if ud.is_dir():
                cand = (ud / p.name).resolve()
                if cand.is_file():
                    target_file = cand
                    break

    if not target_file or not target_file.is_file():
        searched = [str(BASE_DIR), str(BASE_DIR / "models")] + [str(d) for d in cfg.model_directories]
        raise HTTPException(
            status_code=400,
            detail=f"File not found on disk at specified path: '{req.path}'. Checked locations: {', '.join(searched)}",
        )

    try:
        with open(target_file, "rb") as f_test:
            f_test.read(4)
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: unable to read model file at '{target_file}'")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error accessing model file at '{target_file}': {e}")

    clean_id = target_file.stem.lower().replace(" ", "_").replace(".", "_")
    size = target_file.stat().st_size
    meta = parse_gguf_metadata(target_file)
    quant = meta.get("quantization") or "Custom"
    location_drive = target_file.drive if target_file.drive else ("SSD" if "C:" in str(target_file) else "Drive")

    entry = ModelEntry(
        id=clean_id,
        name=req.name or target_file.name,
        file_name=target_file.name,
        path=str(target_file.resolve()),
        format="GGUF" if meta.get("is_gguf", False) else "Binary",
        quantization=quant,
        size_bytes=size,
        size_formatted=format_bytes(size),
        architecture=meta.get("architecture", "unknown"),
        parameter_size=meta.get("size_label", "Custom"),
        context_length=meta.get("context_length", 4096),
        runtime_compatibility=req.runtime_compatibility or ["llama.cpp", "llama.cpp server"],
        is_available=True,
        status_message="Available",
        location_drive=location_drive,
        source="manual_addition",
    )

    catalog = {m.id: m for m in load_models_catalog()}
    catalog[clean_id] = entry
    save_models_catalog(list(catalog.values()))

    if not cfg.active_model_id:
        cfg.active_model_id = clean_id
        save_config(cfg)

    return {"status": "ok", "model": entry.model_dump()}


@app.get("/api/v1/models/directories", dependencies=[Depends(verify_api_access)])
def get_model_directories():
    cfg = load_config()
    return {"status": "ok", "directories": cfg.model_directories}


@app.post("/api/v1/models/directories", dependencies=[Depends(verify_api_access)])
def add_model_directory(req: DirectoryRequest):
    p = Path(req.directory_path)
    if not p.is_absolute():
        p_resolved = (BASE_DIR / p).resolve()
    else:
        p_resolved = p.resolve()

    if not p_resolved.is_dir():
        raise HTTPException(status_code=400, detail=f"Directory does not exist: {req.directory_path}")

    dir_str = str(req.directory_path).strip()
    cfg = load_config()
    if dir_str not in cfg.model_directories:
        cfg.model_directories.append(dir_str)
        save_config(cfg)

    discovered = scan_and_update_models(refresh_only=False)
    return {
        "status": "ok",
        "directories": cfg.model_directories,
        "discovered_models": [m.model_dump() for m in discovered],
    }


@app.delete("/api/v1/models/directories", dependencies=[Depends(verify_api_access)])
def remove_model_directory(req: DirectoryRequest):
    dir_str = str(req.directory_path).strip()
    cfg = load_config()
    if dir_str in cfg.model_directories:
        cfg.model_directories.remove(dir_str)
        save_config(cfg)

    scan_and_update_models(refresh_only=False)
    return {"status": "ok", "directories": cfg.model_directories}


@app.get("/api/v1/models/{model_id:path}", dependencies=[Depends(verify_api_access)])
def get_single_model(model_id: str):
    model_id = urllib.parse.unquote(model_id)
    catalog = {m.id: m for m in load_models_catalog()}
    target_id = None
    if model_id in catalog:
        target_id = model_id
    else:
        for mid, m in catalog.items():
            if m.name == model_id or m.file_name == model_id or mid == model_id:
                target_id = mid
                break
    if not target_id:
        raise HTTPException(status_code=404, detail=f"Model ID '{model_id}' not found")
    model = catalog[target_id]
    compat = evaluate_model_compatibility(model)
    rec = RecommendationEngine.recommend(model)
    return {
        "model": model.model_dump(),
        "runtime_compatibility": compat,
        "recommendation": rec,
    }


@app.post("/api/v1/models/download", dependencies=[Depends(verify_api_access)])
def download_model(req: ModelDownloadRequest):
    if not req.license_confirmed:
        raise HTTPException(status_code=400, detail="Explicit user license confirmation is required before downloading model weights.")
    if ".." in req.destination_filename or "/" in req.destination_filename or "\\" in req.destination_filename:
        raise HTTPException(status_code=400, detail="Invalid destination filename: path traversal characters not allowed")
    dest_path = BASE_DIR / "models" / req.destination_filename
    if dest_path.is_file():
        raise HTTPException(status_code=400, detail="A file with this destination name already exists in models/")
    stat = psutil.disk_usage(str(BASE_DIR))
    if req.expected_size_bytes and stat.free < (req.expected_size_bytes + 2 * 1024 * 1024 * 1024):
        raise HTTPException(status_code=400, detail=f"Insufficient free disk space: requires {format_bytes(req.expected_size_bytes)} plus 2GB safety margin.")
    return {
        "status": "initiated",
        "destination": str(dest_path),
        "source_url": req.source_url,
        "validation": {
            "space_check_passed": True,
            "license_confirmed": True,
            "destination_available": True,
        },
        "message": f"Download target prepared at models/{req.destination_filename}.",
    }


@app.delete("/api/v1/models/{model_id:path}", dependencies=[Depends(verify_api_access)])
def remove_model(model_id: str):
    model_id = urllib.parse.unquote(model_id)
    catalog = {m.id: m for m in load_models_catalog()}
    target_id = None
    if model_id in catalog:
        target_id = model_id
    else:
        for mid, m in catalog.items():
            if m.name == model_id or m.file_name == model_id or mid == model_id:
                target_id = mid
                break

    if not target_id:
        raise HTTPException(status_code=404, detail="Model not found in registry")

    del catalog[target_id]
    save_models_catalog(list(catalog.values()))

    cfg = load_config()
    if cfg.active_model_id == target_id:
        remaining_available = [m for m in catalog.values() if m.is_available]
        if remaining_available:
            cfg.active_model_id = remaining_available[0].id
            new_active = remaining_available[0]
            cfg.active_runtime = resolve_compatible_runtime(new_active, cfg.active_runtime)
        else:
            cfg.active_model_id = ""
        save_config(cfg)

    return {"status": "ok", "message": f"Model '{target_id}' removed from registry cache without deleting file on disk"}


@app.get("/api/v1/config", dependencies=[Depends(verify_api_access)])
def get_engine_config():
    return load_config().model_dump()


@app.put("/api/v1/config", dependencies=[Depends(verify_api_access)])
@app.post("/api/v1/config", dependencies=[Depends(verify_api_access)])
def update_engine_config(config_data: Dict[str, Any]):
    try:
        updated = EngineConfig(**config_data)
        save_config(updated)
        return {"status": "ok", "config": updated.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid configuration format: {e}")


@app.post("/api/v1/config/recommend", dependencies=[Depends(verify_api_access)])
def recommend_config(req: RecommendationRequest):
    cfg = load_config()
    model_id = req.model_id or cfg.active_model_id
    models = {m.id: m for m in load_models_catalog()}
    target_model = models.get(model_id)
    ctx = req.context_length or cfg.llama_cpp.context_size
    return RecommendationEngine.recommend(target_model, context_len=ctx)


@app.post("/api/v1/config/validate", dependencies=[Depends(verify_api_access)])
def validate_engine_config(req: ConfigValidateRequest):
    cfg = load_config()
    model_id = req.model_id or cfg.active_model_id
    models = {m.id: m for m in load_models_catalog()}
    target_model = models.get(model_id)
    ctx = req.context_size or 2048

    rec = RecommendationEngine.recommend(target_model, context_len=ctx)
    safety_tier = rec["safety"]["tier"]
    is_valid = safety_tier != "EXCEEDS_MEMORY"
    warnings = []
    if safety_tier == "EXCEEDS_MEMORY":
        warnings.append(rec["safety"]["message"])
    elif safety_tier == "TIGHT":
        warnings.append("High memory utilization expected. Consider reducing context size or closing background apps.")

    threads = req.threads or rec["recommendations"]["threads"]
    hw = HardwareDetector.get_full_hardware_profile()
    if threads > hw["cpu"]["logical_threads"]:
        warnings.append(f"Requested threads ({threads}) exceeds system logical threads ({hw['cpu']['logical_threads']}).")

    return {
        "valid": is_valid,
        "safety_tier": safety_tier,
        "warnings": warnings,
        "estimated_ram_mb": round(rec["memory_breakdown"]["total_required_bytes"] / (1024 ** 2), 1),
        "recommendation": rec,
    }


@app.get("/api/v1/metrics", dependencies=[Depends(verify_api_access)])
@app.get("/api/v1/metrics/live", dependencies=[Depends(verify_api_access)])
def get_live_metrics():
    hw = HardwareDetector.get_full_hardware_profile()
    telem = telemetry.get_snapshot()

    return {
        "timestamp": time.time(),
        "cpu": {
            "name": hw["cpu"]["name"],
            "utilization_percent": hw["cpu"]["utilization_percent"],
            "per_core_percent": hw["cpu"]["per_core_percent"],
            "physical_cores": hw["cpu"]["physical_cores"],
            "logical_threads": hw["cpu"]["logical_threads"],
            "frequency_mhz": hw["cpu"]["frequency_mhz"],
            "temperature_celsius": hw["cpu"]["temperature_celsius"],
            "temperature_supported": hw["cpu"]["temperature_supported"],
        },
        "ram": hw["ram"],
        "gpu": hw["gpu"],
        "storage": hw["storage"],
        "inference": telem,
        "history": SystemSampler.get_history(),
        "active_runtime_status": {
            "llama_server": llama_manager.get_status(),
            "ollama": OllamaManager.get_status(),
        },
    }


@app.get("/api/v1/diagnostics", dependencies=[Depends(verify_api_access)])
def get_diagnostics():
    return run_diagnostics_suite()


@app.get("/api/v1/benchmark/summary", dependencies=[Depends(verify_api_access)])
def get_benchmarks():
    return read_historical_benchmarks()


@app.get("/api/v1/logs/llama", dependencies=[Depends(verify_api_access)])
def get_llama_logs(lines: int = 100):
    if not LLAMA_LOG_FILE.is_file():
        return {"logs": "No llama server log found."}
    try:
        content = LLAMA_LOG_FILE.read_text(encoding="utf-8", errors="replace")
        all_lines = content.splitlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": "\n".join(tail)}
    except Exception as e:
        return {"logs": f"Error reading log file: {e}"}


@app.get("/api/v1/logs/app", dependencies=[Depends(verify_api_access)])
def get_app_logs(lines: int = 100):
    if not APP_LOG_FILE.is_file():
        return {"logs": "No app log found."}
    try:
        content = APP_LOG_FILE.read_text(encoding="utf-8", errors="replace")
        all_lines = content.splitlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": "\n".join(tail)}
    except Exception as e:
        return {"logs": f"Error reading log file: {e}"}


@app.post("/api/v1/inference/generate", dependencies=[Depends(verify_api_access)])
async def project3_generate(req: InferenceGenerateRequest):
    cfg = load_config()
    catalog = {m.id: m for m in load_models_catalog()}
    target_model_id = req.model or cfg.active_model_id

    model_obj = catalog.get(target_model_id)
    if not model_obj:
        for m in catalog.values():
            if m.name == req.model or m.file_name == req.model:
                model_obj = m
                break

    if not model_obj and not req.model:
        raise HTTPException(
            status_code=400,
            detail="No model selected. Please scan models or select an active model in the Runtimes & Models tab.",
        )

    # Determine runtime dynamically from the model
    active_runtime = resolve_compatible_runtime(model_obj, cfg.active_runtime) if model_obj else cfg.active_runtime
    if active_runtime != cfg.active_runtime:
        cfg.active_runtime = active_runtime
        save_config(cfg)

    model_display_name = model_obj.name if model_obj else (req.model or "Default Model")
    model_runtime_ref = (model_obj.path if model_obj and model_obj.source == "ollama_api" else (model_obj.name if model_obj else req.model)) or req.model or ""

    telemetry.start_generation(model_display_name, active_runtime)

    if active_runtime == "ollama":
        ollama_stat = OllamaManager.get_status(cfg.ollama.base_url)
        if not ollama_stat["reachable"]:
            err = f"Ollama service unreachable at {cfg.ollama.base_url}"
            telemetry.finish_generation(error=err)
            raise HTTPException(status_code=503, detail=err)

        ollama_url = f"{cfg.ollama.base_url}/api/generate"
        payload = {
            "model": model_runtime_ref or "llama3.2:1b",
            "prompt": req.prompt,
            "stream": req.stream,
            "options": {
                "temperature": req.temperature,
                "num_predict": req.max_tokens,
            },
        }

        if req.stream:
            async def ollama_generate_stream():
                first_token = True
                async with httpx.AsyncClient(timeout=120.0) as client:
                    try:
                        async with client.stream("POST", ollama_url, json=payload) as resp:
                            if resp.status_code != 200:
                                err = f"Ollama HTTP {resp.status_code}"
                                telemetry.finish_generation(error=err)
                                yield f"data: {json.dumps({'error': err})}\n\n"
                                return

                            async for line in resp.aiter_lines():
                                if not line:
                                    continue
                                chunk = json.loads(line)
                                token = chunk.get("response", "")
                                done = chunk.get("done", False)

                                if first_token and token:
                                    telemetry.record_first_token()
                                    first_token = False

                                if token:
                                    telemetry.record_tokens(1)
                                    yield f"data: {json.dumps({'token': token, 'done': False})}\n\n"

                                if done:
                                    telemetry.finish_generation()
                                    snap = telemetry.get_snapshot()
                                    final_payload = {
                                        "token": "",
                                        "done": True,
                                        "metrics": {
                                            "tokens_generated": snap["tokens_generated"],
                                            "tokens_per_second": snap["tokens_per_second"],
                                            "time_to_first_token_sec": snap["time_to_first_token_sec"],
                                            "total_duration_sec": snap["last_duration_sec"],
                                        },
                                    }
                                    yield f"data: {json.dumps(final_payload)}\n\n"
                                    yield "data: [DONE]\n\n"
                                    break
                    except Exception as e:
                        telemetry.finish_generation(error=str(e))
                        yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(ollama_generate_stream(), media_type="text/event-stream")

        else:
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(ollama_url, json=payload)
                    if resp.status_code != 200:
                        err = f"Ollama HTTP {resp.status_code}: {resp.text}"
                        telemetry.finish_generation(error=err)
                        raise HTTPException(status_code=resp.status_code, detail=err)

                    data = resp.json()
                    response_text = data.get("response", "")
                    telemetry.record_first_token()
                    eval_count = data.get("eval_count", len(response_text.split()))
                    telemetry.record_tokens(eval_count)
                    telemetry.finish_generation()
                    snap = telemetry.get_snapshot()

                    return {
                        "model": model_display_name,
                        "runtime": active_runtime,
                        "prompt": req.prompt,
                        "response": response_text,
                        "metrics": {
                            "tokens_generated": snap["tokens_generated"],
                            "tokens_per_second": snap["tokens_per_second"],
                            "time_to_first_token_sec": snap["time_to_first_token_sec"],
                            "total_duration_sec": snap["last_duration_sec"],
                        },
                    }
            except Exception as e:
                telemetry.finish_generation(error=str(e))
                raise HTTPException(status_code=500, detail=str(e))

    else:
        if not llama_manager.is_running():
            err = "llama.cpp server is not currently running. Start the server from Runtimes tab or API before requesting inference."
            telemetry.finish_generation(error=err)
            raise HTTPException(status_code=503, detail=err)

        llama_url = f"http://{cfg.llama_cpp.host}:{cfg.llama_cpp.port}/completion"
        payload = {
            "prompt": req.prompt,
            "temperature": req.temperature,
            "n_predict": req.max_tokens,
            "stream": req.stream,
        }
        if req.stop:
            payload["stop"] = [req.stop] if isinstance(req.stop, str) else req.stop

        if req.stream:
            async def llama_generate_stream():
                first_token = True
                async with httpx.AsyncClient(timeout=120.0) as client:
                    try:
                        async with client.stream("POST", llama_url, json=payload) as resp:
                            if resp.status_code != 200:
                                err = f"llama-server error HTTP {resp.status_code}"
                                telemetry.finish_generation(error=err)
                                yield f"data: {json.dumps({'error': err})}\n\n"
                                return

                            async for line in resp.aiter_lines():
                                if not line:
                                    continue
                                if line.startswith("data: "):
                                    payload_str = line[6:].strip()
                                    if payload_str == "[DONE]":
                                        telemetry.finish_generation()
                                        yield "data: [DONE]\n\n"
                                        break
                                    try:
                                        chunk = json.loads(payload_str)
                                        token = chunk.get("content", "")
                                        stop = chunk.get("stop", False)

                                        if first_token and token:
                                            telemetry.record_first_token()
                                            first_token = False

                                        if token:
                                            telemetry.record_tokens(1)
                                            yield f"data: {json.dumps({'token': token, 'done': False})}\n\n"

                                        if stop:
                                            telemetry.finish_generation()
                                            snap = telemetry.get_snapshot()
                                            final_payload = {
                                                "token": "",
                                                "done": True,
                                                "metrics": {
                                                    "tokens_generated": snap["tokens_generated"],
                                                    "tokens_per_second": snap["tokens_per_second"],
                                                    "time_to_first_token_sec": snap["time_to_first_token_sec"],
                                                    "total_duration_sec": snap["last_duration_sec"],
                                                },
                                            }
                                            yield f"data: {json.dumps(final_payload)}\n\n"
                                            yield "data: [DONE]\n\n"
                                            break
                                    except Exception:
                                        pass
                    except Exception as e:
                        telemetry.finish_generation(error=str(e))
                        yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(llama_generate_stream(), media_type="text/event-stream")

        else:
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(llama_url, json=payload)
                    if resp.status_code != 200:
                        err = f"llama-server HTTP {resp.status_code}: {resp.text}"
                        telemetry.finish_generation(error=err)
                        raise HTTPException(status_code=resp.status_code, detail=err)

                    data = resp.json()
                    response_text = data.get("content", "")
                    telemetry.record_first_token()
                    tokens_gen = data.get("tokens_predicted", len(response_text.split()))
                    telemetry.record_tokens(tokens_gen)
                    telemetry.finish_generation()
                    snap = telemetry.get_snapshot()

                    return {
                        "model": model_display_name,
                        "runtime": active_runtime,
                        "prompt": req.prompt,
                        "response": response_text,
                        "metrics": {
                            "tokens_generated": snap["tokens_generated"],
                            "tokens_per_second": snap["tokens_per_second"],
                            "time_to_first_token_sec": snap["time_to_first_token_sec"],
                            "total_duration_sec": snap["last_duration_sec"],
                        },
                    }
            except Exception as e:
                telemetry.finish_generation(error=str(e))
                raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/inference/stop", dependencies=[Depends(verify_api_access)])
@app.post("/api/v1/generate/stop", dependencies=[Depends(verify_api_access)])
def stop_inference_generation():
    telemetry.finish_generation(error="Inference aborted by request")
    return {"status": "ok", "message": "Inference generation halted"}


@app.post("/api/v1/chat/completions", dependencies=[Depends(verify_api_access)])
async def chat_completions(req: ChatCompletionRequest):
    cfg = load_config()
    catalog = {m.id: m for m in load_models_catalog()}
    target_id = req.model or cfg.active_model_id
    model_obj = catalog.get(target_id)
    if not model_obj:
        for m in catalog.values():
            if m.name == req.model or m.file_name == req.model:
                model_obj = m
                break

    if not model_obj and not req.model:
        raise HTTPException(
            status_code=400,
            detail="No model selected. Please scan models or select an active model in the Runtimes & Models tab.",
        )

    active_runtime = resolve_compatible_runtime(model_obj, cfg.active_runtime) if model_obj else cfg.active_runtime
    if active_runtime != cfg.active_runtime:
        cfg.active_runtime = active_runtime
        save_config(cfg)

    model_name = model_obj.name if model_obj else (req.model or "Selected Model")
    telemetry.start_generation(model_name, active_runtime)

    if active_runtime == "ollama":
        target_model = req.model or (model_obj.path if model_obj and model_obj.source == "ollama_api" else (model_obj.name if model_obj else "llama3.2:1b"))
        ollama_url = f"{cfg.ollama.base_url}/api/chat"
        payload = {
            "model": target_model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "stream": req.stream,
            "options": {
                "temperature": req.temperature,
                "num_predict": req.max_tokens,
            },
        }

        if req.stream:
            async def ollama_stream_generator():
                first_token = True
                total_text = ""
                async with httpx.AsyncClient(timeout=120.0) as client:
                    try:
                        async with client.stream("POST", ollama_url, json=payload) as resp:
                            if resp.status_code != 200:
                                err = f"Ollama returned HTTP {resp.status_code}"
                                telemetry.finish_generation(error=err)
                                yield f"data: {json.dumps({'error': err})}\n\n"
                                return

                            async for line in resp.aiter_lines():
                                if not line:
                                    continue
                                try:
                                    chunk = json.loads(line)
                                    msg = chunk.get("message", {}).get("content", "")
                                    done = chunk.get("done", False)

                                    if first_token and msg:
                                        telemetry.record_first_token()
                                        first_token = False

                                    if msg:
                                        telemetry.record_tokens(1)
                                        total_text += msg
                                        chunk_data = {
                                            "id": f"chatcmpl-{int(time.time()*1000)}",
                                            "object": "chat.completion.chunk",
                                            "created": int(time.time()),
                                            "model": target_model,
                                            "choices": [{
                                                "index": 0,
                                                "delta": {"content": msg},
                                                "finish_reason": None,
                                            }],
                                        }
                                        yield f"data: {json.dumps(chunk_data)}\n\n"

                                    if done:
                                        telemetry.finish_generation()
                                        end_chunk = {
                                            "id": f"chatcmpl-{int(time.time()*1000)}",
                                            "object": "chat.completion.chunk",
                                            "created": int(time.time()),
                                            "model": target_model,
                                            "choices": [{
                                                "index": 0,
                                                "delta": {},
                                                "finish_reason": "stop",
                                            }],
                                        }
                                        yield f"data: {json.dumps(end_chunk)}\n\n"
                                        yield "data: [DONE]\n\n"
                                        break
                                except Exception as e:
                                    logger.error(f"Error parsing Ollama stream chunk: {e}")
                    except Exception as e:
                        telemetry.finish_generation(error=str(e))
                        yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(ollama_stream_generator(), media_type="text/event-stream")

        else:
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(ollama_url, json=payload)
                    if resp.status_code != 200:
                        err = f"Ollama HTTP {resp.status_code}: {resp.text}"
                        telemetry.finish_generation(error=err)
                        raise HTTPException(status_code=resp.status_code, detail=err)
                    data = resp.json()
                    content = data.get("message", {}).get("content", "")
                    telemetry.record_first_token()
                    telemetry.record_tokens(len(content.split()))
                    telemetry.finish_generation()

                    return {
                        "id": f"chatcmpl-{int(time.time())}",
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": target_model,
                        "choices": [{
                            "index": 0,
                            "message": {"role": "assistant", "content": content},
                            "finish_reason": "stop",
                        }],
                        "usage": {
                            "prompt_tokens": data.get("prompt_eval_count", 0),
                            "completion_tokens": data.get("eval_count", 0),
                            "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
                        },
                    }
            except Exception as e:
                telemetry.finish_generation(error=str(e))
                raise HTTPException(status_code=500, detail=str(e))

    else:
        if not llama_manager.is_running():
            telemetry.finish_generation(error="llama-server is not running")
            raise HTTPException(
                status_code=503,
                detail="llama.cpp server is not currently running. Please start it from Runtimes tab.",
            )

        llama_url = f"http://{cfg.llama_cpp.host}:{cfg.llama_cpp.port}/v1/chat/completions"
        payload = {
            "model": req.model or model_name,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
            "stream": req.stream,
        }
        if req.stop:
            payload["stop"] = req.stop

        if req.stream:
            async def llama_stream_generator():
                first_token = True
                async with httpx.AsyncClient(timeout=120.0) as client:
                    try:
                        async with client.stream("POST", llama_url, json=payload) as resp:
                            if resp.status_code != 200:
                                err = f"llama-server error HTTP {resp.status_code}"
                                telemetry.finish_generation(error=err)
                                yield f"data: {json.dumps({'error': err})}\n\n"
                                return

                            async for line in resp.aiter_lines():
                                if not line:
                                    continue
                                if line.startswith("data: "):
                                    payload_str = line[6:].strip()
                                    if payload_str == "[DONE]":
                                        telemetry.finish_generation()
                                        yield "data: [DONE]\n\n"
                                        break
                                    try:
                                        chunk = json.loads(payload_str)
                                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                                        content = delta.get("content", "")
                                        if first_token and content:
                                            telemetry.record_first_token()
                                            first_token = False
                                        if content:
                                            telemetry.record_tokens(1)
                                    except Exception:
                                        pass
                                yield f"{line}\n\n"
                    except Exception as e:
                        telemetry.finish_generation(error=str(e))
                        yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(llama_stream_generator(), media_type="text/event-stream")

        else:
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(llama_url, json=payload)
                    if resp.status_code != 200:
                        err = f"llama-server HTTP {resp.status_code}: {resp.text}"
                        telemetry.finish_generation(error=err)
                        raise HTTPException(status_code=resp.status_code, detail=err)
                    data = resp.json()
                    telemetry.record_first_token()
                    usage = data.get("usage", {})
                    completion_tokens = usage.get("completion_tokens", 10)
                    telemetry.record_tokens(completion_tokens)
                    telemetry.finish_generation()
                    return data
            except Exception as e:
                telemetry.finish_generation(error=str(e))
                raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/benchmarks", dependencies=[Depends(verify_api_access)])
def get_all_benchmarks():
    return {
        "historical": read_historical_benchmarks(),
        "measured": load_benchmarks(),
    }


@app.post("/api/v1/benchmarks", dependencies=[Depends(verify_api_access)])
async def run_benchmark_endpoint(req: BenchmarkRunRequest):
    return await execute_benchmark_run(req)


@app.get("/api/v1/benchmarks/{benchmark_id}", dependencies=[Depends(verify_api_access)])
def get_single_benchmark(benchmark_id: str):
    benches = load_benchmarks()
    for b in benches:
        if b.get("id") == benchmark_id:
            return b
    raise HTTPException(status_code=404, detail="Benchmark record not found")


@app.delete("/api/v1/benchmarks/{benchmark_id}", dependencies=[Depends(verify_api_access)])
def delete_single_benchmark(benchmark_id: str):
    benches = load_benchmarks()
    filtered = [b for b in benches if b.get("id") != benchmark_id]
    if len(filtered) == len(benches):
        raise HTTPException(status_code=404, detail="Benchmark record not found")
    save_benchmarks(filtered)
    return {"status": "deleted", "id": benchmark_id}


@app.get("/api/v1/evaluations", dependencies=[Depends(verify_api_access)])
def get_all_evaluations():
    return {"evaluations": load_evaluations()}


@app.post("/api/v1/evaluations/run", dependencies=[Depends(verify_api_access)])
async def run_quality_evaluation_endpoint(req: QualityEvaluationRequest):
    return await execute_quality_evaluation(req)


@app.post("/api/v1/evaluations/{eval_id}/rating", dependencies=[Depends(verify_api_access)])
def rate_evaluation(eval_id: str, req: QualityRatingRequest):
    evals = load_evaluations()
    for e in evals:
        if e.get("id") == eval_id:
            e["human_rating"] = req.rating
            e["human_feedback"] = req.feedback
            e["human_evaluator"] = req.evaluator
            save_evaluations(evals)
            return {"status": "success", "evaluation": e}
    raise HTTPException(status_code=404, detail="Evaluation record not found")


# ==========================================
# AI Model Advisor & Auto Setup API Endpoints
# ==========================================

@app.get("/api/v1/advisor/hardware-summary", dependencies=[Depends(verify_api_access)])
def get_advisor_hardware_summary():
    hw = HardwareDetector.get_full_hardware_profile()
    cfg = load_config()
    total_ram = hw["ram"]["total_bytes"]
    avail_ram = hw["ram"]["available_bytes"]
    max_safe_model_bytes = int(avail_ram * 0.75)

    return {
        "status": "ok",
        "cpu": {
            "model": hw["cpu"].get("name", "Unknown CPU"),
            "architecture": hw["cpu"].get("architecture", "x86_64"),
            "physical_cores": hw["cpu"].get("physical_cores", 4),
            "logical_threads": hw["cpu"].get("logical_threads", 4),
            "features": hw["cpu"].get("features", []),
        },
        "ram": {
            "total_bytes": total_ram,
            "total_formatted": format_bytes(total_ram),
            "available_bytes": avail_ram,
            "available_formatted": format_bytes(avail_ram),
            "used_percent": hw["ram"].get("utilization_percent", 0.0),
        },
        "gpu": {
            "detected": hw.get("gpu", {}).get("detected", False),
            "name": hw.get("gpu", {}).get("name", "None"),
            "vendor": hw.get("gpu", {}).get("vendor", "None"),
            "dedicated_vram_bytes": hw.get("gpu", {}).get("dedicated_vram_bytes", 0),
            "dedicated_vram_formatted": hw.get("gpu", {}).get("dedicated_vram_formatted", "0 B"),
        },
        "storage": hw.get("storage", []),
        "active_runtime": cfg.active_runtime,
        "max_safe_model_bytes": max_safe_model_bytes,
        "max_safe_model_formatted": format_bytes(max_safe_model_bytes),
    }


@app.post("/api/v1/advisor/recommendations", dependencies=[Depends(verify_api_access)])
def get_advisor_recommendations(req: AdvisorRecommendationRequest):
    hw = HardwareDetector.get_full_hardware_profile()
    cfg = load_config()

    catalog = online_catalog.get_catalog(
        query=req.search_query or "",
        source=req.catalog_source or "all",
        force_refresh=req.force_refresh or False,
    )

    eval_result = AIModelAdvisorEngine.evaluate_all(
        hw=hw,
        catalog_models=catalog,
        workload=req.workload or "general",
        preference=req.preference or "balanced",
    )

    return {
        "status": "ok",
        "active_runtime": cfg.active_runtime,
        "active_model_id": cfg.active_model_id,
        "hardware_summary": {
            "ram_total": format_bytes(hw["ram"]["total_bytes"]),
            "ram_available": format_bytes(hw["ram"]["available_bytes"]),
            "cpu_cores": hw["cpu"].get("physical_cores", 4),
            "gpu_name": hw.get("gpu", {}).get("name", "None"),
            "vram": hw.get("gpu", {}).get("dedicated_vram_formatted", "0 B"),
        },
        "workload": eval_result["workload"],
        "preference": eval_result["preference"],
        "counts_by_tier": eval_result["counts_by_tier"],
        "total_catalog_models": len(catalog),
        "recommendations": eval_result["models"],
    }


@app.post("/api/v1/advisor/setup", dependencies=[Depends(verify_api_access)])
def initiate_advisor_setup(req: AdvisorSetupRequest):
    return setup_manager.start_setup(req)


@app.get("/api/v1/advisor/setup/{task_id}/progress", dependencies=[Depends(verify_api_access)])
def get_advisor_setup_progress(task_id: str):
    prog = setup_manager.get_progress(task_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Setup task not found")
    return prog


@app.post("/api/v1/advisor/setup/{task_id}/cancel", dependencies=[Depends(verify_api_access)])
def cancel_advisor_setup(task_id: str):
    return setup_manager.cancel_setup(task_id)


@app.get("/api/v1/advisor/runtimes/install-guide/{runtime_id}", dependencies=[Depends(verify_api_access)])
def get_runtime_install_guide(runtime_id: str):
    clean_id = runtime_id.strip()
    if clean_id not in RUNTIME_INSTALL_GUIDES:
        for k, v in RUNTIME_INSTALL_GUIDES.items():
            if k.lower() == clean_id.lower() or v["display_name"].lower() == clean_id.lower():
                clean_id = k
                break

    if clean_id not in RUNTIME_INSTALL_GUIDES:
        raise HTTPException(status_code=404, detail=f"Runtime guide for '{runtime_id}' not found")

    guide = dict(RUNTIME_INSTALL_GUIDES[clean_id])
    adapter = runtime_registry.get(clean_id)
    if adapter:
        detection = adapter.detect()
        guide["current_status"] = detection
        guide["is_connected"] = adapter.test_connection()
    else:
        guide["current_status"] = {"available": False, "message": "Runtime adapter not registered"}
        guide["is_connected"] = False

    return {"status": "ok", "guide": guide}


app.mount("/static", StaticFiles(directory=BASE_DIR / "frontend"), name="static")


@app.get("/")
def serve_index():
    return FileResponse(BASE_DIR / "frontend" / "index.html")


@app.get("/style.css")
def serve_css():
    return FileResponse(BASE_DIR / "frontend" / "style.css", media_type="text/css")


@app.get("/script.js")
def serve_js():
    return FileResponse(BASE_DIR / "frontend" / "script.js", media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn
    cfg = load_config()
    host = cfg.security.listen_host if cfg.security.allow_remote_access else "127.0.0.1"
    port = cfg.security.listen_port or 8000
    uvicorn.run("main:app", host=host, port=port, reload=False, log_level="info")
