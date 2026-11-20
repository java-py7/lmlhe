/**
 * Direct Client-Side Hardware & Local Runtime Detection
 * Detects hardware capabilities directly through browser APIs (WebGL, WebGPU, deviceMemory, concurrency)
 * and directly probes local AI runtimes (Ollama at localhost:11434, llama.cpp at localhost:8080).
 * No standalone agents, background daemons, or installers required.
 */

import { HardwareProfile, ModelEntry, RuntimeStatusResponse } from './types';

export interface ClientDetectedHardware {
  cpu: {
    name: string;
    logical_threads: number | null;
    physical_cores: string;
    architecture: string;
    utilization_percent: number | null;
  };
  ram: {
    approx_gb: number | null;
    total_formatted: string;
    available_formatted: string;
    used_gb: number | null;
  };
  gpu: {
    detected: boolean;
    name: string;
    vendor: string;
    raw_renderer: string;
    dedicated_vram_formatted: string;
  };
  webgpu: {
    supported: boolean;
    adapter_name?: string;
    vendor?: string;
    architecture?: string;
  };
  storage: {
    quota_gb: number | null;
    used_mb: number | null;
    quota_formatted: string;
    label: string;
  };
  capabilities: {
    webgpu: boolean;
    webgl2: boolean;
    webassembly: boolean;
    shared_array_buffer: boolean;
    web_workers: boolean;
  };
  platform: {
    os: string;
    browser: string;
    user_agent: string;
  };
}

export interface ClientDetectedRuntimes {
  ollama: {
    detected: boolean;
    url: string;
    version?: string;
    models: ModelEntry[];
    running_models: string[];
    message: string;
  };
  llama_cpp: {
    detected: boolean;
    url: string;
    status?: any;
    message: string;
  };
  webgpu: {
    supported: boolean;
    device_name?: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

export function detectBrowserHardware(): ClientDetectedHardware {
  // 1. CPU & Threads
  const concurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null;
  const cpuName = concurrency
    ? `Host CPU (${concurrency} Logical Threads)`
    : 'Host CPU (Threads Unavailable)';

  // 2. RAM (Chrome/Edge deviceMemory API)
  const navAny = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const memVal = typeof navAny.deviceMemory === 'number' ? navAny.deviceMemory : null;
  const totalFormatted = memVal !== null
    ? `${memVal >= 8 ? '≥ 8' : memVal} GB (Approximate)`
    : 'Unavailable (Browser sandbox)';

  // 3. GPU via WebGL unmasked renderer
  let gpuDetected = false;
  let gpuName = 'Unavailable (No WebGL)';
  let gpuVendor = 'Unavailable';
  let rawRenderer = 'Unavailable';
  let hasWebGL2 = false;

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

      if (gl) {
        hasWebGL2 = Boolean(canvas.getContext('webgl2'));
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          rawRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
          gpuVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';

          // Clean up ANGLE wrapper e.g. "ANGLE (NVIDIA, NVIDIA GeForce GT 730 Direct3D11 vs_5_0 ps_5_0, D3D11)"
          let cleanedName = rawRenderer;
          const match = rawRenderer.match(/ANGLE\s*\([^,]+,\s*([^,]+)/i);
          if (match && match[1]) {
            cleanedName = match[1].trim();
          }

          if (cleanedName && cleanedName !== 'Unavailable') {
            gpuDetected = true;
            gpuName = cleanedName;
          }
        } else {
          gpuName = 'Generic GPU (Unmasked extension blocked)';
        }
      }
    } catch {
      gpuName = 'Unavailable (WebGL error)';
    }
  }

  // 4. WebGPU Capability Check
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean((navigator as any).gpu);

  // 5. System capabilities
  const hasWasm = typeof WebAssembly !== 'undefined';
  const hasSAB = typeof SharedArrayBuffer !== 'undefined';
  const hasWorkers = typeof Worker !== 'undefined';

