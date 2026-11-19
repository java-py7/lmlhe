import json
import logging
import platform
import shutil
import subprocess
import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

import psutil

from engine.config import format_bytes, get_deployment_info, logger


class SystemSampler:
    _lock = threading.Lock()
    _last_sample_time = 0.0
    _cached_cpu_percent = 0.0
    _cached_per_core: List[float] = []
    _cpu_history: deque = deque(maxlen=30)
    _ram_history: deque = deque(maxlen=30)
    _throughput_history: deque = deque(maxlen=30)

    @classmethod
    def sample_cpu(cls) -> Dict[str, Any]:
        with cls._lock:
            now = time.time()
            if now - cls._last_sample_time >= 1.0 or not cls._cached_per_core:
                cls._cached_cpu_percent = psutil.cpu_percent(interval=None)
                cls._cached_per_core = psutil.cpu_percent(interval=None, percpu=True)
                cls._last_sample_time = now
                cls._cpu_history.append({"t": round(now, 1), "v": round(cls._cached_cpu_percent, 1)})
            return {
                "overall": cls._cached_cpu_percent,
                "per_core": cls._cached_per_core,
            }

    @classmethod
    def sample_ram(cls) -> Dict[str, Any]:
        with cls._lock:
            vm = psutil.virtual_memory()
            now = time.time()
            cls._ram_history.append({"t": round(now, 1), "v": round(vm.percent, 1)})
            return {
                "total_bytes": vm.total,
                "total_gb": round(vm.total / (1024 ** 3), 2),
                "used_bytes": vm.used,
                "used_gb": round(vm.used / (1024 ** 3), 2),
                "available_bytes": vm.available,
                "available_gb": round(vm.available / (1024 ** 3), 2),
                "utilization_percent": round(vm.percent, 1),
            }

    @classmethod
    def record_throughput(cls, val: float):
        with cls._lock:
            cls._throughput_history.append({"t": round(time.time(), 1), "v": round(val, 2)})

    @classmethod
    def get_history(cls) -> Dict[str, Any]:
        with cls._lock:
            return {
                "cpu": list(cls._cpu_history),
                "ram": list(cls._ram_history),
                "throughput": list(cls._throughput_history),
            }


