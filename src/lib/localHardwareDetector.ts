import type {
  GpuVendor,
  LocalHardwareProfile,
} from '../../shared/types.ts';

interface GpuSignature {
  pattern: RegExp;
  vendor: GpuVendor;
  cleanName?: string;
  arch: string;
  vramGB: number;
  bandwidthGBs: number;
  fp16Tflops: number;
  unified?: boolean;
}

// Comprehensive consumer, Apple Silicon, and workstation GPU signature database
const GPU_SIGNATURES: GpuSignature[] = [
  // NVIDIA Blackwell / Ada / Ampere / Turing / Datacenter
  { pattern: /RTX\s*5090/i, vendor: 'nvidia', arch: 'Blackwell', vramGB: 32, bandwidthGBs: 1792, fp16Tflops: 209 },
  { pattern: /RTX\s*5080/i, vendor: 'nvidia', arch: 'Blackwell', vramGB: 16, bandwidthGBs: 960, fp16Tflops: 112 },
  { pattern: /RTX\s*5070\s*Ti/i, vendor: 'nvidia', arch: 'Blackwell', vramGB: 16, bandwidthGBs: 896, fp16Tflops: 88 },
  { pattern: /RTX\s*5070/i, vendor: 'nvidia', arch: 'Blackwell', vramGB: 12, bandwidthGBs: 672, fp16Tflops: 62 },
  { pattern: /RTX\s*4090/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 24, bandwidthGBs: 1008, fp16Tflops: 165 },
  { pattern: /RTX\s*4080\s*Super/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 16, bandwidthGBs: 736, fp16Tflops: 104 },
  { pattern: /RTX\s*4080/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 16, bandwidthGBs: 717, fp16Tflops: 97 },
  { pattern: /RTX\s*4070\s*Ti\s*Super/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 16, bandwidthGBs: 672, fp16Tflops: 88 },
  { pattern: /RTX\s*4070\s*Ti/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 12, bandwidthGBs: 504, fp16Tflops: 80 },
  { pattern: /RTX\s*4070\s*Super/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 12, bandwidthGBs: 504, fp16Tflops: 71 },
  { pattern: /RTX\s*4070/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 12, bandwidthGBs: 504, fp16Tflops: 58 },
  { pattern: /RTX\s*4060\s*Ti/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 8, bandwidthGBs: 288, fp16Tflops: 44 },
  { pattern: /RTX\s*4060/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 8, bandwidthGBs: 272, fp16Tflops: 30 },
  { pattern: /RTX\s*4050/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 6, bandwidthGBs: 192, fp16Tflops: 20 },
  { pattern: /RTX\s*3090/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 24, bandwidthGBs: 936, fp16Tflops: 71 },
  { pattern: /RTX\s*3080\s*Ti/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 12, bandwidthGBs: 912, fp16Tflops: 68 },
  { pattern: /RTX\s*3080/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 10, bandwidthGBs: 760, fp16Tflops: 59 },
  { pattern: /RTX\s*3070/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 8, bandwidthGBs: 448, fp16Tflops: 40 },
  { pattern: /RTX\s*3060\s*Ti/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 8, bandwidthGBs: 448, fp16Tflops: 32 },
  { pattern: /RTX\s*3060/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 12, bandwidthGBs: 360, fp16Tflops: 25 },
  { pattern: /RTX\s*3050/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 6, bandwidthGBs: 224, fp16Tflops: 18 },
  { pattern: /RTX\s*2080\s*Ti/i, vendor: 'nvidia', arch: 'Turing', vramGB: 11, bandwidthGBs: 616, fp16Tflops: 27 },
  { pattern: /RTX\s*2070|RTX\s*2080/i, vendor: 'nvidia', arch: 'Turing', vramGB: 8, bandwidthGBs: 448, fp16Tflops: 20 },
  { pattern: /RTX\s*2060/i, vendor: 'nvidia', arch: 'Turing', vramGB: 6, bandwidthGBs: 336, fp16Tflops: 13 },
  { pattern: /GTX\s*1660|GTX\s*1650/i, vendor: 'nvidia', arch: 'Turing', vramGB: 6, bandwidthGBs: 288, fp16Tflops: 10 },
  { pattern: /H100|H200/i, vendor: 'nvidia', arch: 'Hopper', vramGB: 80, bandwidthGBs: 3350, fp16Tflops: 989 },
  { pattern: /A100/i, vendor: 'nvidia', arch: 'Ampere', vramGB: 80, bandwidthGBs: 2039, fp16Tflops: 312 },
  { pattern: /RTX\s*6000\s*Ada|L40S/i, vendor: 'nvidia', arch: 'Ada Lovelace', vramGB: 48, bandwidthGBs: 864, fp16Tflops: 181 },
  { pattern: /L4\b|T4\b/i, vendor: 'nvidia', arch: 'Ada / Turing', vramGB: 16, bandwidthGBs: 300, fp16Tflops: 65 },

  // Apple Silicon Unified Memory
  { pattern: /Apple\s*M4\s*Max/i, vendor: 'apple', arch: 'Apple M4 Silicon', vramGB: 48, bandwidthGBs: 546, fp16Tflops: 36, unified: true },
  { pattern: /Apple\s*M4\s*Pro/i, vendor: 'apple', arch: 'Apple M4 Silicon', vramGB: 24, bandwidthGBs: 273, fp16Tflops: 18, unified: true },
  { pattern: /Apple\s*M4/i, vendor: 'apple', arch: 'Apple M4 Silicon', vramGB: 16, bandwidthGBs: 120, fp16Tflops: 9, unified: true },
  { pattern: /Apple\s*M3\s*Max/i, vendor: 'apple', arch: 'Apple M3 Silicon', vramGB: 36, bandwidthGBs: 400, fp16Tflops: 32, unified: true },
  { pattern: /Apple\s*M3\s*Pro/i, vendor: 'apple', arch: 'Apple M3 Silicon', vramGB: 18, bandwidthGBs: 150, fp16Tflops: 15, unified: true },
  { pattern: /Apple\s*M3/i, vendor: 'apple', arch: 'Apple M3 Silicon', vramGB: 16, bandwidthGBs: 100, fp16Tflops: 8, unified: true },
  { pattern: /Apple\s*M2\s*Ultra/i, vendor: 'apple', arch: 'Apple M2 Silicon', vramGB: 64, bandwidthGBs: 800, fp16Tflops: 54, unified: true },
  { pattern: /Apple\s*M2\s*Max/i, vendor: 'apple', arch: 'Apple M2 Silicon', vramGB: 32, bandwidthGBs: 400, fp16Tflops: 27, unified: true },
  { pattern: /Apple\s*M2\s*Pro/i, vendor: 'apple', arch: 'Apple M2 Silicon', vramGB: 16, bandwidthGBs: 200, fp16Tflops: 13, unified: true },
  { pattern: /Apple\s*M2/i, vendor: 'apple', arch: 'Apple M2 Silicon', vramGB: 16, bandwidthGBs: 100, fp16Tflops: 7, unified: true },
  { pattern: /Apple\s*M1\s*Max|M1\s*Ultra/i, vendor: 'apple', arch: 'Apple M1 Silicon', vramGB: 32, bandwidthGBs: 400, fp16Tflops: 21, unified: true },
  { pattern: /Apple\s*M1\s*Pro/i, vendor: 'apple', arch: 'Apple M1 Silicon', vramGB: 16, bandwidthGBs: 200, fp16Tflops: 10, unified: true },
  { pattern: /Apple\s*M1|Apple\s*GPU/i, vendor: 'apple', arch: 'Apple Silicon Metal', vramGB: 16, bandwidthGBs: 150, fp16Tflops: 10, unified: true },

  // AMD RDNA 3 / RDNA 2 / Integrated
  { pattern: /RX\s*7900\s*XTX/i, vendor: 'amd', arch: 'RDNA 3', vramGB: 24, bandwidthGBs: 960, fp16Tflops: 122 },
  { pattern: /RX\s*7900\s*XT/i, vendor: 'amd', arch: 'RDNA 3', vramGB: 20, bandwidthGBs: 800, fp16Tflops: 103 },
  { pattern: /RX\s*7800\s*XT/i, vendor: 'amd', arch: 'RDNA 3', vramGB: 16, bandwidthGBs: 624, fp16Tflops: 74 },
  { pattern: /RX\s*7700\s*XT/i, vendor: 'amd', arch: 'RDNA 3', vramGB: 12, bandwidthGBs: 432, fp16Tflops: 70 },
  { pattern: /RX\s*7600/i, vendor: 'amd', arch: 'RDNA 3', vramGB: 8, bandwidthGBs: 288, fp16Tflops: 43 },
  { pattern: /RX\s*6900|RX\s*6950|RX\s*6800/i, vendor: 'amd', arch: 'RDNA 2', vramGB: 16, bandwidthGBs: 512, fp16Tflops: 42 },
  { pattern: /RX\s*6700/i, vendor: 'amd', arch: 'RDNA 2', vramGB: 12, bandwidthGBs: 384, fp16Tflops: 26 },
  { pattern: /RX\s*6600/i, vendor: 'amd', arch: 'RDNA 2', vramGB: 8, bandwidthGBs: 224, fp16Tflops: 18 },
  { pattern: /Radeon\s*780M|Radeon\s*890M|Radeon.*Graphics/i, vendor: 'amd', arch: 'RDNA Integrated', vramGB: 4, bandwidthGBs: 96, fp16Tflops: 8, unified: true },

  // Intel Arc & Integrated
  { pattern: /Arc.*A770/i, vendor: 'intel', arch: 'Xe-HPG Alchemist', vramGB: 16, bandwidthGBs: 560, fp16Tflops: 39 },
  { pattern: /Arc.*B580/i, vendor: 'intel', arch: 'Xe2 Battlemage', vramGB: 12, bandwidthGBs: 456, fp16Tflops: 34 },
  { pattern: /Arc.*A750|Arc.*A580/i, vendor: 'intel', arch: 'Xe-HPG Alchemist', vramGB: 8, bandwidthGBs: 512, fp16Tflops: 34 },
  { pattern: /Arc/i, vendor: 'intel', arch: 'Intel Arc Graphics', vramGB: 8, bandwidthGBs: 120, fp16Tflops: 12 },
  { pattern: /Iris\s*Xe|UHD\s*Graphics/i, vendor: 'intel', arch: 'Intel Integrated', vramGB: 2, bandwidthGBs: 64, fp16Tflops: 3.5 },
];

