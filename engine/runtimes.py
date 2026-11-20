import importlib.util
import json
import logging
import os
import platform
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import psutil
from fastapi import HTTPException

from engine.config import (
    BASE_DIR,
    LLAMA_LOG_FILE,
    ModelEntry,
    file_lock,
    find_system_llama_server,
    format_bytes,
    load_config,
    load_models_catalog,
    logger,
    parse_gguf_metadata,
    parse_onnx_metadata,
    parse_safetensors_metadata,
    resolve_compatible_runtime,
    save_config,
    save_models_catalog,
)
from engine.hardware import HardwareDetector
from engine.telemetry import telemetry


class LlamaServerManager:
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.lock = threading.Lock()
        self.port: int = 8080
        self.host: str = "127.0.0.1"
        self.model_path: str = ""
        self.start_time: float = 0.0
        self.args: List[str] = []

    def is_running(self) -> bool:
        with self.lock:
            if self.process is None:
                return False
            poll = self.process.poll()
            return poll is None

    def get_status(self) -> Dict[str, Any]:
        running = self.is_running()
        pid = self.process.pid if (running and self.process) else None
        rss_bytes = 0
        if pid:
            try:
                proc = psutil.Process(pid)
                rss_bytes = proc.memory_info().rss
            except Exception:
                pass

        healthy = False
        if running:
            try:
                resp = httpx.get(f"http://{self.host}:{self.port}/health", timeout=1.5)
                healthy = resp.status_code == 200
            except Exception:
                healthy = False

        return {
            "running": running,
            "healthy": healthy,
            "pid": pid,
            "port": self.port,
            "host": self.host,
            "model_path": self.model_path,
            "uptime_seconds": round(time.time() - self.start_time, 1) if running else 0,
            "memory_rss_bytes": rss_bytes,
            "memory_rss_formatted": format_bytes(rss_bytes) if rss_bytes else "0 B",
            "args": self.args,
        }

    def stop(self) -> Dict[str, Any]:
        with self.lock:
            if self.process is None:
                return {"stopped": True, "message": "llama-server was not running"}
            try:
                self.process.terminate()
                try:
                    self.process.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=2)
            except Exception as e:
                logger.error(f"Error terminating llama-server: {e}")
            finally:
                self.process = None
        return {"stopped": True, "message": "llama-server terminated cleanly"}

    def start(
        self,
        exe_path: str,
        model_path: str,
        host: str = "127.0.0.1",
        port: int = 8080,
        threads: int = 4,
        gpu_layers: int = 0,
        context_size: int = 2048,
        batch_size: int = 512,
        ubatch_size: int = 512,
        use_mmap: bool = True,
        flash_attn: bool = False,
    ) -> Dict[str, Any]:
        resolved_exe = (BASE_DIR / exe_path).resolve() if not Path(exe_path).is_absolute() else Path(exe_path)
        if not resolved_exe.is_file():
            raise HTTPException(status_code=400, detail=f"llama-server executable not found at: {resolved_exe}")

        resolved_model = (BASE_DIR / model_path).resolve() if not Path(model_path).is_absolute() else Path(model_path)
        if not resolved_model.is_file():
            raise HTTPException(status_code=400, detail=f"Model file not found at: {resolved_model}")

        self.stop()

        cmd = [
            str(resolved_exe),
            "-m", str(resolved_model),
            "-c", str(context_size),
            "-t", str(threads),
            "-ngl", str(gpu_layers),
            "-b", str(batch_size),
            "-ub", str(ubatch_size),
            "--host", str(host),
            "--port", str(port),
        ]
        if not use_mmap:
            cmd.append("--no-mmap")
        if flash_attn:
            cmd.append("-fa")

        log_f = open(LLAMA_LOG_FILE, "a", encoding="utf-8")
        log_f.write(f"\n--- Launching llama-server at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
        log_f.write(f"Command: {' '.join(cmd)}\n")
        log_f.flush()

        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=log_f,
                stderr=subprocess.STDOUT,
                cwd=str(resolved_exe.parent),
                text=False,
            )
            self.host = host
            self.port = port
            self.model_path = str(resolved_model)
            self.start_time = time.time()
            self.args = cmd
        except Exception as e:
            log_f.close()
            raise HTTPException(status_code=500, detail=f"Failed to spawn llama-server process: {e}")

        ready = False
        for _ in range(30):
            time.sleep(0.3)
            if self.process.poll() is not None:
                break
            try:
                resp = httpx.get(f"http://{host}:{port}/health", timeout=1.0)
                if resp.status_code == 200:
                    ready = True
                    break
            except Exception:
                continue

        if not ready and self.process.poll() is not None:
            code = self.process.returncode
            self.process = None
            raise HTTPException(
                status_code=500,
                detail=f"llama-server exited immediately with return code {code}. Check storage/llama_server.log for details.",
            )

        return {
            "status": "ready" if ready else "initializing",
            "pid": self.process.pid,
            "port": port,
            "host": host,
            "model": str(resolved_model.name),
        }


llama_manager = LlamaServerManager()


class OllamaManager:
    @staticmethod
    def get_status(base_url: str = "http://127.0.0.1:11434") -> Dict[str, Any]:
        try:
            resp = httpx.get(f"{base_url}/api/version", timeout=1.5)
            if resp.status_code == 200:
                data = resp.json()
                version = data.get("version", "unknown")
                running_models = []
                try:
                    ps_resp = httpx.get(f"{base_url}/api/ps", timeout=1.5)
                    if ps_resp.status_code == 200:
                        running_models = ps_resp.json().get("models", [])
                except Exception:
                    pass

                return {
                    "reachable": True,
                    "version": version,
                    "base_url": base_url,
                    "running_models": running_models,
                }
        except Exception:
            pass
        return {
            "reachable": False,
            "version": "Unavailable",
            "base_url": base_url,
            "running_models": [],
        }

    @staticmethod
    def list_models(base_url: str = "http://127.0.0.1:11434") -> List[Dict[str, Any]]:
        try:
            resp = httpx.get(f"{base_url}/api/tags", timeout=2.0)
            if resp.status_code == 200:
                return resp.json().get("models", [])
        except Exception as e:
            logger.debug(f"Ollama list_models note: {e}")
        return []

    @staticmethod
    def show_model(tag: str, base_url: str = "http://127.0.0.1:11434") -> Dict[str, Any]:
        try:
            resp = httpx.post(f"{base_url}/api/show", json={"name": tag}, timeout=2.5)
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        return {}


