import { useState } from 'react';
import {
  Cpu,
  HardDrive,
  Layers,
  MemoryStick,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  GpuVendor,
  HalEvaluationResult,
  LocalHardwareProfile,
} from '../../shared/types.ts';

interface HardwareProbeViewProps {
  profile: LocalHardwareProfile;
  evaluation: HalEvaluationResult | null;
  isProbing: boolean;
  onRescan: () => void;
  onUpdateProfile: (next: LocalHardwareProfile) => void;
  onSelectModelAndOpenConfig: (modelId: string, mode: 'standard' | 'offload') => void;
}

export function HardwareProbeView({
  profile,
  evaluation,
  isProbing,
  onRescan,
  onUpdateProfile,
  onSelectModelAndOpenConfig,
}: HardwareProbeViewProps) {
  const [showRefine, setShowRefine] = useState(false);

  // Local refinement form state
  const [ramGB, setRamGB] = useState(profile.ramTotalGB);
  const [vramGB, setVramGB] = useState(profile.vramTotalGB);
  const [unified, setUnified] = useState(profile.unifiedMemory);
  const [diskGB, setDiskGB] = useState(Math.round(profile.diskAvailableGB));
  const [gpuVendor, setGpuVendor] = useState<GpuVendor>(profile.gpuVendor);
  const [gpuName, setGpuName] = useState(profile.gpuName);
  const [bandwidthGBs, setBandwidthGBs] = useState(profile.memoryBandwidthGBs);

  const openRefineDrawer = () => {
    setRamGB(profile.ramTotalGB);
    setVramGB(profile.vramTotalGB);
    setUnified(profile.unifiedMemory);
    setDiskGB(Math.round(profile.diskAvailableGB));
    setGpuVendor(profile.gpuVendor);
    setGpuName(profile.gpuName);
    setBandwidthGBs(profile.memoryBandwidthGBs);
    setShowRefine((prev) => !prev);
  };

  const handleApplyRefinement = (e: React.FormEvent) => {
    e.preventDefault();
    const safeRam = Math.max(4, Math.min(1024, Number(ramGB) || 16));
    const safeVram = unified ? Number((safeRam * 0.75).toFixed(1)) : Math.max(0, Math.min(256, Number(vramGB) || 0));
    const safeDisk = Math.max(4, Math.min(20000, Number(diskGB) || 64));
    const safeBw = Math.max(24, Math.min(3500, Number(bandwidthGBs) || 200));

    onUpdateProfile({
      ...profile,
      detectionSource: 'browser-probe-refined',
      ramTotalGB: safeRam,
      ramAvailableGB: Number((safeRam * 0.78).toFixed(1)),
      ramPrivacyCapped: false,
      gpuVendor,
      gpuName: gpuName.trim() || profile.gpuName,
      unifiedMemory: unified,
      unifiedMemoryPoolGB: unified ? safeRam : 0,
      vramTotalGB: safeVram,
      vramAvailableGB: Number((safeVram * 0.88).toFixed(1)),
      memoryBandwidthGBs: safeBw,
      diskAvailableGB: safeDisk,
      diskTotalGB: Math.max(profile.diskTotalGB, Math.round(safeDisk * 1.4)),
      diskProbeSource: 'user-verified',
    });
    setShowRefine(false);
  };

  return (
    <div className="space-y-8">
      {/* Page Introduction + Detection Source Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Local Computer Hardware Probe
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Probes your physical client machine directly in-browser via WebGPU, WebGL2 unmasked renderer,
            StorageManager, and CPU concurrency — never the cloud hosting server.
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
            <span>
              Source:{' '}
              <strong className="font-medium text-slate-800 dark:text-slate-200">
                {profile.detectionSource === 'browser-probe-refined'
                  ? 'Browser Local Probe + Verified Specs'
                  : profile.detectionSource === 'system-hardware'
                    ? 'Native OS Kernel Hardware (Local Machine)'
                    : 'Browser Hardware Probe (Client Machine)'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              OS: {profile.osName} {profile.osVersion} ({profile.architecture})
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Last probe: {new Date(profile.detectedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openRefineDrawer}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showRefine ? 'Close Verification' : 'Verify Exact Specs'}</span>
          </button>
          <button
            type="button"
            onClick={onRescan}
            disabled={isProbing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isProbing ? 'Scanning…' : 'Re-scan Hardware'}</span>
          </button>
        </div>
      </div>

      {/* Inline Spec Verification Panel (Addresses Browser 8GB RAM Privacy Cap) */}
      {showRefine && (
        <form
          onSubmit={handleApplyRefinement}
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Verify Exact Local Computer Specifications
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Browsers cap navigator.deviceMemory at 8 GB for anti-fingerprinting privacy. Confirm your physical RAM, VRAM, and free disk space here.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Installed System RAM (GB)</span>
              <input
                type="number"
                min={4}
                max={1024}
                step={2}
                value={ramGB}
                onChange={(e) => setRamGB(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {unified ? 'Unified Pool (Auto 75% GPU)' : 'Dedicated GPU VRAM (GB)'}
              </span>
              <input
                type="number"
                min={0}
                max={256}
                step={1}
                disabled={unified}
                value={unified ? Number((ramGB * 0.75).toFixed(1)) : vramGB}
                onChange={(e) => setVramGB(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Free Local Disk Space (GB)</span>
              <input
                type="number"
                min={4}
                max={20000}
                step={5}
                value={diskGB}
                onChange={(e) => setDiskGB(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Memory Bandwidth (GB/s)</span>
              <input
                type="number"
                min={24}
                max={3500}
                step={10}
                value={bandwidthGBs}
                onChange={(e) => setBandwidthGBs(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">GPU Model Name</span>
              <input
                type="text"
                value={gpuName}
                onChange={(e) => setGpuName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">GPU Vendor</span>
              <select
                value={gpuVendor}
                onChange={(e) => setGpuVendor(e.target.value as GpuVendor)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="nvidia">NVIDIA (CUDA)</option>
                <option value="apple">Apple Silicon (Metal)</option>
                <option value="amd">AMD (ROCm / Vulkan)</option>
                <option value="intel">Intel (SYCL / Arc)</option>
                <option value="unknown">Integrated / CPU-Only</option>
              </select>
            </label>

            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unified}
                  onChange={(e) => setUnified(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700"
                />
                <span>Unified Memory Architecture (Apple M-series / APU)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setShowRefine(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-blue-800 dark:hover:bg-sky-400 transition-colors cursor-pointer"
            >
              Recalculate HAL Profile
            </button>
          </div>
        </form>
      )}

      {/* Primary 6-Metric Hardware Inventory Grid (Single-Elevation, Zero Nested Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* CPU */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Processor (CPU)</span>
            <Cpu className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
              {profile.cpuCores} Logical Threads
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate" title={profile.cpuModel}>
              {profile.cpuModel}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Arch: {profile.architecture}</span>
            <span className="font-mono tabular-nums">SIMD Ready</span>
          </div>
        </div>

        {/* GPU */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Graphics Accelerator (GPU)</span>
            <Layers className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-50 truncate" title={profile.gpuName}>
              {profile.gpuName}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate" title={profile.gpuRendererRaw}>
              {profile.gpuArchitecture} · {profile.webgpuSupported ? 'WebGPU Active' : 'WebGL2 Renderer'}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>FP16 Shader: {profile.webgpuShaderF16 ? 'Supported' : 'Fallback'}</span>
            <span className="font-mono tabular-nums">{profile.memoryBandwidthGBs} GB/s est.</span>
          </div>
        </div>

        {/* System RAM */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">System Memory (RAM)</span>
            <MemoryStick className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
              {profile.ramTotalGB} GB{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                ({profile.ramAvailableGB} GB free)
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {profile.ramPrivacyCapped
                ? 'Browser capped navigator.deviceMemory at 8 GB; click Verify Exact Specs to refine.'
                : profile.detectionSource === 'system-hardware'
                  ? 'Physical OS memory pool available for mmap and CPU layer offload.'
                  : 'Direct browser-reported memory pool.'}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>HAL Usable RAM</span>
            <span className="font-mono tabular-nums">{evaluation?.usableRamGB ?? profile.ramAvailableGB} GB</span>
          </div>
        </div>

        {/* Dedicated VRAM */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Dedicated VRAM / GPU Allocation</span>
            <Layers className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
              {profile.vramTotalGB > 0 ? `${profile.vramTotalGB} GB` : '0 GB (CPU / iGPU)'}
              {profile.detectionSource === 'browser-probe' && profile.vramTotalGB > 0 && (
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">(Profile Est.)</span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {profile.unifiedMemory
                ? 'Dynamic Metal/Unified GPU allocation (~75% of Unified pool)'
                : profile.vramTotalGB > 0
                  ? `${profile.vramAvailableGB} GB estimated available for model weights & KV cache`
                  : 'No dedicated VRAM detected; llama.cpp CPU mmap path recommended'}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>WebGPU Max Buffer</span>
            <span className="font-mono tabular-nums">
              {profile.webgpuMaxBufferMB > 0 ? `${profile.webgpuMaxBufferMB} MB` : 'N/A'}
            </span>
          </div>
        </div>

        {/* Unified Memory */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Unified Memory Topology</span>
            <MemoryStick className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
              {profile.unifiedMemory ? `${profile.unifiedMemoryPoolGB} GB Unified` : 'Discrete Split Bus'}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {profile.unifiedMemory
                ? 'Zero-copy shared CPU/GPU memory fabric — eliminates PCIe offload bottleneck.'
                : 'Separate host RAM and GPU VRAM connected across PCIe host bus.'}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Zero-Copy Graph</span>
            <span className="font-mono">{profile.unifiedMemory ? 'Enabled' : 'PCIe Offload'}</span>
          </div>
        </div>

        {/* Available Disk */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Available Local Disk Storage</span>
            <HardDrive className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
              {profile.diskAvailableGB.toFixed(1)} GB Free
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {profile.diskProbeSource === 'native-os'
                ? `Measured directly from local OS volume (${profile.diskTotalGB} GB total)`
                : profile.diskProbeSource === 'user-verified'
                  ? `User-verified free local disk space for weight storage`
                  : `Browser StorageManager quota (${profile.diskTotalGB} GB estimated pool)`}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Thermal Sensors</span>
            <span className="font-mono tabular-nums">
              {profile.currentGpuTempC !== null
                ? `${profile.currentGpuTempC}°C Live`
                : profile.detectionSource === 'system-hardware'
                  ? 'Hardware Sensor'
                  : 'Unavailable (Browser Sandbox)'}
            </span>
          </div>
        </div>
      </div>

      {/* Hardware Class Classification & Largest Practical Model Banner */}
      {evaluation && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="text-xs font-medium text-blue-700 dark:text-sky-400">
                HAL Hardware Classification Result
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mt-0.5">
                {evaluation.hardwareClass.name}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {evaluation.hardwareClass.typicalSpecs} · Recommended Runtime:{' '}
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {evaluation.recommendedRuntimeId}
                </span>
              </p>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Practical Context Ceiling: {evaluation.hardwareClass.practicalContextCeiling.toLocaleString()} tok
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Largest Team-Validated Model */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Largest Team-Validated Model (Standard Execution)
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {evaluation.largestValidatedModel.quantId} · {evaluation.largestValidatedModel.runtimeId}
                </span>
              </div>
              <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">
                {evaluation.largestValidatedModel.modelName}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <span>Est. {evaluation.largestValidatedModel.estimatedTokPerSec} tok/s</span>
                <span aria-hidden="true">·</span>
                <span>Max Context {evaluation.largestValidatedModel.maxPracticalContext.toLocaleString()}</span>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onSelectModelAndOpenConfig(evaluation.largestValidatedModel.modelId, 'standard')}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 transition-colors cursor-pointer"
                >
                  Configure & Launch Validated Model
                </button>
              </div>
            </div>

            {/* Largest Experimentally Possible Model */}
            <div className="space-y-2.5 lg:border-l lg:border-slate-200 lg:dark:border-slate-800 lg:pl-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Largest Experimentally Possible Model (Advanced Offload)
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {evaluation.largestExperimentalModel.quantId} · {evaluation.largestExperimentalModel.offloadStrategy}
                </span>
              </div>
              <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">
                {evaluation.largestExperimentalModel.modelName}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <span>Est. {evaluation.largestExperimentalModel.estimatedTokPerSec} tok/s</span>
                <span aria-hidden="true">·</span>
                <span>Max Context {evaluation.largestExperimentalModel.maxPracticalContext.toLocaleString()}</span>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onSelectModelAndOpenConfig(evaluation.largestExperimentalModel.modelId, 'offload')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Inspect Experimental Offload Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