  // 6. Platform OS & Browser
  let osString = 'Unknown OS';
  let browserString = 'Browser';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  if (ua.includes('Win')) osString = 'Windows';
  else if (ua.includes('Mac')) osString = 'macOS';
  else if (ua.includes('Linux')) osString = 'Linux';
  else if (ua.includes('Android')) osString = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) osString = 'iOS';

  if (ua.includes('Edg/')) browserString = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browserString = 'Google Chrome';
  else if (ua.includes('Firefox/')) browserString = 'Mozilla Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browserString = 'Apple Safari';

  return {
    cpu: {
      name: cpuName,
      logical_threads: concurrency,
      physical_cores: 'Unavailable (Browser sandbox)',
      architecture: navAny.userAgentData?.platform || (typeof navigator !== 'undefined' ? navigator.platform : 'Unavailable'),
      utilization_percent: null,
    },
    ram: {
      approx_gb: memVal,
      total_formatted: totalFormatted,
      available_formatted: 'Unavailable (Browser sandbox)',
      used_gb: null,
    },
    gpu: {
      detected: gpuDetected,
      name: gpuName,
      vendor: gpuVendor,
      raw_renderer: rawRenderer,
      dedicated_vram_formatted: 'Unavailable (Browser limitation)',
    },
    webgpu: {
      supported: hasWebGPU,
    },
    storage: {
      quota_gb: null,
      used_mb: null,
      quota_formatted: 'Detecting...',
      label: 'Origin Browser Storage Quota',
    },
    capabilities: {
      webgpu: hasWebGPU,
      webgl2: hasWebGL2,
      webassembly: hasWasm,
      shared_array_buffer: hasSAB,
      web_workers: hasWorkers,
    },
    platform: {
      os: osString,
      browser: browserString,
      user_agent: ua,
    },
  };
}

export async function detectWebGPUAsync(): Promise<{
  supported: boolean;
  adapter_name?: string;
  vendor?: string;
  architecture?: string;
}> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !(navigator as any).gpu) {
    return { supported: false };
  }
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) return { supported: false };

    let info: any = adapter.info || {};
    if (typeof adapter.requestAdapterInfo === 'function') {
      try {
        info = await adapter.requestAdapterInfo();
      } catch {}
    }

    return {
      supported: true,
      adapter_name: info.description || info.device || 'Hardware WebGPU Device',
      vendor: info.vendor || 'Unknown',
      architecture: info.architecture || 'Unknown',
    };
  } catch {
    return { supported: false };
  }
}

export async function detectBrowserStorageAsync(): Promise<{
  quota_gb: number | null;
  used_mb: number | null;
  quota_formatted: string;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const quotaBytes = est.quota || 0;
      const usedBytes = est.usage || 0;
      return {
        quota_gb: quotaBytes ? Number((quotaBytes / (1024 * 1024 * 1024)).toFixed(1)) : null,
        used_mb: usedBytes ? Number((usedBytes / (1024 * 1024)).toFixed(1)) : null,
        quota_formatted: quotaBytes ? `${(quotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB Quota` : 'Unavailable',
      };
    } catch {
      return { quota_gb: null, used_mb: null, quota_formatted: 'Unavailable' };
    }
  }
  return { quota_gb: null, used_mb: null, quota_formatted: 'Not supported by browser' };
}