def start_ollama_runtime(model: ModelEntry) -> Dict[str, Any]:
    """
    Activates the Ollama runtime for the specified Ollama model.
    Pings/preloads model via Ollama API and reconciles engine configuration.
    Never spawns llama-server.exe.
    """
    cfg = load_config()
    stat = OllamaManager.get_status(cfg.ollama.base_url)
    if not stat["reachable"]:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama daemon is offline at {cfg.ollama.base_url}. Please launch the Ollama service.",
        )

    tag = model.path or model.name
    try:
        httpx.post(
            f"{cfg.ollama.base_url}/api/generate",
            json={"model": tag, "prompt": "", "keep_alive": "5m"},
            timeout=8.0,
        )
    except Exception as e:
        logger.debug(f"Ollama model preload note: {e}")

    with file_lock:
        cfg = load_config()
        cfg.active_model_id = model.id
        cfg.active_runtime = "ollama"
        save_config(cfg)

    return {
        "status": "ready",
        "runtime": "ollama",
        "model": model.name,
        "message": f"Ollama runtime active with model '{model.name}'",
        "details": stat,
    }


def get_common_model_directories() -> List[Path]:
    """
    Returns standard locations across Windows, macOS, and Linux where local AI tools store models:
    - Hugging Face cache hub (~/.cache/huggingface/hub)
    - Ollama manifests & blob storage (~/.ollama/models)
    - LM Studio cache (~/.cache/lm-studio/models, ~/.lmstudio/models)
    - GPT4All models directory (%LOCALAPPDATA%/nomic.ai/GPT4All, ~/.local/share/nomic.ai/GPT4All)
    - Workspace 'models' directory
    """
    candidates: List[Path] = [
        BASE_DIR / "models",
    ]
    home = Path.home()
    candidates.extend([
        home / ".cache" / "huggingface" / "hub",
        home / ".cache" / "lm-studio" / "models",
        home / ".lmstudio" / "models",
        home / "models",
    ])
    sys_name = platform.system()
    if sys_name == "Windows":
        localappdata = os.environ.get("LOCALAPPDATA", "")
        if localappdata:
            candidates.append(Path(localappdata) / "nomic.ai" / "GPT4All")
            candidates.append(Path(localappdata) / "LM Studio" / "models")
        userprofile = os.environ.get("USERPROFILE", "")
        if userprofile:
            candidates.append(Path(userprofile) / ".ollama" / "models")
    else:
        candidates.extend([
            home / ".local" / "share" / "nomic.ai" / "GPT4All",
            home / ".ollama" / "models",
        ])

    existing: List[Path] = []
    seen = set()
    for c in candidates:
        try:
            resolved = c.resolve()
            if resolved.is_dir() and str(resolved) not in seen:
                seen.add(str(resolved))
                existing.append(resolved)
        except Exception:
            pass
    return existing


