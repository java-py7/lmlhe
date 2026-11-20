/**
 * Direct Client-Side Hardware & Local Runtime Detection
 * Detects hardware capabilities directly through browser APIs (WebGL, WebGPU, deviceMemory, concurrency),
 * runs lightweight browser benchmarks, and directly probes local AI runtimes (Ollama at localhost:11434, llama.cpp at localhost:8080).
 * Clearly labels all browser-approximated values with estimates ("~", "est.").
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
    free_gb: number | null;
  };
  gpu: {
    detected: boolean;
    name: string;
    vendor: string;
    raw_renderer: string;
    estimated_vram_gb: number | null;
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
    status: 'online' | 'cors_blocked' | 'offline';
    cors_blocked: boolean;
    url: string;
    base_url?: string;
    version?: string;
    models: ModelEntry[];
    running_models: string[];
    message: string;
    fix_origin?: string;
  };
  llama_cpp: {
    detected: boolean;
    url: string;
    base_url?: string;
    status?: any;
    message: string;
    disabled?: boolean;
    running?: boolean;
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

/**
 * Regex lookup table estimating dedicated VRAM for common discrete NVIDIA, AMD, and Intel Arc GPUs.
 * Returns null for integrated graphics, mobile SoCs, and unknown GPUs.
 */
export function estimateVramGb(gpuName: string): number | null {
  if (!gpuName || typeof gpuName !== 'string') return null;
  const name = gpuName.toUpperCase();

  // Integrated / mobile SoC / non-discrete indicators -> null
  if (
    name.includes('INTEL') &&
    (name.includes('UHD') || name.includes('IRIS') || name.includes('HD GRAPHICS') || name.includes('INTEGRATED'))
  ) {
    return null;
  }
  if (
    name.includes('APPLE') ||
    name.includes('VIRTUAL') ||
    name.includes('BASIC RENDER') ||
    name.includes('MICROSOFT') ||
    name.includes('SOFTWARE') ||
    name.includes('LLVMPIPE')
  ) {
    return null;
  }
  if (
    name.includes('RADEON(TM) GRAPHICS') ||
    name.includes('RADEON GRAPHICS') ||
    name.includes('VEGA 8') ||
    name.includes('VEGA 11') ||
    name.includes('VEGA 7') ||
    name.includes('VEGA 6')
  ) {
    return null;
  }

  // NVIDIA GeForce RTX 40 Series
  if (name.includes('4090')) return 24;
  if (name.includes('4080')) return 16;
  if (name.includes('4070 TI SUPER')) return 16;
  if (name.includes('4070')) return 12; // 4070, 4070 Ti, 4070 Super
  if (name.includes('4060 TI 16GB')) return 16;
  if (name.includes('4060 TI')) return 8;
  if (name.includes('4060')) return 8;

  // NVIDIA GeForce RTX 30 Series
  if (name.includes('3090')) return 24;
  if (name.includes('3080 TI')) return 12;
  if (name.includes('3080')) return 10;
  if (name.includes('3070 TI') || name.includes('3070')) return 8;
  if (name.includes('3060 TI')) return 8;
  if (name.includes('3060')) return 12;
  if (name.includes('3050')) return 8;

  // NVIDIA GeForce RTX 20 Series & Titan
  if (name.includes('2080 TI') || name.includes('TITAN RTX')) return 24;
  if (name.includes('2080')) return 8;
  if (name.includes('2070')) return 8;
  if (name.includes('2060 SUPER')) return 8;
  if (name.includes('2060')) return 6;

  // NVIDIA GeForce GTX 16 Series
  if (name.includes('1660')) return 6;
  if (name.includes('1650 TI') || name.includes('1650')) return 4;
  if (name.includes('1630')) return 4;

  // NVIDIA GeForce GTX 10 Series
  if (name.includes('1080 TI')) return 11;
  if (name.includes('1080')) return 8;
  if (name.includes('1070 TI') || name.includes('1070')) return 8;
  if (name.includes('1060')) return 6;
  if (name.includes('1050 TI')) return 4;
  if (name.includes('1050')) return 2;
  if (name.includes('1030')) return 2;

  // NVIDIA GeForce GTX 9 Series
  if (name.includes('980 TI')) return 6;
  if (name.includes('980') || name.includes('970')) return 4;
  if (name.includes('960')) return 2;
  if (name.includes('950')) return 2;

  // NVIDIA GeForce GT & Legacy (e.g. GT 730, GT 710)
  if (name.includes('780 TI') || name.includes('TITAN BLACK') || name.includes('GTX TITAN')) return 6;
  if (name.includes('780')) return 3;
  if (name.includes('770')) return 2;
  if (name.includes('760')) return 2;
  if (name.includes('750 TI')) return 2;
  if (name.includes('750')) return 1;
  if (name.includes('GT 730') || name.includes('GT730') || name.includes('GEFORCE GT 730')) return 2;
  if (name.includes('GT 710') || name.includes('GT 720') || name.includes('GT 740')) return 2;

  // Enterprise / Workstation / Data Center
  if (name.includes('H100') || name.includes('A100')) return 80;
  if (name.includes('A10') || name.includes('A30')) return 24;
  if (name.includes('T4')) return 16;
  if (name.includes('V100')) return 16;
  if (name.includes('RTX 6000') || name.includes('A6000')) return 48;
  if (name.includes('RTX 5000') || name.includes('A5000')) return 24;
  if (name.includes('RTX 4000') || name.includes('A4000')) return 16;
  if (name.includes('QUADRO P4000') || name.includes('QUADRO M4000')) return 8;
  if (name.includes('QUADRO P2000')) return 5;
  if (name.includes('QUADRO P1000') || name.includes('QUADRO K2200')) return 4;
  if (name.includes('QUADRO K620')) return 2;

  // AMD Radeon RX 7000 Series
  if (name.includes('7900 XTX')) return 24;
  if (name.includes('7900 XT')) return 20;
  if (name.includes('7900 GRE') || name.includes('7800 XT') || name.includes('7600 XT')) return 16;
  if (name.includes('7700 XT')) return 12;
  if (name.includes('7600')) return 8;

  // AMD Radeon RX 6000 Series
  if (name.includes('6950') || name.includes('6900') || name.includes('6800 XT') || name.includes('6800')) return 16;
  if (name.includes('6750') || name.includes('6700 XT')) return 12;
  if (name.includes('6700')) return 10;
  if (name.includes('6650') || name.includes('6600 XT') || name.includes('6600')) return 8;
  if (name.includes('6500 XT')) return 4;

  // AMD Radeon RX 5000 / 500 / 400 Series
  if (name.includes('5700 XT') || name.includes('5700')) return 8;
  if (name.includes('5600 XT')) return 6;
  if (name.includes('5500 XT')) return 8;
  if (name.includes('RX 590') || name.includes('RX 580') || name.includes('RX 480')) return 8;
  if (name.includes('RX 570') || name.includes('RX 470')) return 4;
  if (name.includes('RX 560') || name.includes('RX 550')) return 4;

  // Intel Arc Series
  if (name.includes('ARC A770') || name.includes('A770')) return 16;
  if (name.includes('ARC A750') || name.includes('A750')) return 8;
  if (name.includes('ARC A580') || name.includes('A580')) return 8;
  if (name.includes('ARC A380') || name.includes('A380')) return 6;
  if (name.includes('ARC A310') || name.includes('A310')) return 4;

  return null;
}

