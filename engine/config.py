import os
import sys
import json
import time
import struct
import shutil
import platform
import threading
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

from pydantic import BaseModel, Field

# Base Directory & Storage Paths
BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = STORAGE_DIR / "config.json"
MODELS_FILE = STORAGE_DIR / "models.json"
BENCHMARKS_FILE = STORAGE_DIR / "benchmarks.json"
EVALUATIONS_FILE = STORAGE_DIR / "evaluations.json"
CATALOG_CACHE_FILE = STORAGE_DIR / "catalog_cache.json"
APP_LOG_FILE = STORAGE_DIR / "app.log"
LLAMA_LOG_FILE = STORAGE_DIR / "llama_server.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(APP_LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("engine")

file_lock = threading.RLock()
server_start_time = time.time()


class SecuritySettings(BaseModel):
    api_key: Optional[str] = Field(default=None)
    allow_remote_access: bool = Field(default=False)
    require_auth_for_local: bool = Field(default=False)
    listen_host: str = Field(default="127.0.0.1")
    listen_port: int = Field(default=8000)
    allowed_origins: List[str] = Field(default_factory=lambda: ["http://127.0.0.1:8000", "http://localhost:8000"])


class LlamaCppSettings(BaseModel):
    executable_path: str = Field(default="")
    cli_executable_path: str = Field(default="")
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=8080)
    threads: int = Field(default=4)
    gpu_layers: int = Field(default=0)
    context_size: int = Field(default=2048)
    batch_size: int = Field(default=512)
    ubatch_size: int = Field(default=512)
    use_mmap: bool = Field(default=True)
    flash_attn: bool = Field(default=False)
    cache_type_k: str = Field(default="f16")
    cache_type_v: str = Field(default="f16")


class OllamaSettings(BaseModel):
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=11434)
    base_url: str = Field(default="http://127.0.0.1:11434")
    executable_path: str = Field(default="ollama")


class EngineConfig(BaseModel):
    active_runtime: str = Field(default="llama.cpp server")
    active_model_id: str = Field(default="")
    llama_cpp: LlamaCppSettings = Field(default_factory=LlamaCppSettings)
    ollama: OllamaSettings = Field(default_factory=OllamaSettings)
    security: SecuritySettings = Field(default_factory=SecuritySettings)
    model_directories: List[str] = Field(default_factory=lambda: ["models"])
    monitoring_poll_interval_sec: float = Field(default=2.0)


class ModelEntry(BaseModel):
    id: str
    name: str
    file_name: str
    path: str
    format: str
    quantization: str
    size_bytes: int
    size_formatted: str
    architecture: str
    parameter_size: str
    context_length: int
    runtime_compatibility: List[str]
    is_available: bool
    status_message: str = "Available"
    location_drive: str = "Drive"
    source: str = "local_directory"
    modified_at: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 512
    stream: Optional[bool] = False
    stop: Optional[Union[str, List[str]]] = None


class InferenceGenerateRequest(BaseModel):
    model: Optional[str] = None
    prompt: str
    stream: Optional[bool] = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 512
    stop: Optional[Union[str, List[str]]] = None


class SelectModelRequest(BaseModel):
    model_id: str


class AddModelRequest(BaseModel):
    path: str
    name: Optional[str] = None
    runtime_compatibility: Optional[List[str]] = None


class DirectoryRequest(BaseModel):
    directory_path: str


class SwitchRuntimeRequest(BaseModel):
    runtime: str


class StartLlamaServerRequest(BaseModel):
    model_id: Optional[str] = None
    port: Optional[int] = None
    threads: Optional[int] = None
    gpu_layers: Optional[int] = None
    context_size: Optional[int] = None
    batch_size: Optional[int] = None
    ubatch_size: Optional[int] = None
    use_mmap: Optional[bool] = None
    flash_attn: Optional[bool] = None