def scan_and_update_models(refresh_only: bool = False) -> List[ModelEntry]:
    cfg = load_config()
    existing_catalog = load_models_catalog()
    catalog_by_id = {m.id: m for m in existing_catalog}
    updated: Dict[str, ModelEntry] = {}

    ollama_stat = OllamaManager.get_status(cfg.ollama.base_url)
    active_ollama_tags = set()
    if ollama_stat["reachable"]:
        raw_ollama = OllamaManager.list_models(cfg.ollama.base_url)
        for om in raw_ollama:
            tag = om.get("name", "")
            if tag:
                active_ollama_tags.add(tag)

    for m in existing_catalog:
        if m.source in ("local_directory", "manual_addition", "huggingface_cache", "lm_studio", "ollama_disk"):
            p = Path(m.path)
            if not p.is_absolute():
                p = (BASE_DIR / p).resolve()
            if p.is_file() or p.is_dir():
                m.is_available = True
                m.status_message = "Available"
                if p.is_file():
                    m.size_bytes = p.stat().st_size
                    m.size_formatted = format_bytes(m.size_bytes)
                updated[m.id] = m
            else:
                m.is_available = False
                m.status_message = "File or folder missing on disk"
                updated[m.id] = m
        elif m.source == "ollama_api":
            if ollama_stat["reachable"]:
                if m.path in active_ollama_tags or m.name in active_ollama_tags:
                    m.is_available = True
                    m.status_message = "Available in Ollama"
                    updated[m.id] = m
                else:
                    m.is_available = False
                    m.status_message = "Model no longer in Ollama"
                    updated[m.id] = m
            else:
                # If daemon is offline, check if manifests exist locally
                has_manifest = False
                try:
                    m_path = Path.home() / ".ollama" / "models" / "manifests" / "registry.ollama.ai" / "library" / m.name.replace(":", "/")
                    if not m_path.is_file() and platform.system() == "Windows":
                        up = os.environ.get("USERPROFILE", "")
                        if up:
                            m_path = Path(up) / ".ollama" / "models" / "manifests" / "registry.ollama.ai" / "library" / m.name.replace(":", "/")
                    has_manifest = m_path.is_file()
                except Exception:
                    pass

                if has_manifest:
                    m.is_available = True
                    m.status_message = "Installed locally in Ollama (service stopped)"
                    updated[m.id] = m
                else:
                    m.is_available = False
                    m.status_message = "Ollama service offline"
                    updated[m.id] = m

    if not refresh_only:
        # 1. Scan Ollama API if reachable
        if ollama_stat["reachable"]:
            raw_ollama = OllamaManager.list_models(cfg.ollama.base_url)
            for om in raw_ollama:
                tag = om.get("name", "")
                if not tag:
                    continue
                clean_id = f"ollama_{tag.replace(':', '_').replace('.', '_')}"
                size = om.get("size", 0)
                details = om.get("details", {})
                quant = details.get("quantization_level", "Unknown")
                family = details.get("family", "llama")
                param_size = details.get("parameter_size", "")

                show_info = OllamaManager.show_model(tag, cfg.ollama.base_url)
                if show_info:
                    s_details = show_info.get("details", {})
                    quant = s_details.get("quantization_level") or quant
                    param_size = s_details.get("parameter_size") or param_size
                    family = s_details.get("family") or family

                entry = ModelEntry(
                    id=clean_id,
                    name=tag,
                    file_name=tag,
                    path=tag,
                    format="Ollama",
                    quantization=quant,
                    size_bytes=size,
                    size_formatted=format_bytes(size),
                    architecture=family,
                    parameter_size=param_size or "Unknown",
                    context_length=details.get("context_length", 4096),
                    runtime_compatibility=["ollama"],
                    is_available=True,
                    status_message="Available in Ollama",
                    location_drive="System Disk",
                    source="ollama_api",
                    modified_at=om.get("modified_at"),
                )
                updated[clean_id] = entry
        else:
            # Check Ollama manifests on disk even if daemon is stopped
            ollama_manifest_dirs = [
                Path.home() / ".ollama" / "models" / "manifests" / "registry.ollama.ai",
            ]
            if platform.system() == "Windows":
                up = os.environ.get("USERPROFILE", "")
                if up:
                    ollama_manifest_dirs.append(Path(up) / ".ollama" / "models" / "manifests" / "registry.ollama.ai")

            for mdir in ollama_manifest_dirs:
                if mdir.is_dir():
                    for mf in mdir.rglob("*"):
                        if mf.is_file():
                            try:
                                rel = mf.relative_to(mdir)
                                tag = str(rel).replace("\\", "/").replace("library/", "")
                                clean_id = f"ollama_{tag.replace(':', '_').replace('.', '_').replace('/', '_')}"
                                if clean_id not in updated:
                                    with open(mf, "r", encoding="utf-8") as f_mf:
                                        m_data = json.load(f_mf)
                                    layers = m_data.get("layers", [])
                                    total_sz = sum(l.get("size", 0) for l in layers)
                                    entry = ModelEntry(
                                        id=clean_id,
                                        name=tag.replace("/", ":") if "/" in tag else tag,
                                        file_name=tag.split("/")[-1],
                                        path=tag,
                                        format="Ollama",
                                        quantization="Q4/Q8",
                                        size_bytes=total_sz,
                                        size_formatted=format_bytes(total_sz),
                                        architecture="llama",
                                        parameter_size="1B-7B",
                                        context_length=4096,
                                        runtime_compatibility=["ollama"],
                                        is_available=True,
                                        status_message="Installed locally in Ollama (service stopped)",
                                        location_drive="System Disk",
                                        source="ollama_disk",
                                    )
                                    updated[clean_id] = entry
                            except Exception as ex:
                                logger.debug(f"Ollama manifest read error: {ex}")

        # 2. Gather directories to scan: configured + common AI locations
        scan_dirs = []
        for d_str in cfg.model_directories:
            p = (BASE_DIR / d_str).resolve() if not Path(d_str).is_absolute() else Path(d_str)
            if p.is_dir() and p not in scan_dirs:
                scan_dirs.append(p)
        for cd in get_common_model_directories():
            if cd not in scan_dirs:
                scan_dirs.append(cd)

        seen_paths = set()
        for p in scan_dirs:
            # Special handling for Hugging Face Hub cache
            if "huggingface" in str(p).lower() and "hub" in str(p).lower():
                for m_dir in p.glob("models--*"):
                    repo_name = m_dir.name.replace("models--", "").replace("--", "/")
                    snaps_dir = m_dir / "snapshots"
                    if not snaps_dir.is_dir():
                        continue
                    for snap in snaps_dir.iterdir():
                        if not snap.is_dir():
                            continue

                        # Check for GGUF files in HF snapshot
                        for gguf_file in snap.glob("*.gguf"):
                            if str(gguf_file) in seen_paths or gguf_file.name in seen_paths:
                                continue
                            seen_paths.add(str(gguf_file))
                            seen_paths.add(gguf_file.name)
                            clean_id = gguf_file.stem.lower().replace(" ", "_").replace(".", "_")
                            meta = parse_gguf_metadata(gguf_file)
                            sz = gguf_file.stat().st_size
                            updated[clean_id] = ModelEntry(
                                id=clean_id,
                                name=gguf_file.name,
                                file_name=gguf_file.name,
                                path=str(gguf_file.resolve()),
                                format="GGUF",
                                quantization=meta.get("quantization", "Unknown"),
                                size_bytes=sz,
                                size_formatted=format_bytes(sz),
                                architecture=meta.get("architecture", "gguf"),
                                parameter_size=meta.get("size_label", "Custom") or "Custom",
                                context_length=meta.get("context_length", 4096),
                                runtime_compatibility=["llama.cpp server", "ollama"],
                                is_available=True,
                                status_message="Available in Hugging Face cache",
                                location_drive=gguf_file.drive if gguf_file.drive else "Drive",
                                source="huggingface_cache",
                            )

                        # Check for Safetensors / PyTorch models in HF snapshot
                        cfg_file = snap / "config.json"
                        if cfg_file.is_file():
                            st_files = list(snap.glob("*.safetensors"))
                            bin_files = list(snap.glob("*.bin"))
                            if st_files or bin_files:
                                model_files = st_files or bin_files
                                total_sz = sum(f.stat().st_size for f in model_files)
                                clean_id = f"hf_{repo_name.replace('/', '_').replace('.', '_').replace('-', '_')}"
                                if clean_id not in updated and repo_name not in seen_paths:
                                    seen_paths.add(repo_name)
                                    try:
                                        with open(cfg_file, "r", encoding="utf-8") as f_cfg:
                                            cfg_data = json.load(f_cfg)
                                        arch = cfg_data.get("model_type") or (cfg_data.get("architectures", ["transformer"])[0] if cfg_data.get("architectures") else "transformer")
                                        ctx = cfg_data.get("max_position_embeddings", 2048)
                                    except Exception:
                                        arch = "transformer"
                                        ctx = 2048

                                    fmt = "Safetensors" if st_files else "PyTorch"
                                    rts = ["transformers", "mlx", "exllamav2"] if fmt == "Safetensors" else ["transformers"]
                                    updated[clean_id] = ModelEntry(
                                        id=clean_id,
                                        name=repo_name,
                                        file_name=repo_name.split("/")[-1],
                                        path=str(snap.resolve()),
                                        format=fmt,
                                        quantization="BF16/F16" if fmt == "Safetensors" else "FP32",
                                        size_bytes=total_sz,
                                        size_formatted=format_bytes(total_sz),
                                        architecture=arch,
                                        parameter_size="Custom",
                                        context_length=ctx,
                                        runtime_compatibility=rts,
                                        is_available=True,
                                        status_message="Available in Hugging Face cache",
                                        location_drive=snap.drive if snap.drive else "Drive",
                                        source="huggingface_cache",
                                    )
                continue

            # Standard model folder scan (direct files)
            for file in p.glob("*.*"):
                suffix = file.suffix.lower()
                if suffix in [".gguf", ".bin", ".safetensors", ".onnx", ".pt", ".pth", ".exl2"]:
                    if str(file) in seen_paths or file.name in seen_paths:
                        continue
                    seen_paths.add(str(file))
                    seen_paths.add(file.name)
                    clean_id = file.stem.lower().replace(" ", "_").replace(".", "_")
                    size = file.stat().st_size
                    location_drive = file.drive if file.drive else ("SSD" if "C:" in str(file) else "Drive")

                    if suffix == ".gguf":
                        meta = parse_gguf_metadata(file)
                        arch = meta.get("architecture", "gguf")
                        size_label = meta.get("size_label", "") or "Custom"
                        ctx = meta.get("context_length", 4096)
                        quant = meta.get("quantization", "Unknown")
                        fmt = "GGUF"
                        runtimes = ["llama.cpp server", "ollama"]
                    elif suffix == ".safetensors":
                        meta = parse_safetensors_metadata(file)
                        arch = meta.get("architecture", "transformer")
                        size_label = meta.get("parameter_size", "Custom")
                        ctx = 2048
                        quant = meta.get("quantization", "BF16/F16")
                        fmt = "Safetensors"
                        runtimes = ["transformers", "mlx", "exllamav2"]
                    elif suffix == ".onnx":
                        meta = parse_onnx_metadata(file)
                        arch = "onnx_graph"
                        size_label = "Custom"
                        ctx = 2048
                        quant = "FP32/FP16"
                        fmt = "ONNX"
                        runtimes = ["onnxruntime"]
                    elif suffix in [".pt", ".pth"]:
                        arch = "pytorch_model"
                        size_label = "Custom"
                        ctx = 2048
                        quant = "FP32"
                        fmt = "PyTorch"
                        runtimes = ["transformers"]
                    elif suffix == ".exl2":
                        arch = "exl2_quant"
                        size_label = "Custom"
                        ctx = 4096
                        quant = "EXL2"
                        fmt = "EXL2"
                        runtimes = ["exllamav2"]
                    else:
                        arch = "binary_weights"
                        size_label = "Custom"
                        ctx = 2048
                        quant = "Binary"
                        fmt = "Binary"
                        runtimes = ["llama.cpp server", "transformers"]

                    entry = ModelEntry(
                        id=clean_id,
                        name=file.name,
                        file_name=file.name,
                        path=str(file.resolve()),
                        format=fmt,
                        quantization=quant,
                        size_bytes=size,
                        size_formatted=format_bytes(size),
                        architecture=arch,
                        parameter_size=size_label,
                        context_length=ctx,
                        runtime_compatibility=runtimes,
                        is_available=True,
                        status_message="Available",
                        location_drive=location_drive,
                        source="local_directory",
                    )
                    updated[clean_id] = entry

    catalog_list = list(updated.values())
    save_models_catalog(catalog_list)

    available_models = [m for m in catalog_list if m.is_available]
    if available_models:
        if not cfg.active_model_id or cfg.active_model_id not in [m.id for m in available_models]:
            cfg.active_model_id = available_models[0].id
            cfg.active_runtime = resolve_compatible_runtime(available_models[0], cfg.active_runtime)
            save_config(cfg)
        else:
            cur = next((m for m in available_models if m.id == cfg.active_model_id), None)
            if cur:
                reconciled = resolve_compatible_runtime(cur, cfg.active_runtime)
                if reconciled != cfg.active_runtime:
                    cfg.active_runtime = reconciled
                    save_config(cfg)
    else:
        if cfg.active_model_id:
            cfg.active_model_id = ""
            save_config(cfg)

    return catalog_list