export async function detectLocalOllamaDirect(): Promise<ClientDetectedRuntimes['ollama']> {
  const candidateUrls = ['http://127.0.0.1:11434', 'http://localhost:11434'];

  for (const url of candidateUrls) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 1200);

      const verRes = await fetch(`${url}/api/version`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (verRes.ok) {
        const verData = await verRes.json();
        const version = verData.version || 'unknown';

        // Retrieve installed models directly from Ollama /api/tags
        let models: ModelEntry[] = [];
        try {
          const tagsRes = await fetch(`${url}/api/tags`, {
            headers: { Accept: 'application/json' },
          });
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            if (Array.isArray(tagsData.models)) {
              models = tagsData.models.map((m: any) => ({
                id: `ollama_${(m.name || m.model).replace(/[:.]/g, '_')}`,
                name: m.name || m.model,
                file_name: m.name || m.model,
                path: `${url}/api/show?name=${encodeURIComponent(m.name || m.model)}`,
                format: 'Ollama',
                quantization: m.details?.quantization_level || 'Q8_0',
                size_bytes: m.size || 0,
                size_formatted: formatBytes(m.size || 0),
                architecture: m.details?.family || 'llama',
                parameter_size: m.details?.parameter_size || '—',
                context_length: 4096,
                runtime_compatibility: ['ollama'],
                is_available: true,
                status_message: 'Installed in local Ollama daemon',
                location_drive: 'Localhost',
                source: 'ollama_api',
                modified_at: m.modified_at || null,
              }));
            }
          }
        } catch {
          // Model tags fetch issue
        }

        // Retrieve running models from /api/ps
        let runningModels: string[] = [];
        try {
          const psRes = await fetch(`${url}/api/ps`, {
            headers: { Accept: 'application/json' },
          });
          if (psRes.ok) {
            const psData = await psRes.json();
            if (Array.isArray(psData.models)) {
              runningModels = psData.models.map((m: any) => m.name || m.model);
            }
          }
        } catch {
          // ps fetch issue
        }

        return {
          detected: true,
          url,
          version,
          models,
          running_models: runningModels,
          message: `Ollama v${version} active at ${url} (${models.length} model${models.length === 1 ? '' : 's'} available)`,
        };
      }
    } catch {
      // Try next candidate
    }
  }

  return {
    detected: false,
    url: 'http://127.0.0.1:11434',
    models: [],
    running_models: [],
    message: 'Ollama not detected at localhost:11434',
  };
}

export async function detectLocalLlamaCppDirect(): Promise<ClientDetectedRuntimes['llama_cpp']> {
  const candidateUrls = ['http://127.0.0.1:8080', 'http://localhost:8080'];

  for (const url of candidateUrls) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 1000);

      const res = await fetch(`${url}/health`, {
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => ({ status: 'ok' }));
        return {
          detected: true,
          url,
          status: data,
          message: `llama.cpp server active at ${url}`,
        };
      }
    } catch {
      // not running
    }
  }

  return {
    detected: false,
    url: 'http://127.0.0.1:8080',
    message: 'llama.cpp server not detected at localhost:8080',
  };
}

/**
 * Transforms client-detected browser hardware into the application's standard HardwareProfile
 */
export function buildClientHardwareProfile(
  raw: ClientDetectedHardware
): HardwareProfile {
  return {
    cpu: {
      name: raw.cpu.name,
      architecture: raw.cpu.architecture,
      physical_cores: 0,
      logical_threads: raw.cpu.logical_threads || 1,
      utilization_percent: 0,
    },
    ram: {
      total_bytes: raw.ram.approx_gb ? raw.ram.approx_gb * 1024 * 1024 * 1024 : 0,
      available_bytes: 0,
      used_bytes: 0,
      total_gb: raw.ram.approx_gb || 0,
      available_gb: 0,
      used_gb: 0,
      utilization_percent: 0,
    },
    gpu: {
      detected: raw.gpu.detected,
      name: raw.gpu.name,
      vendor: raw.gpu.vendor,
      dedicated_vram_formatted: raw.gpu.dedicated_vram_formatted,
    },
    storage: raw.storage.quota_gb
      ? [
          {
            device: 'Browser Storage Sandbox',
            mountpoint: window.location.origin,
            fstype: 'Browser Virtual FS',
            total_bytes: (raw.storage.quota_gb || 0) * 1024 * 1024 * 1024,
            free_bytes: ((raw.storage.quota_gb || 0) - ((raw.storage.used_mb || 0) / 1024)) * 1024 * 1024 * 1024,
            used_bytes: (raw.storage.used_mb || 0) * 1024 * 1024,
            total_gb: raw.storage.quota_gb || 0,
            free_gb: (raw.storage.quota_gb || 0) - ((raw.storage.used_mb || 0) / 1024),
            used_gb: (raw.storage.used_mb || 0) / 1024,
            percent_used: raw.storage.quota_gb && raw.storage.used_mb
              ? Math.round(((raw.storage.used_mb / 1024) / raw.storage.quota_gb) * 100)
              : 0,
          },
        ]
      : [],
    os: {
      system: raw.platform.os,
      release: raw.platform.browser,
      version: 'Browser Web Client',
      machine: raw.cpu.architecture,
      python_version: 'Not required (Direct browser execution)',
    },
    deployment: {
      is_hosted: false,
      environment: 'development',
      provider: 'Client Browser Web Environment',
      target_scope: 'local_workstation',
      badge_text: 'CLIENT DIRECT DETECTION',
      description: `Detected directly via ${raw.platform.browser} on ${raw.platform.os}`,
      hardware_notice: 'Direct hardware detection via browser APIs without local agent requirement.',
    },
  };
}