class HardwareDetector:
    @staticmethod
    def get_cpu_info() -> Dict[str, Any]:
        sample = SystemSampler.sample_cpu()
        info: Dict[str, Any] = {
            "name": "Generic CPU",
            "architecture": platform.machine(),
            "physical_cores": psutil.cpu_count(logical=False) or 1,
            "logical_threads": psutil.cpu_count(logical=True) or 1,
            "utilization_percent": sample["overall"],
            "per_core_percent": sample["per_core"],
            "frequency_mhz": None,
            "temperature_celsius": None,
            "temperature_supported": False,
        }

        sys_name = platform.system()
        if sys_name == "Windows":
            try:
                import winreg
                key = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
                )
                val, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                info["name"] = str(val).strip()
            except Exception:
                info["name"] = platform.processor() or "x86_64 Processor"
        elif sys_name == "Darwin":
            try:
                out = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
                if out:
                    info["name"] = out
            except Exception:
                info["name"] = platform.processor() or "Apple Silicon Processor"
        elif sys_name == "Linux":
            try:
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if line.startswith("model name"):
                            info["name"] = line.split(":", 1)[1].strip()
                            break
            except Exception:
                info["name"] = platform.processor() or "Linux Processor"

        try:
            freq = psutil.cpu_freq()
            if freq:
                info["frequency_mhz"] = {
                    "current": round(freq.current, 1) if freq.current else None,
                    "min": round(freq.min, 1) if freq.min else None,
                    "max": round(freq.max, 1) if freq.max else None,
                }
        except Exception:
            pass

        try:
            if hasattr(psutil, "sensors_temperatures"):
                temps = psutil.sensors_temperatures()
                if temps:
                    for k, entries in temps.items():
                        if entries:
                            info["temperature_celsius"] = entries[0].current
                            info["temperature_supported"] = True
                            break
        except Exception:
            pass

        return info

    @staticmethod
    def get_ram_info() -> Dict[str, Any]:
        return SystemSampler.sample_ram()

    @staticmethod
    def get_gpu_info() -> Dict[str, Any]:
        gpu: Dict[str, Any] = {
            "detected": False,
            "vendor": "Unknown",
            "name": "No discrete GPU detected",
            "dedicated_vram_bytes": None,
            "dedicated_vram_formatted": "Unavailable",
            "shared_vram_bytes": None,
            "shared_vram_formatted": "Unavailable",
            "utilization_percent": "Unavailable",
            "temperature_celsius": "Not supported",
            "driver_version": "Unavailable",
            "type": "CPU / Integrated",
        }

        if shutil.which("nvidia-smi"):
            try:
                out = subprocess.check_output(
                    [
                        "nvidia-smi",
                        "--query-gpu=name,memory.total,memory.used,driver_version,temperature.gpu,utilization.gpu",
                        "--format=csv,noheader,nounits",
                    ],
                    text=True,
                    timeout=2,
                ).strip()
                if out:
                    parts = [p.strip() for p in out.split(",")]
                    gpu["detected"] = True
                    gpu["vendor"] = "NVIDIA"
                    gpu["name"] = parts[0]
                    total_mb = float(parts[1])
                    gpu["dedicated_vram_bytes"] = int(total_mb * 1024 * 1024)
                    gpu["dedicated_vram_formatted"] = f"{total_mb/1024:.2f} GB"
                    gpu["driver_version"] = parts[3]
                    gpu["temperature_celsius"] = float(parts[4])
                    gpu["utilization_percent"] = float(parts[5])
                    gpu["type"] = "Discrete NVIDIA GPU"
                    return gpu
            except Exception:
                pass

        sys_name = platform.system()
        if sys_name == "Windows":
            try:
                cmd = [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion, VideoProcessor | ConvertTo-Json",
                ]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
                if res.returncode == 0 and res.stdout.strip():
                    data = json.loads(res.stdout)
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        name = item.get("Name", "")
                        if not name or "Virtual" in name or "RDP" in name:
                            continue
                        gpu["detected"] = True
                        gpu["name"] = name
                        gpu["driver_version"] = item.get("DriverVersion", "Unavailable")
                        aram = item.get("AdapterRAM")
                        if aram and isinstance(aram, (int, float)) and aram > 0:
                            gpu["dedicated_vram_bytes"] = int(aram)
                            gpu["dedicated_vram_formatted"] = format_bytes(int(aram))

                        upper = name.upper()
                        if "NVIDIA" in upper or "GEFORCE" in upper or "QUADRO" in upper:
                            gpu["vendor"] = "NVIDIA"
                            gpu["type"] = "Discrete NVIDIA GPU"
                        elif "AMD" in upper or "RADEON" in upper:
                            gpu["vendor"] = "AMD"
                            gpu["type"] = "AMD Radeon GPU"
                        elif "INTEL" in upper:
                            gpu["vendor"] = "Intel"
                            gpu["type"] = "Intel Graphics"

                        total_ram = psutil.virtual_memory().total
                        gpu["shared_vram_bytes"] = total_ram // 2
                        gpu["shared_vram_formatted"] = format_bytes(total_ram // 2)
                        break
            except Exception as e:
                logger.debug(f"GPU probe Windows: {e}")

        elif sys_name == "Darwin":
            try:
                cmd = ["system_profiler", "SPDisplaysDataType", "-json"]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
                if res.returncode == 0:
                    data = json.loads(res.stdout)
                    displays = data.get("SPDisplaysDataType", [])
                    if displays:
                        disp = displays[0]
                        gpu["detected"] = True
                        model_name = disp.get("sppci_model", "Apple Silicon GPU")
                        gpu["name"] = model_name
                        gpu["vendor"] = "Apple" if "Apple" in model_name else "Unknown"
                        gpu["type"] = "Apple Silicon Unified Memory" if "Apple" in model_name else "Discrete GPU"
                        vram_str = disp.get("spdisplays_vram", disp.get("spdisplays_vram_shared", ""))
                        if vram_str:
                            gpu["dedicated_vram_formatted"] = vram_str
                        else:
                            total_ram = psutil.virtual_memory().total
                            gpu["dedicated_vram_formatted"] = f"{format_bytes(total_ram)} (Unified)"
            except Exception as e:
                logger.debug(f"GPU probe macOS: {e}")

        elif sys_name == "Linux":
            try:
                res = subprocess.run(["lspci"], capture_output=True, text=True, timeout=2)
                for line in res.stdout.splitlines():
                    if "VGA" in line or "3D" in line:
                        gpu["detected"] = True
                        gpu["name"] = line.split(": ", 1)[-1].strip()
                        upper = gpu["name"].upper()
                        if "NVIDIA" in upper:
                            gpu["vendor"] = "NVIDIA"
                            gpu["type"] = "NVIDIA GPU"
                        elif "AMD" in upper or "ADVANCED MICRO DEVICES" in upper:
                            gpu["vendor"] = "AMD"
                            gpu["type"] = "AMD Radeon GPU"
                        elif "INTEL" in upper:
                            gpu["vendor"] = "Intel"
                            gpu["type"] = "Intel Graphics"
                        break
            except Exception as e:
                logger.debug(f"GPU probe Linux: {e}")

        return gpu

    @staticmethod
    def get_storage_info() -> List[Dict[str, Any]]:
        storage_drives = []
        try:
            for part in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    storage_drives.append({
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total_bytes": usage.total,
                        "total_gb": round(usage.total / (1024 ** 3), 1),
                        "used_bytes": usage.used,
                        "used_gb": round(usage.used / (1024 ** 3), 1),
                        "free_bytes": usage.free,
                        "free_gb": round(usage.free / (1024 ** 3), 1),
                        "percent_used": round(usage.percent, 1),
                    })
                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"Storage probe note: {e}")
        return storage_drives

    @classmethod
    def get_full_hardware_profile(cls) -> Dict[str, Any]:
        return {
            "deployment": get_deployment_info(),
            "os": {
                "system": platform.system(),
                "release": platform.release(),
                "version": platform.version(),
                "machine": platform.machine(),
                "python_version": platform.python_version(),
                "hostname": platform.node(),
            },
            "cpu": cls.get_cpu_info(),
            "ram": cls.get_ram_info(),
            "gpu": cls.get_gpu_info(),
            "storage": cls.get_storage_info(),
        }