class BaseRuntimeAdapter:
    runtime_id: str = "base"
    display_name: str = "Base Runtime"
    supported_formats: List[str] = []

    def detect(self) -> Dict[str, Any]:
        return {"available": False, "version": "Unknown", "message": "Base adapter"}

    def test_connection(self) -> bool:
        return False

    def get_capabilities(self) -> Dict[str, Any]:
        return {}

    def list_models(self) -> List[Dict[str, Any]]:
        return []

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        return {"compatible": False, "message": "Not implemented"}

    def get_configuration_options(self) -> Dict[str, Any]:
        return {}

    def start(self, config: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "ok", "message": "No process management needed"}

    def stop(self) -> Dict[str, Any]:
        return {"status": "ok", "message": "No process management needed"}

    def get_metrics(self) -> Dict[str, Any]:
        return {}


class LlamaCppAdapter(BaseRuntimeAdapter):
    runtime_id = "llama.cpp server"
    display_name = "llama.cpp server mode"
    supported_formats = ["GGUF", "Binary"]

    def detect(self) -> Dict[str, Any]:
        cfg = load_config()
        exe = cfg.llama_cpp.executable_path or find_system_llama_server()
        is_installed = bool(exe and Path(exe).is_file())
        is_running = llama_manager.is_running()
        is_available = is_installed or is_running
        return {
            "available": is_available,
            "installed": is_installed,
            "running": is_running,
            "executable_path": exe or "Not configured",
            "version": "llama.cpp server" if is_available else "Not installed",
            "detection_method": "managed_subprocess" if is_running else ("executable_binary" if is_installed else "none"),
            "message": "Running & ready" if is_running else ("Binary located on disk" if is_installed else "Binary not found in system PATH"),
        }

    def test_connection(self) -> bool:
        return llama_manager.is_running()

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "cpu_threading": True,
            "gpu_layers_offload": True,
            "context_sizing": True,
            "mmap_support": True,
            "flash_attention": True,
            "streaming_sse": True,
            "batch_sizing": True,
            "kv_cache_types": ["f16", "q8_0", "q4_0"],
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        is_fmt = any(f.lower() in model.format.lower() for f in ["gguf", "bin"])
        p_ok = Path(model.path).is_file() if model.source in ("local_directory", "manual_addition", "huggingface_cache") else True
        compat = is_fmt and p_ok
        return {
            "compatible": compat,
            "message": "Compatible GGUF weights" if compat else "Requires GGUF file format",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "threads": [1, 2, 4, 8, 16],
            "gpu_layers": "0 to 99",
            "context_size": [512, 1024, 2048, 4096, 8192, 16384],
            "batch_size": [128, 256, 512, 1024],
            "use_mmap": [True, False],
            "flash_attn": [True, False],
        }

    def start(self, config: Dict[str, Any]) -> Dict[str, Any]:
        cfg = load_config()
        exe = cfg.llama_cpp.executable_path or find_system_llama_server()
        models = {m.id: m for m in load_models_catalog()}
        m_id = config.get("model_id") or cfg.active_model_id
        target_model = models.get(m_id)
        if not target_model:
            raise HTTPException(status_code=400, detail="Active model required to start llama-server")

        # If model is Ollama format, route to start_ollama_runtime gracefully
        if target_model.format == "Ollama" or target_model.source in ("ollama_api", "ollama_disk"):
            return start_ollama_runtime(target_model)

        return llama_manager.start(
            exe_path=exe,
            model_path=target_model.path,
            host=config.get("host", "127.0.0.1"),
            port=config.get("port", 8080),
            threads=config.get("threads", 4),
            gpu_layers=config.get("gpu_layers", 0),
            context_size=config.get("context_size", 2048),
            batch_size=config.get("batch_size", 512),
            ubatch_size=config.get("ubatch_size", 512),
            use_mmap=config.get("use_mmap", True),
            flash_attn=config.get("flash_attn", False),
        )

    def stop(self) -> Dict[str, Any]:
        return llama_manager.stop()

    def get_metrics(self) -> Dict[str, Any]:
        return llama_manager.get_status()