/**
 * Runs a short CPU benchmark loop to measure browser math throughput.
 * Returns millions of operations per second (Mops/s).
 */
export function runCpuBenchmark(ms: number = 350): number {
  const start = performance.now();
  const deadline = start + ms;
  let ops = 0;
  let x = 1.0001;

  while (performance.now() < deadline) {
    for (let i = 0; i < 40000; i++) {
      x = (x * 1.00003 + Math.sin(i) * 0.00001) % 1000;
    }
    ops += 40000;
  }

  const elapsedSec = (performance.now() - start) / 1000;
  if (elapsedSec <= 0) return 100.0;
  return Number(((ops / elapsedSec) / 1_000_000).toFixed(1));
}

/**
 * Tries probing a locally running engine backend on localhost:8000.
 * If accessible (e.g. user started the local engine server on their PC),
 * retrieves real, exact hardware information from psutil / nvidia-smi.
 */
export async function probeLocalBackendAsync(): Promise<HardwareProfile | null> {
  const candidateUrls = ['http://127.0.0.1:8000', 'http://localhost:8000'];

  for (const url of candidateUrls) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 800);

      const res = await fetch(`${url}/api/v1/hardware`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.cpu && data.ram) {
          return {
            ...data,
            deployment: {
              ...(data.deployment || {}),
              is_hosted: false,
              badge_text: 'LOCAL ENGINE (EXACT)',
              provider: 'Local Engine (127.0.0.1:8000)',
              hardware_notice: 'Connected to local engine backend: real physical hardware telemetry active.',
            },
          };
        }
      }
    } catch {
      // Local backend not reachable on this port
    }
  }

  return null;
}

