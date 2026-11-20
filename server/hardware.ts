import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { GpuVendor, LocalHardwareProfile } from '../shared/types.ts';

interface CachedSystemInfo {
  profile: LocalHardwareProfile;
  lastSampled: number;
}

let cachedInfo: CachedSystemInfo | null = null;
let lastCpuMeasure = { idle: 0, total: 0, time: 0 };

export function sampleCpuUsagePercent(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }

  const now = Date.now();
  if (lastCpuMeasure.time === 0) {
    lastCpuMeasure = { idle, total, time: now };
    return 5; // Initial nominal baseline
  }

  const idleDelta = idle - lastCpuMeasure.idle;
  const totalDelta = total - lastCpuMeasure.total;
  lastCpuMeasure = { idle, total, time: now };

  if (totalDelta <= 0) return 0;
  const usage = Math.round((1 - idleDelta / totalDelta) * 100);
  return Math.max(0, Math.min(100, usage));
}

export function detectNativeGpu(): {
  vendor: GpuVendor;
  name: string;
  architecture: string;
  vramTotalGB: number;
  driverVersion: string;
  isDiscrete: boolean;
} {
  const platform = os.platform();

  // 1. Try nvidia-smi if present
  try {
    const nvsmiOut = execSync(
      'nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (nvsmiOut) {
      const parts = nvsmiOut.split(',').map((s) => s.trim());
      const name = parts[0] || 'NVIDIA GPU';
      const totalMb = parseFloat(parts[1]) || 0;
      const driver = parts[2] || 'Available';
      return {
        vendor: 'nvidia',
        name,
        architecture: 'NVIDIA CUDA',
        vramTotalGB: Math.round((totalMb / 1024) * 10) / 10,
        driverVersion: driver,
        isDiscrete: true,
      };
    }
  } catch {
    // nvidia-smi not available or failed
  }

  // 2. Windows: query CIM / WMI
  if (platform === 'win32') {
    try {
      const psCmd =
        'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json -Compress';
      const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();

      if (out) {
        const parsed = JSON.parse(out);
        const gpus = Array.isArray(parsed) ? parsed : [parsed];

        // Prefer discrete NVIDIA or AMD GPU over integrated Intel
        const discrete = gpus.find(
          (g: any) =>
            /nvidia|geforce|quadro|tesla|rtx|gtx|radeon|rx\s*\d/i.test(g.Name || '')
        ) || gpus[0];

        if (discrete) {
          const rawName = discrete.Name || 'Generic GPU';
          const adapterRamBytes = Number(discrete.AdapterRAM) || 0;
          let vramGB = Math.round((adapterRamBytes / 1e9) * 10) / 10;

          let vendor: GpuVendor = 'unknown';
          let arch = 'Standard GPU';

          if (/nvidia|geforce|rtx|gtx/i.test(rawName)) {
            vendor = 'nvidia';
            arch = 'NVIDIA CUDA';
            // GT 730 or similar GPUs often report 2GB or 4GB
            if (vramGB <= 0 || vramGB > 64) {
              vramGB = /gt\s*730/i.test(rawName) ? 2.0 : 4.0;
            }
          } else if (/amd|radeon/i.test(rawName)) {
            vendor = 'amd';
            arch = 'AMD Radeon / ROCm';
            if (vramGB <= 0) vramGB = 4.0;
          } else if (/intel/i.test(rawName)) {
            vendor = 'intel';
            arch = 'Intel Graphics';
            if (vramGB <= 0) vramGB = 1.0;
          }

          return {
            vendor,
            name: rawName,
            architecture: arch,
            vramTotalGB: Math.max(vramGB, 0),
            driverVersion: discrete.DriverVersion || 'Installed',
            isDiscrete: vendor === 'nvidia' || vendor === 'amd',
          };
        }
      }
    } catch {
      // PowerShell CIM failed
    }
  }

  // 3. Darwin (macOS Apple Silicon)
  if (platform === 'darwin') {
    try {
      const spOut = execSync('sysctl -n machdep.cpu.brand_string', {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();

      const isAppleSilicon = os.arch() === 'arm64' || /Apple/i.test(spOut);
      if (isAppleSilicon) {
        const totalRamGB = Math.round((os.totalmem() / 1e9) * 10) / 10;
        return {
          vendor: 'apple',
          name: spOut || 'Apple Silicon Metal GPU',
          architecture: 'Apple Metal Unified Memory',
          vramTotalGB: totalRamGB,
          driverVersion: 'Apple Metal Native',
          isDiscrete: true,
        };
      }
    } catch {
      // macOS check failed
    }
  }

  return {
    vendor: 'unknown',
    name: 'Integrated / Standard Display Adapter',
    architecture: 'Standard Graphics Pipeline',
    vramTotalGB: 0,
    driverVersion: 'OS Standard',
    isDiscrete: false,
  };
}

export function getSystemHardwareProfile(): LocalHardwareProfile {
  const now = Date.now();
  if (cachedInfo && now - cachedInfo.lastSampled < 15000) {
    // Keep dynamic memory updated even in cache
    const ramTotalGB = Math.round((os.totalmem() / 1e9) * 100) / 100;
    const ramAvailableGB = Math.round((os.freemem() / 1e9) * 100) / 100;
    cachedInfo.profile.ramTotalGB = ramTotalGB;
    cachedInfo.profile.ramAvailableGB = ramAvailableGB;
    return cachedInfo.profile;
  }

  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() || 'Multi-Core Processor';
  const cpuCores = cpus.length || 4;

  const ramTotalGB = Math.round((os.totalmem() / 1e9) * 100) / 100;
  const ramAvailableGB = Math.round((os.freemem() / 1e9) * 100) / 100;

  // Real disk space
  let diskTotalGB = 256;
  let diskAvailableGB = 64;
  try {
    const stat = fs.statfsSync('.');
    diskTotalGB = Math.round(((stat.bsize * stat.blocks) / 1e9) * 10) / 10;
    diskAvailableGB = Math.round(((stat.bsize * stat.bavail) / 1e9) * 10) / 10;
  } catch {
    // statfs fallback
  }

  const gpuInfo = detectNativeGpu();
  const isUnified = gpuInfo.vendor === 'apple';

  const profile: LocalHardwareProfile = {
    detectionSource: 'system-hardware',
    detectedAt: new Date().toISOString(),
    hostname: os.hostname(),
    osName: os.platform() === 'win32' ? 'Windows' : os.platform() === 'darwin' ? 'macOS' : 'Linux',
    osVersion: os.release(),
    architecture: os.arch(),
    cpuModel,
    cpuCores,
    ramTotalGB,
    ramAvailableGB,
    ramPrivacyCapped: false, // Server has full OS access, NO 8GB browser privacy cap!
    gpuVendor: gpuInfo.vendor,
    gpuName: gpuInfo.name,
    gpuRendererRaw: `${gpuInfo.name} (${gpuInfo.driverVersion})`,
    gpuArchitecture: gpuInfo.architecture,
    vramTotalGB: gpuInfo.vramTotalGB,
    vramAvailableGB: Math.round(gpuInfo.vramTotalGB * 0.85 * 10) / 10,
    unifiedMemory: isUnified,
    unifiedMemoryPoolGB: isUnified ? ramTotalGB : 0,
    memoryBandwidthGBs: isUnified ? 150 : gpuInfo.vendor === 'nvidia' ? 192 : 48,
    gpuFp16Tflops: gpuInfo.vendor === 'nvidia' ? 8.5 : gpuInfo.vendor === 'apple' ? 12.0 : 2.5,
    diskTotalGB,
    diskAvailableGB,
    diskProbeSource: 'native-os',
    webgpuSupported: true,
    webgpuShaderF16: gpuInfo.vendor === 'nvidia' || gpuInfo.vendor === 'apple',
    webgpuMaxBufferMB: Math.min(2048, Math.round(ramTotalGB * 128)),
    thermalSensorAvailable: false,
    currentGpuTempC: null,
    currentCpuTempC: null,
  };

  cachedInfo = {
    profile,
    lastSampled: now,
  };

  return profile;
}