class OllamaAdapter(BaseRuntimeAdapter):
    runtime_id = "ollama"
    display_name = "Ollama service"
    supported_formats = ["Ollama", "GGUF"]

    def detect(self) -> Dict[str, Any]:
        cfg = load_config()
        stat = OllamaManager.get_status(cfg.ollama.base_url)
        exe = shutil.which("ollama")
        if not exe and platform.system() == "Windows":
            p = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
            if os.path.isfile(p):
                exe = p
            else:
                p2 = os.path.expandvars(r"%ProgramFiles%\Ollama\ollama.exe")
                if os.path.isfile(p2):
                    exe = p2
        is_installed = bool(exe and Path(exe).is_file())
        is_running = bool(stat["reachable"])
        is_available = is_installed or is_running
        msg = "Daemon connected and running" if is_running else ("Installed on system (daemon stopped)" if is_installed else "Not installed in standard paths")
        return {
            "available": is_available,
            "installed": is_installed,
            "running": is_running,
            "executable_path": str(exe) if exe else "Not found in standard paths",
            "version": stat["version"] if is_running else ("Installed" if is_installed else "Unavailable"),
            "base_url": stat["base_url"],
            "running_models": stat["running_models"],
            "detection_method": "active_http_service" if is_running else ("executable_binary" if is_installed else "none"),
            "message": msg,
        }

    def test_connection(self) -> bool:
        cfg = load_config()
        return OllamaManager.get_status(cfg.ollama.base_url)["reachable"]

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "streaming_sse": True,
            "chat_completions": True,
            "raw_generate": True,
            "automatic_gpu_offload": True,
            "dynamic_model_pull": True,
            "modelfile_import": True,
        }

    def list_models(self) -> List[Dict[str, Any]]:
        cfg = load_config()
        return OllamaManager.list_models(cfg.ollama.base_url)

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        stat = self.detect()
        if not stat["available"]:
            return {"compatible": False, "message": "Ollama is not installed or service offline"}
        is_tag = model.source in ("ollama_api", "ollama_disk") or model.format == "Ollama"
        return {
            "compatible": is_tag or model.format == "GGUF",
            "message": "Compatible with Ollama" if is_tag else "Requires Ollama model or GGUF import",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "temperature": [0.0, 0.2, 0.7, 1.0],
            "num_predict": [64, 128, 256, 512, 1024, 2048],
            "num_ctx": [2048, 4096, 8192, 32768, 131072],
        }

    def get_metrics(self) -> Dict[str, Any]:
        cfg = load_config()
        return OllamaManager.get_status(cfg.ollama.base_url)