function cleanRendererString(raw: string): string {
  // Strip Chrome ANGLE wrapper like "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  const angleMatch = raw.match(/ANGLE\s*\([^,]+,\s*([^,)]+)/i);
  let name = angleMatch ? angleMatch[1] : raw;
  name = name
    .replace(/Direct3D\d+.*/i, '')
    .replace(/OpenGL.*/i, '')
    .replace(/Vulkan.*/i, '')
    .replace(/vs_\d+_\d+.*/i, '')
    .replace(/\(0x[0-9a-f]+\)/gi, '')
    .trim();
  return name || raw;
}

function inferGpuMetadata(rawRenderer: string, rawVendor: string): {
  vendor: GpuVendor;
  cleanName: string;
  arch: string;
  vramGB: number;
  bandwidthGBs: number;
  fp16Tflops: number;
  unified: boolean;
} {
  const combined = `${rawVendor} ${rawRenderer}`;
  const cleanName = cleanRendererString(rawRenderer);

  for (const sig of GPU_SIGNATURES) {
    if (sig.pattern.test(combined)) {
      return {
        vendor: sig.vendor,
        cleanName: sig.cleanName ?? cleanName,
        arch: sig.arch,
        vramGB: sig.vramGB,
        bandwidthGBs: sig.bandwidthGBs,
        fp16Tflops: sig.fp16Tflops,
        unified: Boolean(sig.unified),
      };
    }
  }

  if (/nvidia|geforce|quadro|tesla/i.test(combined)) {
    return { vendor: 'nvidia', cleanName, arch: 'NVIDIA CUDA', vramGB: 8, bandwidthGBs: 320, fp16Tflops: 28, unified: false };
  }
  if (/apple/i.test(combined)) {
    return { vendor: 'apple', cleanName, arch: 'Apple Silicon Metal', vramGB: 16, bandwidthGBs: 150, fp16Tflops: 10, unified: true };
  }
  if (/amd|radeon|ati/i.test(combined)) {
    return { vendor: 'amd', cleanName, arch: 'AMD Radeon', vramGB: 8, bandwidthGBs: 256, fp16Tflops: 20, unified: false };
  }
  if (/intel/i.test(combined)) {
    return { vendor: 'intel', cleanName, arch: 'Intel Graphics', vramGB: 2, bandwidthGBs: 64, fp16Tflops: 3.5, unified: false };
  }

  return {
    vendor: 'unknown',
    cleanName: cleanName || 'Generic Local GPU',
    arch: 'Standard GPU',
    vramGB: 0,
    bandwidthGBs: 48,
    fp16Tflops: 2.5,
    unified: false,
  };
}