export function detectBrowserHardware(): ClientDetectedHardware {
  // 1. CPU & Threads
  const concurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null;
  const cpuName = concurrency
    ? `Host CPU (${concurrency} Logical Threads)`
    : 'Host CPU (Threads Unavailable)';

  // Estimated physical cores
  const estPhysicalCores = concurrency ? Math.max(1, Math.round(concurrency / 2)) : 1;

  // 2. RAM (Chrome/Edge deviceMemory API)
  const navAny = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const memVal = typeof navAny.deviceMemory === 'number' ? navAny.deviceMemory : null;
  const totalGb = memVal || 8;
  const estFreeGb = Number((totalGb * 0.6).toFixed(1));
  const estUsedGb = Number((totalGb * 0.4).toFixed(1));

  const totalFormatted = memVal !== null
    ? `${memVal >= 8 ? '≥ 8' : memVal} GB (Approx.)`
    : '~8 GB (est.)';
  const availableFormatted = `~${estFreeGb} GB (est. ~60% free)`;

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

  // 4. VRAM estimation via lookup table
  const estVramGb = estimateVramGb(gpuName);
  const dedicatedVramFormatted = estVramGb
    ? `~${estVramGb} GB (est.)`
    : gpuDetected
    ? 'Shared / unknown'
    : 'Unavailable';

  // 5. WebGPU Capability Check
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean((navigator as any).gpu);

  // 6. System capabilities
  const hasWasm = typeof WebAssembly !== 'undefined';
  const hasSAB = typeof SharedArrayBuffer !== 'undefined';
  const hasWorkers = typeof Worker !== 'undefined';

  // 7. Platform OS & Browser
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
      physical_cores: `~${estPhysicalCores} Physical Cores (est.)`,
      architecture: navAny.userAgentData?.platform || (typeof navigator !== 'undefined' ? navigator.platform : 'Unavailable'),
      utilization_percent: null,
    },
    ram: {
      approx_gb: totalGb,
      total_formatted: totalFormatted,
      available_formatted: availableFormatted,
      used_gb: estUsedGb,
      free_gb: estFreeGb,
    },
    gpu: {
      detected: gpuDetected,
      name: gpuName,
      vendor: gpuVendor,
      raw_renderer: rawRenderer,
      estimated_vram_gb: estVramGb,
      dedicated_vram_formatted: dedicatedVramFormatted,
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

/**
 * Distinguishes three states for local Ollama:
 * 1. 'online': connected and responsive
 * 2. 'cors_blocked': Ollama daemon is actively running on localhost:11434, but rejecting cross-origin requests
 * 3. 'offline': connection refused / daemon not running
 */
export async function detectLocalOllamaDirect(): Promise<ClientDetectedRuntimes['ollama']> {
  const candidateUrls = ['http://127.0.0.1:11434', 'http://localhost:11434'];
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com';
  let wasCorsBlocked = false;
  let blockedUrl = 'http://127.0.0.1:11434';

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
        } catch {}

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
        } catch {}

        return {
          detected: true,
          status: 'online',
          cors_blocked: false,
          url,
          base_url: url,
          version,
          models,
          running_models: runningModels,
          message: `Ollama v${version} active at ${url} (${models.length} model${models.length === 1 ? '' : 's'} available)`,
        };
      } else if (verRes.status === 403) {
        // Explicit 403 Forbidden indicates Ollama is running but rejecting the web origin
        wasCorsBlocked = true;
        blockedUrl = url;
        break;
      }
    } catch {
      // Normal fetch threw (NetworkError, TypeError, or blocked by browser CORS policy)
      // Test if port is actively listening using mode: 'no-cors'
      try {
        const noCorsCtrl = new AbortController();
        const noCorsTimeout = setTimeout(() => noCorsCtrl.abort(), 900);
        await fetch(`${url}/api/version`, {
          mode: 'no-cors',
          signal: noCorsCtrl.signal,
        });
        clearTimeout(noCorsTimeout);
        // If the fetch resolved without throwing a connection error, Ollama's TCP server is listening!
        wasCorsBlocked = true;
        blockedUrl = url;
        break;
      } catch {
        // Port is not listening (connection refused)
      }
    }
  }

  if (wasCorsBlocked) {
    return {
      detected: false,
      status: 'cors_blocked',
      cors_blocked: true,
      url: blockedUrl,
      base_url: blockedUrl,
      models: [],
      running_models: [],
      message: `Ollama is running on ${blockedUrl} but blocking this website (CORS error).`,
      fix_origin: currentOrigin,
    };
  }

  return {
    detected: false,
    status: 'offline',
    cors_blocked: false,
    url: 'http://127.0.0.1:11434',
    base_url: 'http://127.0.0.1:11434',
    models: [],
    running_models: [],
    message: 'Ollama not detected at localhost:11434',
  };
}