class RecommendationRequest(BaseModel):
    model_id: Optional[str] = None
    context_length: Optional[int] = 2048
    target_runtime: Optional[str] = None


class BenchmarkRunRequest(BaseModel):
    model_id: Optional[str] = None
    runtime: Optional[str] = None
    prompt: Optional[str] = None
    max_tokens: Optional[int] = 128
    context_length: Optional[int] = 2048
    threads: Optional[int] = 4
    gpu_layers: Optional[int] = 0
    warmup_runs: Optional[int] = 1
    notes: Optional[str] = None


class QualityEvaluationRequest(BaseModel):
    model_id: Optional[str] = None
    runtime: Optional[str] = None
    test_suite: Optional[List[str]] = None


class QualityRatingRequest(BaseModel):
    rating: float = Field(..., ge=1.0, le=10.0)
    evaluator: Optional[str] = "User"
    feedback: Optional[str] = None


class ConfigValidateRequest(BaseModel):
    model_id: Optional[str] = None
    runtime: Optional[str] = None
    threads: Optional[int] = None
    gpu_layers: Optional[int] = None
    context_size: Optional[int] = None
    batch_size: Optional[int] = None
    use_mmap: Optional[bool] = None


class ModelDownloadRequest(BaseModel):
    source_url: str
    destination_filename: str
    expected_size_bytes: Optional[int] = None
    license_confirmed: bool = False


class AdvisorRecommendationRequest(BaseModel):
    workload: Optional[str] = "general"
    preference: Optional[str] = "balanced"
    catalog_source: Optional[str] = "all"
    search_query: Optional[str] = ""
    force_refresh: Optional[bool] = False


class AdvisorSetupRequest(BaseModel):
    model_id: str
    quantization: Optional[str] = None
    filename: Optional[str] = None
    download_url: Optional[str] = None
    runtime: Optional[str] = None
    expected_size_bytes: Optional[int] = None
    license_confirmed: bool = False
    auto_configure: bool = True
    run_verification: bool = True


# Aliases for backwards compatibility
AddDirectoryRequest = DirectoryRequest
GenerateRequest = InferenceGenerateRequest
OpenAIChatRequest = ChatCompletionRequest
HumanFeedbackRequest = QualityRatingRequest
ValidateConfigRequest = ConfigValidateRequest
DownloadModelRequest = ModelDownloadRequest



def format_bytes(num_bytes: int) -> str:
    if num_bytes <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    unit_idx = 0
    val = float(num_bytes)
    while val >= 1024.0 and unit_idx < len(units) - 1:
        val /= 1024.0
        unit_idx += 1
    return f"{val:.2f} {units[unit_idx]}"


def find_system_llama_server() -> str:
    which_path = shutil.which("llama-server") or shutil.which("llama-server.exe")
    if which_path:
        return str(Path(which_path).resolve())

    sys_name = platform.system()
    candidates = []
    if sys_name == "Windows":
        candidates.extend([
            BASE_DIR / "llamacpp" / "llama-server.exe",
            Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "llama.cpp" / "llama-server.exe",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "llama.cpp" / "llama-server.exe",
            BASE_DIR.parent / "abc-llama" / "llamacpp" / "llama-server.exe",
        ])
    elif sys_name == "Darwin":
        candidates.extend([
            Path("/opt/homebrew/bin/llama-server"),
            Path("/usr/local/bin/llama-server"),
        ])
    elif sys_name == "Linux":
        candidates.extend([
            Path("/usr/local/bin/llama-server"),
            Path("/usr/bin/llama-server"),
            Path(os.path.expanduser("~/.local/bin/llama-server")),
        ])

    for c in candidates:
        if c.is_file():
            return str(c.resolve())
    return ""