function probeWebGL(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return { renderer: 'Software / Headless Renderer', vendor: 'Unknown' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      const vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
      if (renderer) return { renderer, vendor };
    }
    return {
      renderer: String(gl.getParameter(gl.RENDERER) || 'WebGL Device'),
      vendor: String(gl.getParameter(gl.VENDOR) || 'Unknown'),
    };
  } catch {
    return { renderer: 'WebGL Unavailable', vendor: 'Unknown' };
  }
}

async function probeWebGPU(): Promise<{
  supported: boolean;
  shaderF16: boolean;
  maxBufferMB: number;
  adapterDescription: string;
  adapterVendor: string;
  adapterArch: string;
}> {
  try {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<{
          info?: { vendor?: string; architecture?: string; device?: string; description?: string };
          features?: Set<string>;
          limits?: { maxBufferSize?: number };
        } | null>;
      };
    };
    if (!nav.gpu) {
      return {
        supported: false,
        shaderF16: false,
        maxBufferMB: 0,
        adapterDescription: '',
        adapterVendor: '',
        adapterArch: '',
      };
    }

    let adapter = null;
    try {
      adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        adapter = await nav.gpu.requestAdapter();
      }
    } catch {
      // WebGPU requestAdapter not available or denied by browser/driver
    }

    if (!adapter) {
      return {
        supported: false,
        shaderF16: false,
        maxBufferMB: 0,
        adapterDescription: '',
        adapterVendor: '',
        adapterArch: '',
      };
    }

    const info = adapter.info ?? {};
    const maxBufferBytes = adapter.limits?.maxBufferSize ?? 268435456;
    const shaderF16 = adapter.features ? adapter.features.has('shader-f16') : false;

    return {
      supported: true,
      shaderF16,
      maxBufferMB: Math.round(maxBufferBytes / (1024 * 1024)),
      adapterDescription: info.description || info.device || '',
      adapterVendor: info.vendor || '',
      adapterArch: info.architecture || '',
    };
  } catch {
    return {
      supported: false,
      shaderF16: false,
      maxBufferMB: 0,
      adapterDescription: '',
      adapterVendor: '',
      adapterArch: '',
    };
  }
}

