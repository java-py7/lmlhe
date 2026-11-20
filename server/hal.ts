import type {
  DiagnosticCheck,
  DiagnosticReport,
  EvaluatedRuntime,
  ExecutionPlan,
  HalEvaluationResult,
  HardwareClassSpec,
  KvCacheQuant,
  LocalHardwareProfile,
  ModelSpec,
  OffloadStrategy,
  QuantizationSpec,
  RuntimeConfigInput,
  RuntimeEngineSpec,
  RuntimeId,
  ValidationStatus,
} from '../shared/types.ts';
import {
  HARDWARE_CLASSES,
  MODELS,
  QUANTIZATIONS,
  RUNTIME_ENGINES,
} from './catalog.ts';

const KV_BYTES_PER_ELEMENT: Record<KvCacheQuant, number> = {
  fp16: 2.0,
  q8_0: 1.06,
  q4_0: 0.56,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function getUsableMemoryBudgets(profile: LocalHardwareProfile): {
  usableVramGB: number;
  usableRamGB: number;
} {
  if (profile.unifiedMemory) {
    // macOS / unified memory reserves ~22-25% for OS and compositor
    const pool = Math.max(profile.unifiedMemoryPoolGB || profile.ramTotalGB, 8);
    const usableUnified = round2(pool * 0.76);
    return {
      usableVramGB: usableUnified,
      usableRamGB: round2(pool * 0.85),
    };
  }

  const usableVramGB =
    profile.vramTotalGB > 0
      ? round2(Math.max(0, profile.vramAvailableGB > 0 ? profile.vramAvailableGB * 0.94 : profile.vramTotalGB * 0.88))
      : 0;
  const usableRamGB = round2(
    Math.max(2, profile.ramAvailableGB > 0 ? profile.ramAvailableGB * 0.88 : profile.ramTotalGB * 0.78),
  );
  return { usableVramGB, usableRamGB };
}

export function classifyHardware(profile: LocalHardwareProfile): HardwareClassSpec {
  const effectiveVram = profile.unifiedMemory
    ? profile.unifiedMemoryPoolGB * 0.75
    : profile.vramTotalGB;

  if (profile.unifiedMemory && profile.unifiedMemoryPoolGB >= 24) {
    return HARDWARE_CLASSES.find((c) => c.id === 'class-apple-unified')!;
  }
  if (!profile.unifiedMemory && effectiveVram >= 44 && profile.ramTotalGB >= 64) {
    return HARDWARE_CLASSES.find((c) => c.id === 'class-server')!;
  }
  if (!profile.unifiedMemory && effectiveVram >= 20) {
    return HARDWARE_CLASSES.find((c) => c.id === 'class-prosumer')!;
  }
  if (effectiveVram >= 11) {
    return HARDWARE_CLASSES.find((c) => c.id === 'class-midrange')!;
  }
  if (effectiveVram >= 5.5) {
    return HARDWARE_CLASSES.find((c) => c.id === 'class-standard')!;
  }
  return HARDWARE_CLASSES.find((c) => c.id === 'class-entry')!;
}

export function evaluateRuntimes(profile: LocalHardwareProfile): EvaluatedRuntime[] {
  const { usableVramGB } = getUsableMemoryBudgets(profile);

  return RUNTIME_ENGINES.map((engine) => {
    const vendorSupported = engine.supportedVendors.includes(profile.gpuVendor);
    let compatible = true;
    let compatibilityReason = 'Fully compatible with detected local hardware.';
    let effectiveValidation: ValidationStatus = engine.validationStatus;

    if (engine.id === 'mlx-lm') {
      if (profile.gpuVendor !== 'apple' || !profile.unifiedMemory) {
        compatible = false;
        compatibilityReason = 'Requires Apple Silicon macOS with Unified Memory.';
        effectiveValidation = 'exceeds-hardware';
      } else {
        compatibilityReason = `Native zero-copy Metal execution across ${round1(profile.unifiedMemoryPoolGB)} GB Unified Memory.`;
      }
    } else if (engine.id === 'tensorrt-llm') {
      if (profile.gpuVendor !== 'nvidia') {
        compatible = false;
        compatibilityReason = 'Requires an NVIDIA Ampere/Ada/Hopper CUDA GPU.';
        effectiveValidation = 'exceeds-hardware';
      } else if (profile.vramTotalGB < 10) {
        compatible = true;
        compatibilityReason = `Compatible with CUDA, but ${profile.vramTotalGB} GB VRAM leaves tight headroom after TensorRT engine overhead.`;
        effectiveValidation = 'experimental';
      } else {
        compatibilityReason = `Supported on ${profile.gpuName} (${profile.vramTotalGB} GB VRAM) with FP8/AWQ-INT4 kernels.`;
      }
    } else if (engine.id === 'vllm') {
      if (!vendorSupported) {
        compatible = false;
        compatibilityReason = 'Requires NVIDIA CUDA or AMD ROCm discrete GPU.';
        effectiveValidation = 'exceeds-hardware';
      } else if (profile.vramTotalGB < 12) {
        compatible = true;
        compatibilityReason = `Runnable on ${profile.vramTotalGB} GB VRAM for <=8B models, though PagedAttention benefits most from >=16 GB VRAM.`;
        effectiveValidation = 'experimental';
      } else {
        compatibilityReason = `Validated for PagedAttention continuous batching on ${profile.gpuName}.`;
      }
    } else if (engine.id === 'exllamav2') {
      if (!vendorSupported) {
        compatible = false;
        compatibilityReason = 'Requires NVIDIA CUDA or AMD ROCm GPU (no Apple Metal or CPU-only mode).';
        effectiveValidation = 'exceeds-hardware';
      } else if (profile.vramTotalGB < 6) {
        compatible = false;
        compatibilityReason = 'Requires at least 6 GB discrete VRAM for practical EXL2 execution.';
        effectiveValidation = 'exceeds-hardware';
      } else {
        compatibilityReason = `Optimal single-user consumer GPU speed on ${profile.gpuName} using EXL2 fractional quantization.`;
      }
    } else if (engine.id === 'ktransformers') {
      if (profile.gpuVendor !== 'nvidia' || profile.ramTotalGB < 32) {
        compatible = false;
        compatibilityReason = 'Requires NVIDIA CUDA GPU (>=12 GB VRAM) plus >=32 GB host RAM for MoE expert offloading.';
        effectiveValidation = 'exceeds-hardware';
      } else {
        compatibilityReason = 'Experimental MoE CPU+GPU scheduler available for sparse multi-expert models.';
        effectiveValidation = 'experimental';
      }
    } else if (engine.id === 'mlc-llm') {
      if (!vendorSupported && !profile.webgpuSupported) {
        compatible = false;
        compatibilityReason = 'Requires Vulkan, Metal, CUDA, or WebGPU capable GPU.';
        effectiveValidation = 'exceeds-hardware';
      } else if (usableVramGB < 4) {
        compatible = true;
        compatibilityReason = 'GPU buffer space is tight (<4 GB); viable for 3B compiled models via WebGPU/Vulkan.';
        effectiveValidation = 'experimental';
      } else {
        compatibilityReason = `Compiled GPU backend supported via ${profile.gpuVendor === 'apple' ? 'Metal' : profile.gpuVendor === 'nvidia' ? 'CUDA/Vulkan' : 'Vulkan/WebGPU'}.`;
      }
    } else if (engine.id === 'llama.cpp') {
      compatible = true;
      if (profile.unifiedMemory) {
        compatibilityReason = `Universal GGUF runtime accelerated by Apple Metal (${round1(profile.unifiedMemoryPoolGB)} GB Unified).`;
      } else if (profile.vramTotalGB >= 4) {
        compatibilityReason = `Universal GGUF runtime with full or hybrid GPU layer offloading on ${profile.gpuName} + ${profile.cpuCores} CPU threads.`;
      } else {
        compatibilityReason = `Validated CPU mmap execution on ${profile.cpuCores} logical cores with SIMD acceleration.`;
      }
    } else if (engine.id === 'ollama') {
      compatible = true;
      if (profile.unifiedMemory) {
        compatibilityReason = `Ollama runtime accelerated by Apple Metal unified memory on port 11434.`;
      } else if (profile.vramTotalGB >= 4) {
        compatibilityReason = `Ollama runtime with automatic GPU layer offloading on ${profile.gpuName}.`;
      } else {
        compatibilityReason = `Ollama runtime with CPU execution on ${profile.cpuCores} logical cores.`;
      }
    }

    const recommended =
      compatible &&
      ((profile.unifiedMemory && engine.id === 'mlx-lm') ||
        (!profile.unifiedMemory && profile.gpuVendor === 'nvidia' && profile.vramTotalGB >= 12 && engine.id === 'exllamav2') ||
        (!profile.unifiedMemory && profile.gpuVendor === 'nvidia' && profile.vramTotalGB >= 40 && engine.id === 'vllm') ||
        engine.id === 'llama.cpp');

    return {
      engine,
      compatible,
      recommended,
      compatibilityReason,
      estimatedOverheadGB: round2(engine.vramOverheadGB),
      effectiveValidation,
    };
  });
}

export function calculateKvCacheGB(
  model: ModelSpec,
  contextSize: number,
  kvCacheQuant: KvCacheQuant,
  flashAttention: boolean,
): number {
  // 2 (K & V) * layers * kvHeads * headDim * contextSize * bytesPerElem
  const bytesPerElem = KV_BYTES_PER_ELEMENT[kvCacheQuant];
  const rawBytes = 2 * model.layers * model.kvHeads * model.headDim * contextSize * bytesPerElem;
  const flashFactor = flashAttention ? 0.92 : 1.0;
  return round2((rawBytes * flashFactor) / 1024 ** 3);
}

export function buildCliCommand(
  config: RuntimeConfigInput,
  model: ModelSpec,
  gpuLayers: number,
): string {
  const fileSlug = `${model.id}-${config.quantId.toLowerCase()}.gguf`;
  const kvFlag =
    config.kvCacheQuant === 'fp16'
      ? ''
      : ` --cache-type-k ${config.kvCacheQuant} --cache-type-v ${config.kvCacheQuant}`;
  const faFlag = config.flashAttention ? ' --flash-attn' : '';
  const mmapFlag = config.useMmap ? '' : ' --no-mmap';

  switch (config.runtimeId) {
    case 'llama.cpp': {
      const moeOffload =
        config.offloadStrategy === 'moe-cpu-experts'
          ? ' -ot ".ffn_.*_exps.=CPU"'
          : '';
      return `llama-server -hf ${model.huggingfaceRepo} -m ./models/${fileSlug} -ngl ${gpuLayers} -c ${config.contextSize} -t ${config.cpuThreads} -b ${config.batchSize}${faFlag}${kvFlag}${mmapFlag}${moeOffload} --host 127.0.0.1 --port 8080`;
    }
    case 'exllamav2':
      return `python -m tabbyAPI --model-name ${model.id}-${config.quantId} --max-seq-len ${config.contextSize} --cache-mode ${config.kvCacheQuant === 'fp16' ? 'FP16' : config.kvCacheQuant === 'q8_0' ? 'Q8' : 'Q4'} --port 5000`;
    case 'mlc-llm':
      return `mlc_llm serve HF://mlc-ai/${model.id}-${config.quantId}-MLC --overrides "context_window_size=${config.contextSize};prefill_chunk_size=${config.batchSize}" --port 8000`;
    case 'mlx-lm':
      return `mlx_lm.server --model mlx-community/${model.id}-${config.quantId.includes('4') ? '4bit' : '8bit'} --max-tokens ${Math.min(config.contextSize, 8192)} --port 8081`;
    case 'vllm':
      return `vllm serve ${model.huggingfaceRepo.replace('-GGUF', '')} --quantization ${config.quantId === 'AWQ-INT4' ? 'awq_marlin' : 'fp8'} --max-model-len ${config.contextSize} --gpu-memory-utilization 0.90 --port 8000`;
    case 'tensorrt-llm':
      return `trtllm-serve ${model.id}-${config.quantId}-engine --max_seq_len ${config.contextSize} --max_batch_size ${Math.max(1, Math.floor(config.batchSize / 128))} --kv_cache_free_gpu_memory_fraction 0.88 --port 8001`;
    case 'ktransformers':
      return `ktransformers --model_path ${model.huggingfaceRepo} --gguf_path ./models/${fileSlug} --optimize_config_path DeepSeek-V3-Chat.yaml --cpu_infer ${config.cpuThreads} --max_new_tokens 4096 --port 10002`;
    default:
      return `llama-server -m ./models/${fileSlug} -ngl ${gpuLayers} -c ${config.contextSize}`;
  }
}

export function computeExecutionPlan(
  profile: LocalHardwareProfile,
  config: RuntimeConfigInput,
): ExecutionPlan {
  const model = MODELS.find((m) => m.id === config.modelId) ?? MODELS[1];
  const runtime = RUNTIME_ENGINES.find((r) => r.id === config.runtimeId) ?? RUNTIME_ENGINES[0];
  const quant = QUANTIZATIONS.find((q) => q.id === config.quantId) ?? QUANTIZATIONS[4];
  const { usableVramGB, usableRamGB } = getUsableMemoryBudgets(profile);

  // Model weights footprint in GB (1e9 params * bpw / 8 / 1.07374 + 4% metadata/embeddings)
  const weightsSizeGB = round2(((model.paramsB * quant.bitsPerWeight) / 8) * 1.04);
  const diskUsageGB = round2(weightsSizeGB * 1.03);
  const kvCacheSizeGB = calculateKvCacheGB(
    model,
    config.contextSize,
    config.kvCacheQuant,
    config.flashAttention,
  );

  // Determine layer split according to strategy
  let gpuLayersAllocated = Math.max(0, Math.min(model.layers, Math.round(config.gpuLayers)));
  if (config.offloadStrategy === 'full-gpu') {
    gpuLayersAllocated = model.layers;
  } else if (config.offloadStrategy === 'cpu-only-mmap') {
    gpuLayersAllocated = 0;
  } else if (config.offloadStrategy === 'disk-layer-stream') {
    gpuLayersAllocated = 1;
  }
  const cpuLayersAllocated = Math.max(0, model.layers - gpuLayersAllocated);
  const gpuFraction = model.layers > 0 ? gpuLayersAllocated / model.layers : 0;

  let vramRequiredGB = 0;
  let ramRequiredGB = 0;

  if (profile.unifiedMemory) {
    // On Apple Silicon unified memory, GPU and CPU share the same pool
    const totalPoolUsed =
      weightsSizeGB + kvCacheSizeGB + runtime.vramOverheadGB + (config.offloadStrategy === 'cpu-only-mmap' ? 0.3 : 0);
    vramRequiredGB = config.offloadStrategy === 'cpu-only-mmap' ? 0 : round2(totalPoolUsed);
    ramRequiredGB = round2(totalPoolUsed);
  } else if (config.offloadStrategy === 'moe-cpu-experts' && model.isMoE) {
    // Attention + shared layers stay in VRAM (~14% of total weights + KV cache), routed experts live in RAM
    const gpuWeights = weightsSizeGB * 0.14;
    const cpuWeights = weightsSizeGB * 0.86;
    vramRequiredGB = round2(gpuWeights + kvCacheSizeGB + runtime.vramOverheadGB);
    ramRequiredGB = round2(cpuWeights + runtime.ramOverheadGB);
  } else if (config.offloadStrategy === 'disk-layer-stream') {
    // Single layer + embeddings in VRAM, streaming from NVMe
    const singleLayerGB = weightsSizeGB / Math.max(model.layers, 1);
    vramRequiredGB = round2(singleLayerGB * 2.2 + kvCacheSizeGB * 0.5 + runtime.vramOverheadGB);
    ramRequiredGB = round2(singleLayerGB * 4.0 + kvCacheSizeGB * 0.5 + runtime.ramOverheadGB);
  } else if (config.offloadStrategy === 'cpu-only-mmap') {
    vramRequiredGB = 0;
    ramRequiredGB = round2(weightsSizeGB + kvCacheSizeGB + runtime.ramOverheadGB);
  } else {
    // Full GPU or Hybrid split
    const gpuWeights = weightsSizeGB * gpuFraction;
    const cpuWeights = weightsSizeGB * (1 - gpuFraction);
    const kvOnGpu = gpuFraction > 0.35 ? kvCacheSizeGB * Math.max(0.5, gpuFraction) : 0;
    const kvOnRam = kvCacheSizeGB - kvOnGpu;
    vramRequiredGB =
      gpuLayersAllocated > 0
        ? round2(gpuWeights + kvOnGpu + runtime.vramOverheadGB)
        : 0;
    ramRequiredGB = round2(
      cpuWeights + kvOnRam + runtime.ramOverheadGB + (gpuLayersAllocated > 0 ? 0.8 : 0),
    );
  }

  const vramCapacity = profile.unifiedMemory ? usableVramGB : profile.vramTotalGB;
  const ramCapacity = profile.ramTotalGB;

  const vramUtilizationPct =
    vramCapacity > 0 ? Math.min(180, Math.round((vramRequiredGB / vramCapacity) * 100)) : vramRequiredGB > 0 ? 180 : 0;
  const ramUtilizationPct =
    ramCapacity > 0 ? Math.min(180, Math.round((ramRequiredGB / ramCapacity) * 100)) : 180;

  const vramFits =
    vramRequiredGB === 0 || (usableVramGB > 0 && vramRequiredGB <= usableVramGB * 1.02);
  const ramFits = ramRequiredGB <= usableRamGB * 1.04;
  const memoryFits = profile.unifiedMemory
    ? ramRequiredGB <= usableVramGB * 1.03
    : vramFits && ramFits;
  const diskFits = profile.diskAvailableGB >= diskUsageGB + 1.5;

  // Compute maximum practical context before hitting remaining memory headroom
  const kvPer1kTokensGB = calculateKvCacheGB(model, 1024, config.kvCacheQuant, config.flashAttention);
  let freeForKvGB = 0;
  if (profile.unifiedMemory) {
    freeForKvGB = Math.max(0, usableVramGB - weightsSizeGB - runtime.vramOverheadGB);
  } else if (gpuLayersAllocated > 0 && config.offloadStrategy !== 'cpu-only-mmap') {
    const baseGpu = vramRequiredGB - kvCacheSizeGB * (gpuFraction > 0.35 ? Math.max(0.5, gpuFraction) : 0);
    const freeGpu = Math.max(0, usableVramGB - baseGpu);
    const baseRam = ramRequiredGB - (kvCacheSizeGB - kvCacheSizeGB * (gpuFraction > 0.35 ? Math.max(0.5, gpuFraction) : 0));
    const freeRam = Math.max(0, usableRamGB - baseRam);
    freeForKvGB = config.offloadStrategy === 'full-gpu' ? freeGpu : Math.min(freeGpu + freeRam * 0.5, freeGpu * 1.35);
  } else {
    freeForKvGB = Math.max(0, usableRamGB - weightsSizeGB - runtime.ramOverheadGB);
  }
  const rawMaxCtx = kvPer1kTokensGB > 0 ? Math.floor((freeForKvGB / kvPer1kTokensGB) * 1024) : 2048;
  // Snap to clean power-of-2 / 2048 increments
  const maxPracticalContext = Math.max(
    512,
    Math.min(model.maxNativeContext, Math.floor(rawMaxCtx / 1024) * 1024 || 512),
  );

  // Performance Physics Estimation (Bandwidth-bound decode + FLOPs-bound prefill)
  const hostRamBandwidthGBs = profile.unifiedMemory
    ? profile.memoryBandwidthGBs
    : profile.cpuCores >= 16
      ? 64
      : profile.cpuCores >= 8
        ? 44
        : 28;

  const gpuBandwidthGBs =
    profile.memoryBandwidthGBs > 0
      ? profile.memoryBandwidthGBs
      : profile.unifiedMemory
        ? 150
        : 120;

  const activeWeightReadGB = (model.activeParamsB * quant.bitsPerWeight) / 8;

  let estimatedTokPerSec = 0;
  let bottleneck = 'GPU Memory Bandwidth';

  if (config.offloadStrategy === 'disk-layer-stream') {
    // NVMe sequential streaming ~ 3.5–5.5 GB/s
    const nvmeBandwidthGBs = 4.2;
    estimatedTokPerSec = round2(Math.max(0.06, (nvmeBandwidthGBs / Math.max(weightsSizeGB, 1)) * 0.85));
    bottleneck = 'NVMe SSD Sequential Read Throughput';
  } else if (config.offloadStrategy === 'moe-cpu-experts' && model.isMoE) {
    // Attention on GPU, active experts streamed from host RAM
    const gpuTime = (activeWeightReadGB * 0.16) / (gpuBandwidthGBs * runtime.decodeEfficiency);
    const cpuTime = (activeWeightReadGB * 0.84) / (hostRamBandwidthGBs * 0.62);
    estimatedTokPerSec = round1(1 / Math.max(0.01, gpuTime + cpuTime));
    bottleneck = 'Host System RAM Bandwidth (MoE Expert Routing)';
  } else if (gpuLayersAllocated === 0 || config.offloadStrategy === 'cpu-only-mmap') {
    const threadScale = Math.min(1.0, config.cpuThreads / Math.max(4, Math.min(profile.cpuCores, 12)));
    const effectiveBw = hostRamBandwidthGBs * 0.68 * threadScale;
    estimatedTokPerSec = round1(effectiveBw / Math.max(0.4, activeWeightReadGB));
    bottleneck = 'System RAM Bandwidth & CPU SIMD';
  } else if (gpuFraction >= 0.99) {
    const contextPenalty = 1 + (config.contextSize / 65536) * 0.14;
    const effectiveBw = gpuBandwidthGBs * runtime.decodeEfficiency;
    estimatedTokPerSec = round1(effectiveBw / Math.max(0.3, activeWeightReadGB * contextPenalty));
    bottleneck = profile.unifiedMemory ? 'Apple Unified Memory Bandwidth' : 'GPU VRAM Bandwidth';
  } else {
    // Hybrid split: GPU part + PCIe sync + CPU part
    const gpuTime = (activeWeightReadGB * gpuFraction) / (gpuBandwidthGBs * runtime.decodeEfficiency);
    const cpuTime = (activeWeightReadGB * (1 - gpuFraction)) / (hostRamBandwidthGBs * 0.65);
    const pcieOverhead = 0.008 * (1 - gpuFraction);
    estimatedTokPerSec = round1(1 / Math.max(0.01, gpuTime + cpuTime + pcieOverhead));
    bottleneck = `PCIe Bus & CPU RAM (${cpuLayersAllocated} offloaded layers)`;
  }

  // Model load time (SSD read ~2.6 GB/s warm or 1.4 GB/s cold + mmap benefit)
  const ssdReadGBs = config.useMmap ? 3.8 : 1.9;
  const pcieTransferSec = profile.unifiedMemory ? 0 : (vramRequiredGB / 14.5);
  const estimatedLoadTimeSec = round1(Math.max(0.6, weightsSizeGB / ssdReadGBs + pcieTransferSec));

  // TTFT for a representative 512-token prompt (2 * activeParamsB * 512 GFLOPs)
  const promptTokens = 512;
  const prefillFlopsT = (2 * model.activeParamsB * promptTokens) / 1000;
  const gpuTflops = Math.max(2.5, profile.gpuFp16Tflops || 8);
  const cpuTflops = Math.max(0.18, (profile.cpuCores * 18) / 1000);
  const effectivePrefillTflops =
    config.offloadStrategy === 'disk-layer-stream'
      ? 0.08
      : gpuLayersAllocated === 0
        ? cpuTflops
        : gpuTflops * gpuFraction * runtime.prefillEfficiency + cpuTflops * (1 - gpuFraction);
  const estimatedTtftMs = Math.round(
    Math.max(45, (prefillFlopsT / Math.max(0.05, effectivePrefillTflops)) * 1000 + 35),
  );

  // Utilization & Thermal Estimation
  const estimatedGpuUtilPct =
    gpuLayersAllocated === 0 ? 4 : config.offloadStrategy === 'full-gpu' ? 96 : Math.round(35 + gpuFraction * 58);
  const estimatedCpuUtilPct =
    gpuLayersAllocated === 0
      ? 92
      : config.offloadStrategy === 'full-gpu'
        ? 14
        : Math.round(25 + (1 - gpuFraction) * 65);

  const baseAmbientTemp = profile.currentGpuTempC ?? (profile.unifiedMemory ? 44 : 46);
  const loadHeatDelta =
    config.offloadStrategy === 'cpu-only-mmap'
      ? 34
      : profile.unifiedMemory
        ? 24
        : config.offloadStrategy === 'full-gpu'
          ? 27
          : 29;
  const modelWeightThermalBonus = Math.min(8, weightsSizeGB / 12);
  const estimatedSteadyTempC = Math.round(
    Math.min(92, baseAmbientTemp + loadHeatDelta * (estimatedGpuUtilPct > 80 || estimatedCpuUtilPct > 80 ? 1 : 0.78) + modelWeightThermalBonus),
  );
  const thermalState: 'nominal' | 'warm' | 'throttling' =
    estimatedSteadyTempC >= 84 ? 'throttling' : estimatedSteadyTempC >= 75 ? 'warm' : 'nominal';

  // Validation Tier Determination (Team Validated vs Experimentally Possible vs Exceeds Hardware)
  const runtimeEval = evaluateRuntimes(profile).find((r) => r.engine.id === runtime.id);
  const validationReasons: string[] = [];
  let validationStatus: ValidationStatus = 'team-validated';

  const runtimeSupportsQuant = quant.compatibleRuntimes.includes(runtime.id);
  if (!runtimeEval?.compatible) {
    validationStatus = 'exceeds-hardware';
    validationReasons.push(runtimeEval?.compatibilityReason ?? 'Selected runtime is incompatible with local GPU vendor.');
  }
  if (!runtimeSupportsQuant) {
    validationStatus = 'exceeds-hardware';
    validationReasons.push(`${runtime.name} does not natively support ${quant.id} format.`);
  }
  if (!memoryFits) {
    validationStatus = 'exceeds-hardware';
    if (!profile.unifiedMemory && !vramFits) {
      validationReasons.push(
        `VRAM required (${vramRequiredGB} GB) exceeds usable local VRAM (${usableVramGB} GB). Lower GPU layers or switch to Hybrid Offload.`,
      );
    }
    if (!ramFits) {
      validationReasons.push(
        `System RAM required (${ramRequiredGB} GB) exceeds usable local RAM (${usableRamGB} GB).`,
      );
    }
  }
  if (!diskFits) {
    validationStatus = 'exceeds-hardware';
    validationReasons.push(
      `Model artifact (${diskUsageGB} GB) exceeds detected free storage (${round1(profile.diskAvailableGB)} GB).`,
    );
  }

  if (validationStatus !== 'exceeds-hardware') {
    const isExperimentalReasons: string[] = [];
    if (!quant.teamValidated || !model.teamValidatedQuants.includes(quant.id)) {
      isExperimentalReasons.push(
        `${quant.id} (${quant.bitsPerWeight} bpw) is an experimental ultra-low-bit quantization with higher perplexity delta (${quant.perplexityDelta}).`,
      );
    }
    if (runtime.validationStatus === 'experimental' || runtimeEval?.effectiveValidation === 'experimental') {
      isExperimentalReasons.push(`${runtime.name} is classified as experimental on this local hardware class.`);
    }
    if (config.offloadStrategy === 'hybrid-gpu-cpu' || config.offloadStrategy === 'moe-cpu-experts' || config.offloadStrategy === 'disk-layer-stream') {
      isExperimentalReasons.push(
        `Uses ${config.offloadStrategy.replace(/-/g, ' ')} execution (${gpuLayersAllocated}/${model.layers} GPU layers); performance is host-bus limited.`,
      );
    }
    if (config.contextSize > maxPracticalContext) {
      isExperimentalReasons.push(
        `Requested context (${config.contextSize.toLocaleString()}) exceeds safe practical context ceiling (${maxPracticalContext.toLocaleString()}).`,
      );
    }
    if (estimatedTokPerSec < 5.0) {
      isExperimentalReasons.push(
        `Projected decode throughput (${estimatedTokPerSec} tok/s) falls below interactive team benchmark threshold (5.0 tok/s).`,
      );
    }
    if (profile.ramPrivacyCapped && ramRequiredGB > 6.5) {
      isExperimentalReasons.push(
        'Browser capped RAM detection at 8 GB; verify installed RAM in Hardware Probe or connect Local Agent to confirm headroom.',
      );
    }

    if (isExperimentalReasons.length > 0) {
      validationStatus = 'experimental';
      validationReasons.push(...isExperimentalReasons);
    } else {
      validationReasons.push(
        `Verified against Project 3 baseline: fits cleanly in local memory with ${estimatedTokPerSec} tok/s projected decode and ${maxPracticalContext.toLocaleString()} practical context ceiling.`,
      );
    }
  }

  const executionMode: 'standard' | 'advanced-offload' =
    config.offloadStrategy === 'full-gpu' || (profile.vramTotalGB < 4 && config.offloadStrategy === 'cpu-only-mmap')
      ? 'standard'
      : 'advanced-offload';

  const validationHeadline =
    validationStatus === 'team-validated'
      ? 'Team Validated Configuration'
      : validationStatus === 'experimental'
        ? 'Experimentally Possible Configuration'
        : 'Exceeds Detected Local Hardware';

  return {
    config,
    model,
    runtime,
    quant,
    validationStatus,
    validationHeadline,
    validationReasons,
    executionMode,
    totalLayers: model.layers,
    gpuLayersAllocated,
    cpuLayersAllocated,
    diskUsageGB,
    weightsSizeGB,
    kvCacheSizeGB,
    vramRequiredGB,
    ramRequiredGB,
    vramUtilizationPct,
    ramUtilizationPct,
    diskFits,
    memoryFits,
    maxPracticalContext,
    estimatedLoadTimeSec,
    estimatedTtftMs,
    estimatedTokPerSec,
    estimatedGpuUtilPct,
    estimatedCpuUtilPct,
    estimatedSteadyTempC,
    thermalState,
    bottleneck,
    cliCommand: buildCliCommand(config, model, gpuLayersAllocated),
  };
}

export function evaluateHardwareProfile(profile: LocalHardwareProfile): HalEvaluationResult {
  const hardwareClass = classifyHardware(profile);
  const { usableVramGB, usableRamGB } = getUsableMemoryBudgets(profile);
  const runtimes = evaluateRuntimes(profile);

  const recommendedRuntimeId: RuntimeId =
    runtimes.find((r) => r.compatible && r.engine.id === hardwareClass.recommendedRuntime)?.engine.id ??
    runtimes.find((r) => r.compatible && r.recommended)?.engine.id ??
    'llama.cpp';

  const modelCompatibility: HalEvaluationResult['modelCompatibility'] = {};

  let largestValidated = {
    modelId: MODELS[0].id,
    modelName: MODELS[0].name,
    quantId: 'Q4_K_M',
    runtimeId: recommendedRuntimeId,
    estimatedTokPerSec: 12,
    maxPracticalContext: 8192,
    paramsB: 0,
  };

  let largestExperimental = {
    modelId: MODELS[0].id,
    modelName: MODELS[0].name,
    quantId: 'IQ3_XXS',
    runtimeId: 'llama.cpp' as RuntimeId,
    offloadStrategy: 'hybrid-gpu-cpu' as OffloadStrategy,
    estimatedTokPerSec: 4,
    maxPracticalContext: 4096,
    paramsB: 0,
  };

  for (const model of MODELS) {
    // Evaluate standard execution first (Full GPU if discrete/unified VRAM >= 4GB, else CPU mmap)
    const standardRuntime: RuntimeId =
      recommendedRuntimeId === 'exllamav2' && model.paramsB >= 70 && !profile.unifiedMemory && usableVramGB < 36
        ? 'llama.cpp'
        : recommendedRuntimeId;

    const standardQuant =
      standardRuntime === 'exllamav2'
        ? 'EXL2-4.25bpw'
        : standardRuntime === 'vllm' || standardRuntime === 'tensorrt-llm'
          ? 'AWQ-INT4'
          : 'Q4_K_M';

    const standardStrategy: OffloadStrategy =
      usableVramGB >= 4 ? 'full-gpu' : 'cpu-only-mmap';

    const standardPlan = computeExecutionPlan(profile, {
      modelId: model.id,
      runtimeId: standardRuntime,
      quantId: standardQuant,
      offloadStrategy: standardStrategy,
      gpuLayers: standardStrategy === 'full-gpu' ? model.layers : 0,
      contextSize: 8192,
      kvCacheQuant: 'q8_0',
      cpuThreads: Math.max(4, Math.floor(profile.cpuCores * 0.75)),
      flashAttention: true,
      useMmap: true,
      batchSize: 512,
    });

    // Also try llama.cpp Q4_K_M full-gpu if recommended runtime had higher overhead
    const llamaStandardPlan = computeExecutionPlan(profile, {
      modelId: model.id,
      runtimeId: 'llama.cpp',
      quantId: 'Q4_K_M',
      offloadStrategy: standardStrategy,
      gpuLayers: standardStrategy === 'full-gpu' ? model.layers : 0,
      contextSize: 8192,
      kvCacheQuant: 'q8_0',
      cpuThreads: Math.max(4, Math.floor(profile.cpuCores * 0.75)),
      flashAttention: true,
      useMmap: true,
      batchSize: 512,
    });

    const bestStd =
      standardPlan.validationStatus === 'team-validated'
        ? standardPlan
        : llamaStandardPlan.validationStatus === 'team-validated'
          ? llamaStandardPlan
          : standardPlan.memoryFits
            ? standardPlan
            : llamaStandardPlan;

    // Evaluate advanced/offload execution (Hybrid GPU+CPU or MoE CPU experts with IQ3_XXS / IQ2_XS / Q4_K_M)
    const offloadQuant = model.paramsB >= 70 ? 'IQ2_XS' : 'IQ3_XXS';
    const offloadStrategy: OffloadStrategy = model.isMoE
      ? 'moe-cpu-experts'
      : usableVramGB >= 4 && !profile.unifiedMemory
        ? 'hybrid-gpu-cpu'
        : 'cpu-only-mmap';

    // Auto-calculate max GPU layers that fit into usableVramGB
    const quantSpec = QUANTIZATIONS.find((q) => q.id === offloadQuant)!;
    const estWeightsGB = ((model.paramsB * quantSpec.bitsPerWeight) / 8) * 1.04;
    const autoGpuLayers =
      offloadStrategy === 'hybrid-gpu-cpu' && estWeightsGB > 0
        ? Math.max(0, Math.min(model.layers, Math.floor(((usableVramGB - 1.4) / estWeightsGB) * model.layers)))
        : offloadStrategy === 'cpu-only-mmap'
          ? 0
          : model.layers;

    const offloadPlan = computeExecutionPlan(profile, {
      modelId: model.id,
      runtimeId: model.isMoE && profile.gpuVendor === 'nvidia' && profile.ramTotalGB >= 64 ? 'ktransformers' : 'llama.cpp',
      quantId: offloadQuant,
      offloadStrategy,
      gpuLayers: autoGpuLayers,
      contextSize: 4096,
      kvCacheQuant: 'q4_0',
      cpuThreads: Math.max(4, Math.floor(profile.cpuCores * 0.85)),
      flashAttention: true,
      useMmap: true,
      batchSize: 256,
    });

    const activeBest = bestStd.validationStatus !== 'exceeds-hardware' ? bestStd : offloadPlan;

    modelCompatibility[model.id] = {
      bestStandardStatus: bestStd.validationStatus,
      bestOffloadStatus: offloadPlan.validationStatus,
      recommendedQuant: activeBest.quant.id,
      recommendedRuntime: activeBest.runtime.id,
      estimatedTokPerSec: activeBest.estimatedTokPerSec,
      vramRequiredGB: activeBest.vramRequiredGB,
      ramRequiredGB: activeBest.ramRequiredGB,
      diskUsageGB: activeBest.diskUsageGB,
    };

    if (bestStd.validationStatus === 'team-validated' && model.paramsB >= largestValidated.paramsB) {
      largestValidated = {
        modelId: model.id,
        modelName: model.name,
        quantId: bestStd.quant.id,
        runtimeId: bestStd.runtime.id,
        estimatedTokPerSec: bestStd.estimatedTokPerSec,
        maxPracticalContext: bestStd.maxPracticalContext,
        paramsB: model.paramsB,
      };
    }

    if (
      (offloadPlan.validationStatus === 'experimental' || offloadPlan.validationStatus === 'team-validated') &&
      model.paramsB >= largestExperimental.paramsB
    ) {
      largestExperimental = {
        modelId: model.id,
        modelName: model.name,
        quantId: offloadPlan.quant.id,
        runtimeId: offloadPlan.runtime.id,
        offloadStrategy: offloadPlan.config.offloadStrategy,
        estimatedTokPerSec: offloadPlan.estimatedTokPerSec,
        maxPracticalContext: offloadPlan.maxPracticalContext,
        paramsB: model.paramsB,
      };
    }
  }

  return {
    hardwareClass,
    allHardwareClasses: HARDWARE_CLASSES,
    usableVramGB,
    usableRamGB,
    runtimes,
    recommendedRuntimeId,
    largestValidatedModel: {
      modelId: largestValidated.modelId,
      modelName: largestValidated.modelName,
      quantId: largestValidated.quantId,
      runtimeId: largestValidated.runtimeId,
      estimatedTokPerSec: largestValidated.estimatedTokPerSec,
      maxPracticalContext: largestValidated.maxPracticalContext,
    },
    largestExperimentalModel: {
      modelId: largestExperimental.modelId,
      modelName: largestExperimental.modelName,
      quantId: largestExperimental.quantId,
      runtimeId: largestExperimental.runtimeId,
      offloadStrategy: largestExperimental.offloadStrategy,
      estimatedTokPerSec: largestExperimental.estimatedTokPerSec,
      maxPracticalContext: largestExperimental.maxPracticalContext,
    },
    modelCompatibility,
  };
}

export function runDiagnosticsSuite(
  profile: LocalHardwareProfile,
  plan: ExecutionPlan | null,
): DiagnosticReport {
  const checks: DiagnosticCheck[] = [];
  const { usableVramGB, usableRamGB } = getUsableMemoryBudgets(profile);

  // 1. Hardware Probe Integrity
  checks.push({
    id: 'diag-probe',
    category: 'Hardware',
    name: 'Local Computer Detection Pipeline',
    status: profile.detectionSource === 'system-hardware' ? 'pass' : profile.ramPrivacyCapped ? 'warn' : 'pass',
    measuredValue:
      profile.detectionSource === 'system-hardware'
        ? 'Native System Hardware'
        : profile.detectionSource === 'browser-probe-refined'
          ? 'Browser Probe + Verified Specs'
          : 'Browser Hardware Probe',
    threshold: 'Physical System Hardware',
    detail:
      profile.detectionSource === 'system-hardware'
        ? `Direct hardware detection (${profile.hostname ?? profile.osName}) identified exact memory and processor specifications.`
        : profile.ramPrivacyCapped
          ? 'Browser detected local CPU/GPU accurately, but W3C navigator.deviceMemory privacy-caps RAM reporting at 8 GB.'
          : `Browser hardware probe successfully identified ${profile.gpuName} and ${profile.cpuCores} logical CPU cores.`,
    remediation: profile.ramPrivacyCapped
      ? 'Verify exact installed RAM in Hardware Probe verification drawer.'
      : undefined,
  });

  // 2. GPU Acceleration & Compute API
  checks.push({
    id: 'diag-gpu',
    category: 'Hardware',
    name: 'GPU Compute & Shader FP16 Capability',
    status: profile.webgpuSupported ? 'pass' : profile.vramTotalGB >= 4 ? 'warn' : 'warn',
    measuredValue: `${profile.gpuName} (${profile.webgpuSupported ? 'WebGPU Active' : 'WebGL2 Fallback'})`,
    threshold: 'Discrete or Unified GPU >= 4 GB',
    detail: profile.webgpuSupported
      ? `WebGPU adapter active (Max Buffer: ${profile.webgpuMaxBufferMB} MB, FP16 Shader: ${profile.webgpuShaderF16 ? 'Yes' : 'No'}).`
      : 'WebGPU unavailable in this browser context; GPU identified via WebGL2 unmasked renderer.',
    remediation: !profile.webgpuSupported
      ? 'Use native llama.cpp/ExLlamaV2 via CLI or enable WebGPU in Chromium/Safari for in-browser GPU compute tests.'
      : undefined,
  });

  // 3. VRAM / Unified Memory Headroom
  if (plan) {
    checks.push({
      id: 'diag-vram',
      category: 'Memory',
      name: profile.unifiedMemory ? 'Unified Memory Allocation Fit' : 'VRAM Allocation Fit',
      status: !plan.memoryFits ? 'fail' : plan.vramUtilizationPct > 88 ? 'warn' : 'pass',
      measuredValue: `${plan.vramRequiredGB} GB / ${usableVramGB} GB usable (${plan.vramUtilizationPct}%)`,
      threshold: '<= 88% safe ceiling',
      detail: plan.memoryFits
        ? `Selected model (${plan.model.name} ${plan.quant.id}) fits within local ${profile.unifiedMemory ? 'Unified Memory' : 'VRAM'} budget.`
        : `Allocation exceeds available ${profile.unifiedMemory ? 'Unified Memory' : 'VRAM'} and will trigger OOM or severe OS paging.`,
      remediation: !plan.memoryFits
        ? 'Reduce GPU layers (-ngl), switch to Q4_K_M / IQ3_XXS quantization, or choose a smaller parameter class.'
        : plan.vramUtilizationPct > 88
          ? 'Consider enabling Q8_0 or Q4_0 KV cache quantization to protect against OOM at high context lengths.'
          : undefined,
    });

    // 4. KV-Cache Context Ceiling
    const ctxOk = plan.config.contextSize <= plan.maxPracticalContext;
    checks.push({
      id: 'diag-kv',
      category: 'Memory',
      name: 'KV-Cache & Practical Context Ceiling',
      status: ctxOk ? 'pass' : 'warn',
      measuredValue: `${plan.config.contextSize.toLocaleString()} req / ${plan.maxPracticalContext.toLocaleString()} max`,
      threshold: 'Requested <= Practical Max',
      detail: `KV cache requires ${plan.kvCacheSizeGB} GB at ${plan.config.kvCacheQuant.toUpperCase()} precision (${plan.config.flashAttention ? 'Flash Attention enabled' : 'Standard Attention'}).`,
      remediation: !ctxOk
        ? `Lower context window to ${plan.maxPracticalContext.toLocaleString()} tokens or quantize KV cache to Q4_0.`
        : undefined,
    });
  } else {
    checks.push({
      id: 'diag-mem-base',
      category: 'Memory',
      name: 'System Memory & VRAM Inventory',
      status: usableRamGB >= 12 ? 'pass' : 'warn',
      measuredValue: `${profile.ramTotalGB} GB RAM · ${profile.unifiedMemory ? `${profile.unifiedMemoryPoolGB} GB Unified` : `${profile.vramTotalGB} GB VRAM`}`,
      threshold: '>= 16 GB RAM recommended',
      detail: `Detected ${usableRamGB} GB usable host RAM and ${usableVramGB} GB usable GPU memory.`,
    });
  }

  // 5. Storage / Disk Space Check
  const requiredDisk = plan ? plan.diskUsageGB + 2 : 10;
  const diskPass = profile.diskAvailableGB >= requiredDisk;
  checks.push({
    id: 'diag-disk',
    category: 'Storage',
    name: 'Local Storage Quota for Model Weights',
    status: diskPass ? 'pass' : 'fail',
    measuredValue: `${round1(profile.diskAvailableGB)} GB available`,
    threshold: `>= ${round1(requiredDisk)} GB needed`,
    detail: `Probed via ${profile.diskProbeSource === 'native-os' ? 'local filesystem stat' : profile.diskProbeSource === 'user-verified' ? 'user-verified local disk' : 'Browser StorageManager quota API'}.`,
    remediation: !diskPass
      ? 'Free local SSD space or select a smaller quantized model artifact.'
      : undefined,
  });

  // 6. Runtime Engine Compatibility
  if (plan) {
    const engineEval = evaluateRuntimes(profile).find((r) => r.engine.id === plan.runtime.id);
    checks.push({
      id: 'diag-runtime',
      category: 'Runtime',
      name: `Runtime Backend Compatibility (${plan.runtime.name})`,
      status: !engineEval?.compatible
        ? 'fail'
        : plan.validationStatus === 'team-validated'
          ? 'pass'
          : 'warn',
      measuredValue: plan.validationHeadline,
      threshold: 'Team Validated preferred',
      detail: plan.validationReasons[0] ?? 'Runtime compatibility verified.',
      remediation:
        plan.validationStatus !== 'team-validated'
          ? 'Switch to llama.cpp (universal) or MLX-LM (Apple Silicon) with Q4_K_M for a Team Validated configuration.'
          : undefined,
    });
  }

  // 7. Thermal & Sustained Load Headroom
  const projectedTemp = plan?.estimatedSteadyTempC ?? (profile.currentGpuTempC ?? 68);
  checks.push({
    id: 'diag-thermal',
    category: 'Thermal',
    name: 'Thermal & Resource Stability Envelope',
    status: projectedTemp >= 84 ? 'fail' : projectedTemp >= 76 ? 'warn' : 'pass',
    measuredValue: `${projectedTemp}°C projected sustained`,
    threshold: '< 76°C nominal · < 84°C throttle',
    detail:
      projectedTemp >= 84
        ? 'Sustained inference likely to trigger CPU/GPU thermal throttling and reduced tok/s.'
        : projectedTemp >= 76
          ? 'Moderate thermal load expected during long prefill prompts; monitor fan curves.'
          : 'Comfortable thermal margin for continuous token generation.',
    remediation:
      projectedTemp >= 76
        ? 'Reduce CPU thread count to physical cores only or apply an 80% GPU power limit.'
        : undefined,
  });

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');

  return {
    id: `diag-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    overallStatus: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
    hardwareSummary: `${profile.cpuModel} (${profile.cpuCores}T) · ${profile.gpuName} · ${profile.ramTotalGB}GB RAM`,
    checks,
  };
}