def resolve_compatible_runtime(model: Optional[ModelEntry], preferred_runtime: Optional[str] = None) -> str:
    """Deterministically resolves the optimal compatible runtime for a given model.
    Never assigns an Ollama model to llama.cpp or vice versa."""
    if not model:
        return preferred_runtime or "llama.cpp server"

    # Ollama model entries
    if model.format == "Ollama" or model.source == "ollama_api" or (
        model.runtime_compatibility and "ollama" in model.runtime_compatibility and "llama.cpp server" not in model.runtime_compatibility
    ):
        return "ollama"

    # GGUF model entries
    if model.format == "GGUF" or (
        model.runtime_compatibility and "llama.cpp server" in model.runtime_compatibility and "ollama" not in model.runtime_compatibility
    ):
        return "llama.cpp server"

    # Model compatible with multiple runtimes
    if preferred_runtime and preferred_runtime in model.runtime_compatibility:
        return preferred_runtime

    if model.runtime_compatibility:
        return model.runtime_compatibility[0]

    return "llama.cpp server"


def load_config() -> EngineConfig:
    with file_lock:
        if not CONFIG_FILE.exists() or CONFIG_FILE.stat().st_size == 0:
            cfg = EngineConfig()
            save_config_locked(cfg)
            return cfg

        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            cfg = EngineConfig(**data)
        except Exception as e:
            logger.error(f"Error loading config.json: {e}")
            cfg = EngineConfig()
            save_config_locked(cfg)
            return cfg

        # Reconcile any stale active_runtime that conflicts with the active model
        if cfg.active_model_id:
            try:
                catalog = {m.id: m for m in load_models_catalog_locked()}
                active_model = catalog.get(cfg.active_model_id)
                if not active_model:
                    for m in catalog.values():
                        if m.name == cfg.active_model_id or m.file_name == cfg.active_model_id:
                            active_model = m
                            cfg.active_model_id = m.id
                            break
                if active_model:
                    correct_rt = resolve_compatible_runtime(active_model, cfg.active_runtime)
                    if cfg.active_runtime != correct_rt:
                        logger.info(
                            f"Reconciling stale active_runtime '{cfg.active_runtime}' -> '{correct_rt}' for active model '{active_model.name}'"
                        )
                        cfg.active_runtime = correct_rt
                        save_config_locked(cfg)
            except Exception as e:
                logger.error(f"Error reconciling active_runtime: {e}")

        return cfg


def load_config_locked() -> EngineConfig:
    return load_config()


def save_config_locked(cfg: EngineConfig) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg.model_dump(), f, indent=2)
    except Exception as e:
        logger.error(f"Error saving config.json: {e}")


def save_config(cfg: EngineConfig) -> None:
    with file_lock:
        save_config_locked(cfg)