async function probeOsAndCpu(): Promise<{
  osName: string;
  osVersion: string;
  architecture: string;
  cpuCores: number;
  cpuModel: string;
}> {
  const cpuCores = navigator.hardwareConcurrency || 4;
  const ua = navigator.userAgent;

  let osName = 'Unknown OS';
  let osVersion = '';
  let architecture = 'x86_64';

  const navWithUad = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<{
        architecture?: string;
        bitness?: string;
        platform?: string;
        platformVersion?: string;
      }>;
    };
  };

  if (navWithUad.userAgentData?.getHighEntropyValues) {
    try {
      const high = await navWithUad.userAgentData.getHighEntropyValues([
        'architecture',
        'bitness',
        'platform',
        'platformVersion',
      ]);
      if (high.platform) osName = high.platform;
      if (high.platformVersion) osVersion = high.platformVersion;
      if (high.architecture) {
        architecture = high.architecture === 'arm' ? 'arm64' : `${high.architecture}_${high.bitness || '64'}`;
      }
    } catch {
      // Fallback to UA parsing below
    }
  }

  if (osName === 'Unknown OS') {
    if (/Mac OS X|Macintosh/i.test(ua)) osName = 'macOS';
    else if (/Windows NT/i.test(ua)) osName = 'Windows';
    else if (/Linux/i.test(ua)) osName = 'Linux';
    else if (/CrOS/i.test(ua)) osName = 'ChromeOS';
  }

  if (/arm64|aarch64/i.test(ua) || (osName === 'macOS' && navigator.maxTouchPoints > 0)) {
    architecture = 'arm64';
  }

  const cpuModel =
    osName === 'macOS' && architecture === 'arm64'
      ? `Apple Silicon (${cpuCores}-Core ARM64)`
      : `${architecture.toUpperCase()} Local Processor (${cpuCores} Logical Cores)`;

  return { osName, osVersion, architecture, cpuCores, cpuModel };
}