/**
 * Probes llama.cpp server (:8080).
 * By default, only probes when enabled via localStorage or explicitly requested,
 * preventing recurring console error spam when llama-server is not running.
 */
export async function detectLocalLlamaCppDirect(force: boolean = false): Promise<ClientDetectedRuntimes['llama_cpp']> {
  const isEnabled = force || (typeof localStorage !== 'undefined' && localStorage.getItem('probe_llama_cpp') === 'true');

  if (!isEnabled) {
    return {
      detected: false,
      running: false,
      url: 'http://127.0.0.1:8080',
      base_url: 'http://127.0.0.1:8080',
      message: 'llama.cpp probe disabled (preventing console spam)',
      disabled: true,
    };
  }

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
          running: true,
          url,
          base_url: url,
          status: data,
          message: `llama.cpp server active at ${url}`,
          disabled: false,
        };
      }
    } catch {
      // not running
    }
  }

  return {
    detected: false,
    running: false,
    url: 'http://127.0.0.1:8080',
    base_url: 'http://127.0.0.1:8080',
    message: 'llama.cpp server not detected at localhost:8080',
    disabled: false,
  };
}

/**
 * Transforms client-detected browser hardware into the application's standard HardwareProfile.
 * Clearly labels all approximated values as estimates (~).
 */