def load_models_catalog_locked() -> List[ModelEntry]:
    if not MODELS_FILE.exists() or MODELS_FILE.stat().st_size == 0:
        return []
    try:
        with open(MODELS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return [ModelEntry(**item) for item in data]
    except Exception as e:
        logger.error(f"Error loading models.json: {e}")
        return []


def load_models_catalog() -> List[ModelEntry]:
    with file_lock:
        return load_models_catalog_locked()


def save_models_catalog(models: List[ModelEntry]) -> None:
    with file_lock:
        try:
            with open(MODELS_FILE, "w", encoding="utf-8") as f:
                json.dump([m.model_dump() for m in models], f, indent=2)
        except Exception as e:
            logger.error(f"Error saving models.json: {e}")


def parse_gguf_metadata(filepath: Union[str, Path]) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "is_gguf": False,
        "version": None,
        "tensors": 0,
        "kv_count": 0,
        "architecture": "unknown",
        "name": "",
        "size_label": "",
        "context_length": 4096,
        "block_count": 0,
        "embedding_length": 0,
        "quantization": "Unknown",
    }
    path = Path(filepath)
    if not path.is_file():
        return meta

    stem_upper = path.stem.upper()
    for q in ["Q4_K_M", "Q4_K_S", "Q4_0", "Q4_1", "Q5_K_M", "Q5_0", "Q8_0", "Q2_K", "Q3_K_M", "F16", "BF16"]:
        if q in stem_upper:
            meta["quantization"] = q
            break

    try:
        with open(path, "rb") as f:
            magic = f.read(4)
            if magic != b"GGUF":
                return meta
            meta["is_gguf"] = True
            version = struct.unpack("<I", f.read(4))[0]
            tensors = struct.unpack("<Q", f.read(8))[0]
            kv_count = struct.unpack("<Q", f.read(8))[0]
            meta["version"] = version
            meta["tensors"] = tensors
            meta["kv_count"] = kv_count

            def read_str():
                str_len = struct.unpack("<Q", f.read(8))[0]
                if str_len > 1048576:
                    raise ValueError("String length too large")
                return f.read(str_len).decode("utf-8", errors="replace")

            for _ in range(min(kv_count, 80)):
                key = read_str()
                val_type = struct.unpack("<I", f.read(4))[0]
                if val_type == 8:
                    val = read_str()
                    if key == "general.architecture":
                        meta["architecture"] = val
                    elif key == "general.name":
                        meta["name"] = val
                    elif key == "general.size_label":
                        meta["size_label"] = val
                    elif key == "general.file_type" and meta["quantization"] == "Unknown":
                        meta["quantization"] = val
                elif val_type == 4:
                    val = struct.unpack("<I", f.read(4))[0]
                    if "context_length" in key:
                        meta["context_length"] = val
                    elif "block_count" in key:
                        meta["block_count"] = val
                    elif "embedding_length" in key:
                        meta["embedding_length"] = val
                elif val_type == 5:
                    f.read(4)
                elif val_type == 6:
                    f.read(4)
                elif val_type == 7:
                    f.read(1)
                elif val_type in (10, 11, 12):
                    f.read(8)
                elif val_type == 9:
                    break
                else:
                    break
    except Exception as e:
        logger.debug(f"GGUF header parse note for {filepath}: {e}")
    return meta


def parse_safetensors_metadata(filepath: Union[str, Path]) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "is_safetensors": False,
        "format": "Safetensors",
        "tensors": 0,
        "total_params": 0,
        "parameter_size": "Custom",
        "architecture": "transformer",
        "quantization": "BF16/F16",
    }
    path = Path(filepath)
    if not path.is_file():
        return meta
    try:
        with open(path, "rb") as f:
            header_len_bytes = f.read(8)
            if len(header_len_bytes) == 8:
                header_len = struct.unpack("<Q", header_len_bytes)[0]
                if 0 < header_len < 100 * 1024 * 1024:
                    header_json = f.read(header_len).decode("utf-8", errors="replace")
                    data = json.loads(header_json)
                    meta["is_safetensors"] = True
                    metadata_block = data.get("__metadata__", {})
                    meta["format"] = metadata_block.get("format", "Safetensors")
                    total_params = 0
                    t_count = 0
                    for k, v in data.items():
                        if k == "__metadata__":
                            continue
                        t_count += 1
                        shape = v.get("shape", []) if isinstance(v, dict) else []
                        if shape:
                            p = 1
                            for d in shape:
                                p *= d
                            total_params += p
                    meta["tensors"] = t_count
                    meta["total_params"] = total_params
                    if total_params >= 1e9:
                        meta["parameter_size"] = f"{total_params / 1e9:.1f}B"
                    elif total_params >= 1e6:
                        meta["parameter_size"] = f"{total_params / 1e6:.1f}M"
    except Exception as e:
        logger.debug(f"Safetensors header parse note for {filepath}: {e}")
    return meta


def parse_onnx_metadata(filepath: Union[str, Path]) -> Dict[str, Any]:
    path = Path(filepath)
    size = path.stat().st_size if path.is_file() else 0
    return {
        "is_onnx": True,
        "format": "ONNX",
        "architecture": "onnx_graph",
        "quantization": "FP32/FP16",
        "size_bytes": size,
    }