export interface SystemHardwarePayload {
  hostname: string;
  osName: string;
  osVersion: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  ramTotalGB: number;
  ramAvailableGB: number;
  gpuVendor: GpuVendor;
  gpuName: string;
  vramTotalGB: number;
  vramAvailableGB: number;
  unifiedMemory: boolean;
  unifiedMemoryPoolGB?: number;
  gpuUtilPct?: number;
  cpuUtilPct?: number;
  gpuTempC: number | null;
  powerWatts?: number;
  diskTotalGB: number;
  diskAvailableGB: number;
  timestamp: string;
}

export async function probeSystemHardwareBackend(): Promise<SystemHardwarePayload | null> {
  try {
    const sRes = await fetch('/api/hal/system-hardware', {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    if (sRes.ok) {
      const s = (await sRes.json()) as LocalHardwareProfile;
      if (s && typeof s.cpuCores === 'number') {
        return {
          hostname: s.hostname || 'Local Machine',
          osName: s.osName,
          osVersion: s.osVersion,
          architecture: s.architecture,
          cpuModel: s.cpuModel,
          cpuCores: s.cpuCores,
          ramTotalGB: s.ramTotalGB,
          ramAvailableGB: s.ramAvailableGB,
          gpuVendor: s.gpuVendor,
          gpuName: s.gpuName,
          vramTotalGB: s.vramTotalGB,
          vramAvailableGB: s.vramAvailableGB,
          unifiedMemory: s.unifiedMemory,
          unifiedMemoryPoolGB: s.unifiedMemoryPoolGB,
          gpuTempC: s.currentGpuTempC,
          diskTotalGB: s.diskTotalGB,
          diskAvailableGB: s.diskAvailableGB,
          timestamp: s.detectedAt,
        };
      }
    }
  } catch {
    // Fall back to browser-only probe
  }
  return null;
}

export async function detectLocalComputerHardware(): Promise<LocalHardwareProfile> {
  const [osCpu, webgpu, storageEstimate, sysData] = await Promise.all([
    probeOsAndCpu(),
    probeWebGPU(),
    navigator.storage?.estimate
      ? navigator.storage.estimate().catch(() => ({ quota: undefined, usage: undefined }))
      : Promise.resolve({ quota: undefined, usage: undefined }),
    probeSystemHardwareBackend(),
  ]);

  const webgl = probeWebGL();
  const rawRenderer = webgpu.adapterDescription || webgl.renderer;
  const rawVendor = webgpu.adapterVendor || webgl.vendor;
  const gpuMeta = inferGpuMetadata(rawRenderer, rawVendor);

  // Browser deviceMemory is privacy-capped at 8GB in Chromium and undefined in Safari/Firefox
  const navWithMem = navigator as Navigator & { deviceMemory?: number };
  const browserReportedRam = navWithMem.deviceMemory;
  const ramPrivacyCapped = !sysData && (browserReportedRam === undefined || browserReportedRam >= 8);

  // Storage estimate in GB
  const quotaGB = storageEstimate?.quota ? Number((storageEstimate.quota / 1024 ** 3).toFixed(1)) : 64;
  const usageGB = storageEstimate?.usage ? Number((storageEstimate.usage / 1024 ** 3).toFixed(2)) : 0;
  const browserAvailDiskGB = Math.max(4, Number((quotaGB - usageGB).toFixed(1)));

  // If local engine backend provided uncapped OS hardware specs
  if (sysData) {
    const agentGpuMeta = inferGpuMetadata(sysData.gpuName, sysData.gpuVendor);
    const unified = sysData.unifiedMemory || agentGpuMeta.unified;
    const unifiedPool = unified ? sysData.unifiedMemoryPoolGB || sysData.ramTotalGB : 0;

    return {
      detectionSource: 'system-hardware',
      detectedAt: new Date().toISOString(),
      hostname: sysData.hostname,
      osName: sysData.osName,
      osVersion: sysData.osVersion,
      architecture: sysData.architecture,
      cpuModel: sysData.cpuModel,
      cpuCores: sysData.cpuCores,
      ramTotalGB: sysData.ramTotalGB,
      ramAvailableGB: sysData.ramAvailableGB,
      ramPrivacyCapped: false,
      gpuVendor: sysData.gpuVendor !== 'unknown' ? sysData.gpuVendor : agentGpuMeta.vendor,
      gpuName: sysData.gpuName || agentGpuMeta.cleanName,
      gpuRendererRaw: rawRenderer,
      gpuArchitecture: agentGpuMeta.arch,
      vramTotalGB: unified ? Number((unifiedPool * 0.75).toFixed(1)) : sysData.vramTotalGB || agentGpuMeta.vramGB,
      vramAvailableGB: unified
        ? Number((sysData.ramAvailableGB * 0.85).toFixed(1))
        : sysData.vramAvailableGB || agentGpuMeta.vramGB * 0.88,
      unifiedMemory: unified,
      unifiedMemoryPoolGB: unifiedPool,
      memoryBandwidthGBs: agentGpuMeta.bandwidthGBs,
      gpuFp16Tflops: agentGpuMeta.fp16Tflops,
      diskTotalGB: sysData.diskTotalGB,
      diskAvailableGB: sysData.diskAvailableGB,
      diskProbeSource: 'native-os',
      webgpuSupported: webgpu.supported,
      webgpuShaderF16: webgpu.shaderF16,
      webgpuMaxBufferMB: webgpu.maxBufferMB,
      thermalSensorAvailable: sysData.gpuTempC !== null,
      currentGpuTempC: sysData.gpuTempC,
      currentCpuTempC: sysData.gpuTempC ? Math.max(40, sysData.gpuTempC - 4) : null,
    };
  }

  // Browser-native local computer detection (zero-install, works from any hosted URL)
  // Infer sensible RAM estimate when browser caps at 8GB on high-core / Apple Silicon / discrete RTX machines
  let estimatedRamGB = browserReportedRam ?? 16;
  if (gpuMeta.unified && gpuMeta.vendor === 'apple') {
    estimatedRamGB = Math.max(estimatedRamGB, gpuMeta.vramGB);
  } else if (ramPrivacyCapped) {
    if (gpuMeta.vramGB >= 24 || osCpu.cpuCores >= 16) estimatedRamGB = 32;
    else if (gpuMeta.vramGB >= 8 || osCpu.cpuCores >= 8) estimatedRamGB = 16;
    else estimatedRamGB = browserReportedRam ?? 8;
  }

  const unifiedPool = gpuMeta.unified ? estimatedRamGB : 0;
  const vramTotalGB = gpuMeta.unified ? Number((unifiedPool * 0.75).toFixed(1)) : gpuMeta.vramGB;

  return {
    detectionSource: 'browser-probe',
    detectedAt: new Date().toISOString(),
    osName: osCpu.osName,
    osVersion: osCpu.osVersion,
    architecture: osCpu.architecture,
    cpuModel: gpuMeta.vendor === 'apple' ? `${gpuMeta.arch} (${osCpu.cpuCores}-Core)` : osCpu.cpuModel,
    cpuCores: osCpu.cpuCores,
    ramTotalGB: estimatedRamGB,
    ramAvailableGB: Number((estimatedRamGB * 0.76).toFixed(1)),
    ramPrivacyCapped,
    gpuVendor: gpuMeta.vendor,
    gpuName: gpuMeta.cleanName,
    gpuRendererRaw: rawRenderer,
    gpuArchitecture: webgpu.adapterArch || gpuMeta.arch,
    vramTotalGB,
    vramAvailableGB: Number((vramTotalGB * 0.88).toFixed(1)),
    unifiedMemory: gpuMeta.unified,
    unifiedMemoryPoolGB: unifiedPool,
    memoryBandwidthGBs: gpuMeta.bandwidthGBs,
    gpuFp16Tflops: gpuMeta.fp16Tflops,
    diskTotalGB: Math.max(128, Math.round(quotaGB * 1.4)),
    diskAvailableGB: browserAvailDiskGB,
    diskProbeSource: 'storage-manager',
    webgpuSupported: webgpu.supported,
    webgpuShaderF16: webgpu.shaderF16,
    webgpuMaxBufferMB: webgpu.maxBufferMB,
    thermalSensorAvailable: false,
    currentGpuTempC: null,
    currentCpuTempC: null,
  };
}