/**
 * Builds runtime response based on direct browser detection
 */
export function buildClientRuntimeStatus(
  runtimes: ClientDetectedRuntimes,
  activeRuntime: string = 'ollama'
): RuntimeStatusResponse {
  const allRuntimes = [
    {
      runtime_id: 'ollama',
      display_name: 'Ollama Service',
      supported_formats: ['Ollama', 'GGUF'],
      available: runtimes.ollama.detected,
      version: runtimes.ollama.version || 'Unavailable',
      message: runtimes.ollama.message,
      connected: runtimes.ollama.detected,
      capabilities: {
        streaming_sse: true,
        chat_completions: true,
        raw_generate: true,
        automatic_gpu_offload: true,
      },
    },
    {
      runtime_id: 'llama.cpp server',
      display_name: 'llama.cpp Server',
      supported_formats: ['GGUF', 'Binary'],
      available: runtimes.llama_cpp.detected,
      version: runtimes.llama_cpp.detected ? 'Active on 8080' : 'Unavailable',
      message: runtimes.llama_cpp.message,
      connected: runtimes.llama_cpp.detected,
      capabilities: {
        cpu_threading: true,
        gpu_layers_offload: true,
      },
    },
    {
      runtime_id: 'webgpu',
      display_name: 'Browser WebGPU Engine',
      supported_formats: ['WebLLM', 'Wasm'],
      available: runtimes.webgpu.supported,
      version: runtimes.webgpu.supported ? 'W3C WebGPU' : 'Unavailable',
      message: runtimes.webgpu.supported
        ? `WebGPU supported on ${runtimes.webgpu.device_name || 'hardware GPU'}`
        : 'WebGPU not supported in this browser',
      connected: runtimes.webgpu.supported,
      capabilities: {
        hardware_gpu_acceleration: true,
      },
    },
  ];

  return {
    active_runtime: activeRuntime,
    supported_runtimes: allRuntimes.filter((r) => r.available).map((r) => r.runtime_id),
    all_runtimes: allRuntimes,
    adapters: {
      ollama: allRuntimes[0],
      'llama.cpp server': allRuntimes[1],
      webgpu: allRuntimes[2],
    },
    llama_cpp: {
      detected: runtimes.llama_cpp.detected,
      executable_path: runtimes.llama_cpp.detected ? runtimes.llama_cpp.url : 'Not running',
      status: {
        running: runtimes.llama_cpp.detected,
        healthy: runtimes.llama_cpp.detected,
        port: 8080,
      },
    },
    ollama: {
      detected: runtimes.ollama.detected,
      version: runtimes.ollama.version || 'Unavailable',
      base_url: runtimes.ollama.url,
      running_models: runtimes.ollama.running_models.map((name) => ({ name, size: 0 })),
    },
  };
}