class TransformersAdapter(BaseRuntimeAdapter):
    runtime_id = "transformers"
    display_name = "Hugging Face Transformers"
    supported_formats = ["Safetensors", "PyTorch", "Binary"]

    def detect(self) -> Dict[str, Any]:
        has_trans = importlib.util.find_spec("transformers") is not None
        has_torch = importlib.util.find_spec("torch") is not None
        is_avail = has_trans and has_torch
        ver = "Unavailable"
        if is_avail:
            try:
                import transformers
                ver = transformers.__version__
            except Exception:
                ver = "Installed"
        return {
            "available": is_avail,
            "installed": is_avail,
            "version": ver,
            "executable_path": "transformers Python module",
            "detection_method": "python_environment",
            "packages_found": {"transformers": has_trans, "torch": has_torch},
            "message": f"v{ver} installed" if is_avail else "Not installed. Run: pip install transformers torch",
        }

    def test_connection(self) -> bool:
        return self.detect()["available"]

    def get_capabilities(self) -> Dict[str, Any]:
        cuda_avail = False
        mps_avail = False
        device = "cpu"
        if importlib.util.find_spec("torch"):
            try:
                import torch
                cuda_avail = torch.cuda.is_available()
                mps_avail = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
                device = "cuda" if cuda_avail else ("mps" if mps_avail else "cpu")
            except Exception:
                pass
        return {
            "safetensors_support": True,
            "pytorch_support": True,
            "device": device,
            "cuda_acceleration": cuda_avail,
            "mps_acceleration": mps_avail,
            "bitsandbytes_quantization": importlib.util.find_spec("bitsandbytes") is not None,
            "accelerate_offload": importlib.util.find_spec("accelerate") is not None,
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        is_fmt = any(f.lower() in model.format.lower() for f in ["safetensors", "pytorch", "bin"])
        return {
            "compatible": is_fmt,
            "message": "Compatible Safetensors/PyTorch weights" if is_fmt else "Requires Safetensors or PyTorch weights",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "device_map": ["auto", "cpu", "cuda", "mps"],
            "torch_dtype": ["float16", "bfloat16", "float32"],
            "load_in_8bit": [True, False],
            "load_in_4bit": [True, False],
        }


class ONNXRuntimeAdapter(BaseRuntimeAdapter):
    runtime_id = "onnxruntime"
    display_name = "ONNX Runtime"
    supported_formats = ["ONNX"]

    def detect(self) -> Dict[str, Any]:
        has_onnx = (
            importlib.util.find_spec("onnxruntime") is not None
            or importlib.util.find_spec("onnxruntime_gpu") is not None
            or importlib.util.find_spec("onnxruntime_directml") is not None
        )
        ver = "Unavailable"
        providers = []
        if has_onnx:
            try:
                import onnxruntime as ort
                ver = ort.__version__
                providers = ort.get_available_providers()
            except Exception:
                ver = "Installed"
        return {
            "available": has_onnx,
            "installed": has_onnx,
            "version": ver,
            "providers": providers,
            "executable_path": "onnxruntime Python module",
            "detection_method": "python_environment",
            "message": f"v{ver} available ({', '.join(providers)})" if has_onnx else "Not installed. Run: pip install onnxruntime",
        }

    def test_connection(self) -> bool:
        return self.detect()["available"]

    def get_capabilities(self) -> Dict[str, Any]:
        providers = []
        if importlib.util.find_spec("onnxruntime"):
            try:
                import onnxruntime as ort
                providers = ort.get_available_providers()
            except Exception:
                pass
        return {
            "graph_optimization": True,
            "execution_providers": providers or ["CPUExecutionProvider"],
            "quantized_graphs": True,
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        is_onnx = "onnx" in model.format.lower()
        return {
            "compatible": is_onnx,
            "message": "Valid ONNX computation graph" if is_onnx else "Requires .onnx model graph",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "execution_provider": ["CPUExecutionProvider", "CUDAExecutionProvider", "DirectMLExecutionProvider"],
            "optimization_level": ["ORT_ENABLE_ALL", "ORT_ENABLE_BASIC"],
            "intra_op_num_threads": [1, 2, 4, 8],
        }


class MLXAdapter(BaseRuntimeAdapter):
    runtime_id = "mlx"
    display_name = "Apple Silicon MLX Framework"
    supported_formats = ["MLX", "Safetensors"]

    def detect(self) -> Dict[str, Any]:
        is_darwin = platform.system() == "Darwin"
        is_arm = platform.machine() == "arm64"
        is_apple_silicon = is_darwin and is_arm
        has_mlx = importlib.util.find_spec("mlx") is not None
        is_avail = is_apple_silicon and has_mlx
        return {
            "available": is_avail,
            "installed": has_mlx,
            "platform_supported": is_apple_silicon,
            "version": "Apple Silicon MLX" if has_mlx else "Not installed",
            "executable_path": "mlx / mlx_lm Python module",
            "detection_method": "metal_unified_memory",
            "message": "Ready on Apple Silicon" if is_avail else (
                "Apple Silicon (macOS arm64) exclusive." if not is_apple_silicon else "Run: pip install mlx mlx-lm"
            ),
        }

    def test_connection(self) -> bool:
        return self.detect()["available"]

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "unified_memory_architecture": True,
            "metal_compute": True,
            "quantization_formats": ["4-bit", "8-bit", "fp16"],
            "zero_copy_paging": True,
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        det = self.detect()
        if not det["platform_supported"]:
            return {"compatible": False, "message": "MLX requires macOS Apple Silicon (arm64)"}
        is_compat = any(f.lower() in model.format.lower() for f in ["mlx", "safetensors"])
        return {
            "compatible": is_compat,
            "message": "Compatible with Apple Silicon MLX" if is_compat else "Requires MLX weights or Safetensors",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "max_tokens": [128, 256, 512, 1024],
            "temp": [0.0, 0.7, 1.0],
        }


class ExLlamaV2Adapter(BaseRuntimeAdapter):
    runtime_id = "exllamav2"
    display_name = "ExLlamaV2 / ExLlamaV3"
    supported_formats = ["EXL2", "GPTQ"]

    def detect(self) -> Dict[str, Any]:
        has_pkg = importlib.util.find_spec("exllamav2") is not None
        has_cuda = False
        if importlib.util.find_spec("torch"):
            try:
                import torch
                has_cuda = torch.cuda.is_available()
            except Exception:
                pass
        is_avail = has_pkg and has_cuda
        return {
            "available": is_avail,
            "installed": has_pkg,
            "cuda_available": has_cuda,
            "executable_path": "exllamav2 C++/CUDA module",
            "detection_method": "cuda_tensor_core",
            "version": "ExLlamaV2" if has_pkg else "Not installed",
            "message": "Ready with CUDA" if is_avail else (
                "Requires NVIDIA GPU with CUDA. Run: pip install exllamav2" if not has_pkg else "NVIDIA CUDA driver required"
            ),
        }

    def test_connection(self) -> bool:
        return self.detect()["available"]

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "exl2_quantization": True,
            "flash_attention_2": True,
            "fast_kv_cache": True,
            "speculative_decoding": True,
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        is_compat = any(f.lower() in model.format.lower() for f in ["exl2", "gptq"])
        return {
            "compatible": is_compat,
            "message": "Compatible EXL2 weights" if is_compat else "Requires EXL2 or GPTQ quantized weights",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "gpu_split": "auto",
            "max_seq_len": [2048, 4096, 8192],
            "cache_8bit": [True, False],
        }


class MLCLLMAdapter(BaseRuntimeAdapter):
    runtime_id = "mlc_llm"
    display_name = "MLC LLM Engine"
    supported_formats = ["MLC"]

    def detect(self) -> Dict[str, Any]:
        has_pkg = importlib.util.find_spec("mlc_llm") is not None
        exe = shutil.which("mlc_llm")
        is_avail = has_pkg or bool(exe)
        return {
            "available": is_avail,
            "installed": is_avail,
            "executable_path": exe or ("mlc_llm module" if has_pkg else "Not configured"),
            "detection_method": "tvm_vulkan_metal",
            "version": "MLC LLM" if is_avail else "Not installed",
            "message": "MLC Engine installed" if is_avail else "Not installed. Run: pip install mlc-llm",
        }

    def test_connection(self) -> bool:
        return self.detect()["available"]

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "vulkan_support": True,
            "metal_support": True,
            "cuda_support": True,
            "tvm_compiled_runtime": True,
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        is_compat = "mlc" in model.format.lower()
        return {
            "compatible": is_compat,
            "message": "Compatible MLC model" if is_compat else "Requires TVM-compiled MLC model weights",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "device": ["auto", "vulkan", "metal", "cuda"],
        }


class VLLMAdapter(BaseRuntimeAdapter):
    runtime_id = "vllm"
    display_name = "vLLM Engine (PagedAttention)"
    supported_formats = ["Safetensors", "PyTorch"]

    def detect(self) -> Dict[str, Any]:
        has_pkg = importlib.util.find_spec("vllm") is not None
        exe = shutil.which("vllm")
        is_avail = has_pkg or bool(exe)
        ver = "Unavailable"
        if has_pkg:
            try:
                import vllm
                ver = vllm.__version__
            except Exception:
                ver = "Installed"
        return {
            "available": is_avail,
            "installed": is_avail,
            "executable_path": exe or ("vllm module" if has_pkg else "Not configured"),
            "detection_method": "paged_attention_server",
            "version": ver,
            "message": f"vLLM v{ver} ready" if is_avail else "Not installed. Run: pip install vllm",
        }

    def test_connection(self) -> bool:
        return self.detect()["available"]

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "paged_attention": True,
            "continuous_batching": True,
            "tensor_parallelism": True,
            "openai_server": True,
        }

    def validate_model(self, model: ModelEntry) -> Dict[str, Any]:
        is_fmt = any(f.lower() in model.format.lower() for f in ["safetensors", "pytorch", "bin"])
        return {
            "compatible": is_fmt,
            "message": "Compatible Safetensors/PyTorch model" if is_fmt else "Requires Safetensors or PyTorch weights",
        }

    def get_configuration_options(self) -> Dict[str, Any]:
        return {
            "gpu_memory_utilization": [0.5, 0.7, 0.85, 0.9],
            "max_model_len": [2048, 4096, 8192],
            "tensor_parallel_size": [1, 2, 4],
        }


class RuntimeRegistry:
    def __init__(self):
        self._adapters: Dict[str, BaseRuntimeAdapter] = {
            "llama.cpp server": LlamaCppAdapter(),
            "ollama": OllamaAdapter(),
            "transformers": TransformersAdapter(),
            "onnxruntime": ONNXRuntimeAdapter(),
            "mlx": MLXAdapter(),
            "exllamav2": ExLlamaV2Adapter(),
            "mlc_llm": MLCLLMAdapter(),
            "vllm": VLLMAdapter(),
        }

    def get(self, runtime_id: str) -> Optional[BaseRuntimeAdapter]:
        return self._adapters.get(runtime_id)

    def list_all(self) -> List[Dict[str, Any]]:
        results = []
        for rid, adapter in self._adapters.items():
            det = adapter.detect()
            results.append({
                "runtime_id": rid,
                "display_name": adapter.display_name,
                "supported_formats": adapter.supported_formats,
                "available": det.get("available", False),
                "installed": det.get("installed", det.get("available", False)),
                "running": det.get("running", False),
                "executable_path": det.get("executable_path", ""),
                "version": det.get("version", "Unknown"),
                "detection_method": det.get("detection_method", "environment_scan"),
                "message": det.get("message", ""),
                "connected": adapter.test_connection(),
                "capabilities": adapter.get_capabilities(),
            })
        return results

    def get_status(self, runtime_id: str) -> Dict[str, Any]:
        adapter = self.get(runtime_id)
        if not adapter:
            raise HTTPException(status_code=404, detail=f"Runtime '{runtime_id}' not found")
        det = adapter.detect()
        return {
            "runtime_id": runtime_id,
            "display_name": adapter.display_name,
            "supported_formats": adapter.supported_formats,
            "available": det.get("available", False),
            "installed": det.get("installed", det.get("available", False)),
            "running": det.get("running", False),
            "version": det.get("version", "Unknown"),
            "connected": adapter.test_connection(),
            "capabilities": adapter.get_capabilities(),
            "config_options": adapter.get_configuration_options(),
            "details": det,
            "metrics": adapter.get_metrics(),
        }


runtime_registry = RuntimeRegistry()


def evaluate_model_compatibility(model: ModelEntry) -> Dict[str, Any]:
    hw = HardwareDetector.get_full_hardware_profile()
    ram_gb = hw["ram"]["available_gb"]
    gpu = hw["gpu"]
    gpu_detected = gpu.get("detected", False)
    sys_name = platform.system()
    machine = platform.machine()
    is_apple_silicon = sys_name == "Darwin" and machine == "arm64"

    compat_map = {}
    for rid, adapter in runtime_registry._adapters.items():
        det = adapter.detect()
        is_fmt = any(f.lower() in model.format.lower() for f in adapter.supported_formats)

        status = "unsupported"
        reasons = []

        if not is_fmt:
            status = "unsupported_format"
            reasons.append(f"Format '{model.format}' is not natively executable by {adapter.display_name}. Supported: {', '.join(adapter.supported_formats)}.")
        elif rid == "mlx" and not is_apple_silicon:
            status = "unsupported_platform"
            reasons.append("MLX requires macOS Apple Silicon (arm64).")
        elif rid == "exllamav2" and not (gpu_detected and gpu.get("vendor") == "NVIDIA"):
            status = "unsupported_hardware"
            reasons.append("ExLlamaV2 requires an NVIDIA GPU with CUDA.")
        elif not det.get("available", False):
            status = "runtime_unavailable"
            reasons.append(det.get("message", "Runtime is not installed."))
        else:
            model_size_gb = model.size_bytes / (1024 ** 3) if model.size_bytes else 0
            if model_size_gb > ram_gb:
                status = "compatible_with_limitations"
                reasons.append(f"Model size ({model_size_gb:.1f} GB) exceeds available RAM ({ram_gb:.1f} GB). Memory paging active.")
            else:
                status = "compatible"
                reasons.append("Compatible with active hardware and runtime.")

        compat_map[rid] = {
            "runtime_id": rid,
            "display_name": adapter.display_name,
            "status": status,
            "compatible": status in ("compatible", "compatible_with_limitations"),
            "details": "; ".join(reasons),
        }
    return compat_map


RUNTIME_INSTALL_GUIDES: Dict[str, Dict[str, Any]] = {
    "llama.cpp server": {
        "runtime_id": "llama.cpp server",
        "display_name": "llama.cpp Server / CLI",
        "description": "High-performance C/C++ GGUF inference engine with multi-threaded CPU acceleration and GPU layer offloading.",
        "icon": "⚡",
        "supported_formats": ["GGUF", "Binary"],
        "recommended_for": "Low-spec CPUs, partial GPU offloading, low memory footprint",
        "install_instructions": [
            "Download pre-built binary for your platform from official releases:",
            "Windows: https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-b3000-bin-win-avx2-x64.zip",
            "Linux: https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-b3000-bin-ubuntu-x64.zip",
            "Extract binary and place 'llama-server' or 'llama-server.exe' in your PATH or in the engine root directory.",
        ],
        "one_click_commands": {
            "Windows": "powershell -Command \"Invoke-WebRequest -Uri 'https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-b3000-bin-win-avx2-x64.zip' -OutFile 'llama-bin.zip'; Expand-Archive -Path 'llama-bin.zip' -DestinationPath '.' -Force\"",
            "Linux": "curl -L -o llama-bin.zip https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-b3000-bin-ubuntu-x64.zip && unzip -o llama-bin.zip",
            "macOS": "brew install llama.cpp",
        },
        "health_check_url": "http://127.0.0.1:8080/health",
        "docs_url": "https://github.com/ggerganov/llama.cpp",
        "verification_steps": "Run 'llama-server -h' in terminal or check http://127.0.0.1:8080/health when started.",
    },
    "ollama": {
        "runtime_id": "ollama",
        "display_name": "Ollama",
        "description": "Streamlined local AI runtime that manages model downloads, quantization, and local OpenAI-compatible APIs.",
        "icon": "🦙",
        "supported_formats": ["Ollama Registry", "GGUF Modelfile"],
        "recommended_for": "Zero-configuration one-click setup, automatic model pulling",
        "install_instructions": [
            "Windows: Download and run OllamaSetup.exe from https://ollama.com/download/windows",
            "macOS: Download Ollama.zip or install with 'brew install --cask ollama'",
            "Linux: Run 'curl -fsSL https://ollama.com/install.sh | sh'",
        ],
        "one_click_commands": {
            "Windows": "winget install Ollama.Ollama",
            "Linux": "curl -fsSL https://ollama.com/install.sh | sh",
            "macOS": "brew install --cask ollama",
        },
        "health_check_url": "http://127.0.0.1:11434/api/tags",
        "docs_url": "https://ollama.com",
        "verification_steps": "Ensure Ollama daemon is running in background. Test with 'ollama --version' or 'curl http://127.0.0.1:11434/api/tags'.",
    },
    "transformers": {
        "runtime_id": "transformers",
        "display_name": "Hugging Face Transformers / PyTorch",
        "description": "Standard deep learning ecosystem for running SafeTensors and PyTorch checkpoints.",
        "icon": "🤗",
        "supported_formats": ["SafeTensors", "PyTorch (.bin)", "Hugging Face Hub"],
        "recommended_for": "Research, cutting-edge architectures, unquantized exploration",
        "install_instructions": [
            "Install PyTorch and Hugging Face packages into your Python environment:",
            "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu",
            "pip install transformers accelerate safetensors sentencepiece",
        ],
        "one_click_commands": {
            "Windows": "pip install torch transformers accelerate safetensors",
            "Linux": "pip install torch transformers accelerate safetensors",
            "macOS": "pip install torch transformers accelerate safetensors",
        },
        "health_check_url": "",
        "docs_url": "https://huggingface.co/docs/transformers",
        "verification_steps": "Verify with: python -c \"import torch, transformers; print('Transformers OK', transformers.__version__)\"",
    },
    "onnxruntime": {
        "runtime_id": "onnxruntime",
        "display_name": "ONNX Runtime (DirectML / CPU / CUDA)",
        "description": "Microsoft's high-performance inference engine with native DirectML support across all Windows GPUs (Intel, AMD, NVIDIA).",
        "icon": "⚡",
        "supported_formats": ["ONNX (.onnx)", "DirectML Execution Provider"],
        "recommended_for": "Windows systems with integrated Intel HD graphics or AMD Radeon GPUs",
        "install_instructions": [
            "For Windows DirectX 12 GPU acceleration: pip install onnxruntime-directml",
            "For standard CPU: pip install onnxruntime",
            "For NVIDIA CUDA: pip install onnxruntime-gpu",
        ],
        "one_click_commands": {
            "Windows": "pip install onnxruntime-directml onnx numpy",
            "Linux": "pip install onnxruntime numpy",
            "macOS": "pip install onnxruntime numpy",
        },
        "health_check_url": "",
        "docs_url": "https://onnxruntime.ai",
        "verification_steps": "Verify with: python -c \"import onnxruntime as ort; print('Providers:', ort.get_available_providers())\"",
    },
    "mlx": {
        "runtime_id": "mlx",
        "display_name": "Apple MLX (Metal)",
        "description": "Apple Silicon framework for efficient machine learning inference and fine-tuning on Apple unified memory.",
        "icon": "🍎",
        "supported_formats": ["MLX Weights", "Apple Safetensors"],
        "recommended_for": "Apple Silicon Macs (M1/M2/M3/M4) utilizing unified high-bandwidth memory",
        "install_instructions": [
            "Prerequisite: macOS with Apple Silicon (arm64)",
            "pip install mlx mlx-lm",
        ],
        "one_click_commands": {
            "Windows": "echo 'MLX requires macOS on Apple Silicon'",
            "Linux": "echo 'MLX requires macOS on Apple Silicon'",
            "macOS": "pip install mlx-lm",
        },
        "health_check_url": "",
        "docs_url": "https://github.com/ml-explore/mlx",
        "verification_steps": "Verify with: python -c \"import mlx.core as mx; print('MLX device:', mx.default_device())\"",
    },
    "exllamav2": {
        "runtime_id": "exllamav2",
        "display_name": "ExLlamaV2 (EXL2)",
        "description": "Ultra-fast quantized inference library designed exclusively for modern NVIDIA GPUs with CUDA.",
        "icon": "🚀",
        "supported_formats": ["EXL2", "GPTQ"],
        "recommended_for": "NVIDIA GPUs with dedicated VRAM >= 6 GB",
        "install_instructions": [
            "Prerequisites: NVIDIA CUDA Toolkit and C++ Build Tools",
            "pip install ninja exllamav2",
        ],
        "one_click_commands": {
            "Windows": "pip install ninja exllamav2",
            "Linux": "pip install ninja exllamav2",
            "macOS": "echo 'ExLlamaV2 requires NVIDIA CUDA'",
        },
        "health_check_url": "",
        "docs_url": "https://github.com/turboderp/exllamav2",
        "verification_steps": "Verify with: python -c \"import exllamav2; print('ExLlamaV2 OK')\"",
    },
    "mlc_llm": {
        "runtime_id": "mlc_llm",
        "display_name": "MLC LLM (Machine Learning Compilation)",
        "description": "Universal compilation-based runtime targeting Vulkan, WebGPU, Metal, and CUDA on edge devices.",
        "icon": "⚙️",
        "supported_formats": ["MLC Compiled Binary"],
        "recommended_for": "Cross-platform acceleration via Vulkan and edge deployments",
        "install_instructions": [
            "Install pre-built binary wheels:",
            "pip install --pre -U -f https://mlc.ai/wheels mlc-llm mlc-ai-nightly",
        ],
        "one_click_commands": {
            "Windows": "pip install --pre -U -f https://mlc.ai/wheels mlc-llm mlc-ai-nightly",
            "Linux": "pip install --pre -U -f https://mlc.ai/wheels mlc-llm mlc-ai-nightly",
            "macOS": "pip install --pre -U -f https://mlc.ai/wheels mlc-llm mlc-ai-nightly",
        },
        "health_check_url": "",
        "docs_url": "https://mlc.ai",
        "verification_steps": "Verify with: mlc_llm --help",
    },
    "vllm": {
        "runtime_id": "vllm",
        "display_name": "vLLM Engine (PagedAttention)",
        "description": "High-throughput and memory-efficient LLM serving engine featuring PagedAttention and OpenAI-compatible server.",
        "icon": "⚡",
        "supported_formats": ["SafeTensors", "PyTorch", "AWQ", "GPTQ"],
        "recommended_for": "Production serving and high-concurrency batching on modern NVIDIA/AMD GPUs",
        "install_instructions": [
            "Prerequisite: Linux or Windows WSL2 with NVIDIA GPU (CUDA compute capability >= 7.0)",
            "pip install vllm",
        ],
        "one_click_commands": {
            "Windows": "wsl -- pip install vllm",
            "Linux": "pip install vllm",
            "macOS": "echo 'vLLM requires Linux with CUDA or ROCm'",
        },
        "health_check_url": "http://127.0.0.1:8000/health",
        "docs_url": "https://docs.vllm.ai",
        "verification_steps": "Verify with: vllm serve --help",
    },
}