export function buildClientHardwareProfile(
  raw: ClientDetectedHardware
): HardwareProfile {
  const threads = raw.cpu.logical_threads || 1;
  const estimatedPhysicalCores = Math.max(1, Math.round(threads / 2));
  const approxRamGb = raw.ram.approx_gb || 8;
  const estimatedFreeGb = Number((approxRamGb * 0.6).toFixed(1));
  const estimatedUsedGb = Number((approxRamGb * 0.4).toFixed(1));

  const vramEstimate = raw.gpu.estimated_vram_gb !== null ? raw.gpu.estimated_vram_gb : estimateVramGb(raw.gpu.name);
  const dedicatedVramFormatted = vramEstimate
    ? `~${vramEstimate} GB (est.)`
    : raw.gpu.detected
    ? 'Shared / unknown'
    : 'Unavailable';

  return {
    cpu: {
      name: raw.cpu.name,
      architecture: raw.cpu.architecture,
      physical_cores: estimatedPhysicalCores,
      logical_threads: threads,
      utilization_percent: 0,
      instruction_sets: {
        status: 'Unavailable in browser sandbox',
        detected_list: [],
      },
      instruction_sets_formatted: 'Unavailable (browser sandbox)',
    },
    ram: {
      total_bytes: approxRamGb * 1024 * 1024 * 1024,
      available_bytes: estimatedFreeGb * 1024 * 1024 * 1024,
      used_bytes: estimatedUsedGb * 1024 * 1024 * 1024,
      total_gb: approxRamGb,
      available_gb: estimatedFreeGb,
      used_gb: estimatedUsedGb,
      utilization_percent: 40,
    },
    gpu: {
      detected: raw.gpu.detected,
      name: raw.gpu.name,
      vendor: raw.gpu.vendor,
      dedicated_vram_bytes: vramEstimate ? vramEstimate * 1024 * 1024 * 1024 : 0,
      dedicated_vram_formatted: dedicatedVramFormatted,
    },
    storage: raw.storage.quota_gb
      ? [
          {
            device: 'Browser Storage Sandbox',
            mountpoint: typeof window !== 'undefined' ? window.location.origin : 'origin',
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
      python_version: 'Direct browser execution',
    },
    deployment: {
      is_hosted: true,
      environment: 'production',
      provider: 'Browser Hardware Estimation',
      target_scope: 'local_workstation',
      badge_text: 'ESTIMATED SPECS (~)',
      description: `Detected via ${raw.platform.browser} on ${raw.platform.os}`,
      hardware_notice: 'Hardware metrics are browser-detected capabilities and engineering estimates (~).',
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
      runtime_id: 'llama.cpp server',
      display_name: 'llama.cpp Server / CLI',
      supported_formats: ['GGUF', 'Binary'],
      available: runtimes.llama_cpp.detected,
      installed: runtimes.llama_cpp.detected,
      running: runtimes.llama_cpp.detected,
      executable_path: runtimes.llama_cpp.detected ? runtimes.llama_cpp.url : 'Not running',
      version: runtimes.llama_cpp.detected ? 'Active on 8080' : 'Unavailable',
      detection_method: 'local_port_probe',
      message: runtimes.llama_cpp.message,
      connected: runtimes.llama_cpp.detected,
      capabilities: {
        cpu_threading: true,
        gpu_layers_offload: true,
      },
    },
    {
      runtime_id: 'ollama',
      display_name: 'Ollama Service',
      supported_formats: ['Ollama', 'GGUF'],
      available: runtimes.ollama.detected,
      installed: runtimes.ollama.detected || runtimes.ollama.cors_blocked,
      running: runtimes.ollama.detected,
      executable_path: runtimes.ollama.url,
      version: runtimes.ollama.version || (runtimes.ollama.cors_blocked ? 'CORS Blocked' : 'Unavailable'),
      detection_method: 'http_api_daemon',
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
      runtime_id: 'transformers',
      display_name: 'Hugging Face Transformers',
      supported_formats: ['Safetensors', 'PyTorch', 'Binary'],
      available: false,
      installed: false,
      executable_path: 'transformers Python module',
      version: 'Unavailable',
      detection_method: 'python_environment',
      message: 'Requires Python local engine daemon (localhost:8000)',
      connected: false,
      capabilities: {
        safetensors_support: true,
        pytorch_support: true,
      },
    },
    {
      runtime_id: 'onnxruntime',
      display_name: 'ONNX Runtime',
      supported_formats: ['ONNX'],
      available: false,
      installed: false,
      executable_path: 'onnxruntime Python module',
      version: 'Unavailable',
      detection_method: 'python_environment',
      message: 'Requires Python local engine daemon (localhost:8000)',
      connected: false,
      capabilities: {
        graph_optimization: true,
      },
    },
    {
      runtime_id: 'mlx',
      display_name: 'Apple Silicon MLX Framework',
      supported_formats: ['MLX', 'Safetensors'],
      available: false,
      installed: false,
      executable_path: 'mlx / mlx_lm Python module',
      version: 'Unavailable',
      detection_method: 'metal_unified_memory',
      message: 'Requires macOS Apple Silicon local engine daemon',
      connected: false,
      capabilities: {
        metal_compute: true,
        unified_memory_architecture: true,
      },
    },
    {
      runtime_id: 'exllamav2',
      display_name: 'ExLlamaV2 / ExLlamaV3',
      supported_formats: ['EXL2', 'GPTQ'],
      available: false,
      installed: false,
      executable_path: 'exllamav2 CUDA module',
      version: 'Unavailable',
      detection_method: 'cuda_tensor_core',
      message: 'Requires NVIDIA GPU + CUDA local engine daemon',
      connected: false,
      capabilities: {
        exl2_quantization: true,
      },
    },
    {
      runtime_id: 'mlc_llm',
      display_name: 'MLC LLM Engine',
      supported_formats: ['MLC'],
      available: false,
      installed: false,
      executable_path: 'mlc_llm module',
      version: 'Unavailable',
      detection_method: 'tvm_vulkan_metal',
      message: 'Requires local engine daemon',
      connected: false,
      capabilities: {
        vulkan_support: true,
      },
    },
    {
      runtime_id: 'vllm',
      display_name: 'vLLM Engine (PagedAttention)',
      supported_formats: ['Safetensors', 'PyTorch'],
      available: false,
      installed: false,
      executable_path: 'vllm module',
      version: 'Unavailable',
      detection_method: 'paged_attention_server',
      message: 'Requires Linux/WSL2 CUDA local engine daemon',
      connected: false,
      capabilities: {
        paged_attention: true,
      },
    },
  ];

  const adaptersMap: Record<string, any> = {};
  for (const r of allRuntimes) {
    adaptersMap[r.runtime_id] = r;
  }

  return {
    active_runtime: activeRuntime,
    supported_runtimes: allRuntimes.filter((r) => r.available).map((r) => r.runtime_id),
    all_runtimes: allRuntimes,
    adapters: adaptersMap,
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
