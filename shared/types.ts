export type ValidationStatus = 'team-validated' | 'experimental' | 'exceeds-hardware';

export type DetectionSource = 'system-hardware' | 'browser-probe' | 'browser-probe-refined';

export type GpuVendor = 'nvidia' | 'apple' | 'amd' | 'intel' | 'unknown';

export type OffloadStrategy =
  | 'full-gpu'
  | 'hybrid-gpu-cpu'
  | 'moe-cpu-experts'
  | 'cpu-only-mmap'
  | 'disk-layer-stream';

export type KvCacheQuant = 'fp16' | 'q8_0' | 'q4_0';

export type RuntimeId =
  | 'llama.cpp'
  | 'ollama'
  | 'exllamav2'
  | 'mlc-llm'
  | 'mlx-lm'
  | 'vllm'
  | 'tensorrt-llm'
  | 'ktransformers';

export interface LocalHardwareProfile {
  detectionSource: DetectionSource;
  detectedAt: string;
  hostname?: string;
  osName: string;
  osVersion: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  ramTotalGB: number;
  ramAvailableGB: number;
  ramPrivacyCapped: boolean;
  gpuVendor: GpuVendor;
  gpuName: string;
  gpuRendererRaw: string;
  gpuArchitecture: string;
  vramTotalGB: number;
  vramAvailableGB: number;
  unifiedMemory: boolean;
  unifiedMemoryPoolGB: number;
  memoryBandwidthGBs: number;
  gpuFp16Tflops: number;
  diskTotalGB: number;
  diskAvailableGB: number;
  diskProbeSource: 'native-os' | 'storage-manager' | 'user-verified';
  webgpuSupported: boolean;
  webgpuShaderF16: boolean;
  webgpuMaxBufferMB: number;
  thermalSensorAvailable: boolean;
  currentGpuTempC: number | null;
  currentCpuTempC: number | null;
}

export interface GitHubProject {
  id: string;
  name: string;
  repo: string;
  url: string;
  language: string;
  starsApprox: string;
  category: 'constrained-edge' | 'gpu-high-throughput' | 'hybrid-moe' | 'apple-silicon' | 'disk-offload';
  validationStatus: 'team-validated' | 'experimental';
  quantizationFormats: string[];
  offloadingSupport: string;
  targetHardware: string;
  strengths: string;
  tradeoffs: string;
  summary: string;
}

export interface RuntimeEngineSpec {
  id: RuntimeId;
  name: string;
  repo: string;
  category: 'constrained-universal' | 'gpu-specialized' | 'apple-native' | 'moe-offload';
  supportedVendors: GpuVendor[];
  supportsCpuOnly: boolean;
  supportsHybridOffload: boolean;
  supportsDiskStream: boolean;
  supportedQuants: string[];
  vramOverheadGB: number;
  ramOverheadGB: number;
  prefillEfficiency: number;
  decodeEfficiency: number;
  defaultPort: number;
  validationStatus: 'team-validated' | 'experimental';
  notes: string;
}

export interface EvaluatedRuntime {
  engine: RuntimeEngineSpec;
  compatible: boolean;
  recommended: boolean;
  compatibilityReason: string;
  estimatedOverheadGB: number;
  effectiveValidation: ValidationStatus;
}

export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  paramsB: number;
  activeParamsB: number;
  isMoE: boolean;
  layers: number;
  kvHeads: number;
  headDim: number;
  hiddenSize: number;
  maxNativeContext: number;
  huggingfaceRepo: string;
  defaultQuant: string;
  recommendedForStandard: boolean;
  minHardwareClassId: string;
  useCase: string;
  teamValidatedQuants: string[];
}

export interface QuantizationSpec {
  id: string;
  label: string;
  bitsPerWeight: number;
  perplexityDelta: string;
  qualityTier: 'Lossless' | 'Near-Lossless' | 'Balanced' | 'Aggressive' | 'Extreme';
  compatibleRuntimes: RuntimeId[];
  teamValidated: boolean;
  notes: string;
}

export interface HardwareClassSpec {
  id: string;
  name: string;
  tierIndex: number;
  typicalSpecs: string;
  minRamGB: number;
  minVramGB: number;
  unifiedMemoryClass?: boolean;
  largestValidatedModel: string;
  largestValidatedQuant: string;
  largestExperimentalModel: string;
  largestExperimentalQuant: string;
  recommendedRuntime: RuntimeId;
  expectedTokPerSec: string;
  practicalContextCeiling: number;
  thermalNotes: string;
}

export interface RuntimeConfigInput {
  modelId: string;
  runtimeId: RuntimeId;
  quantId: string;
  offloadStrategy: OffloadStrategy;
  gpuLayers: number;
  contextSize: number;
  kvCacheQuant: KvCacheQuant;
  cpuThreads: number;
  flashAttention: boolean;
  useMmap: boolean;
  batchSize: number;
}

export interface ExecutionPlan {
  config: RuntimeConfigInput;
  model: ModelSpec;
  runtime: RuntimeEngineSpec;
  quant: QuantizationSpec;
  validationStatus: ValidationStatus;
  validationHeadline: string;
  validationReasons: string[];
  executionMode: 'standard' | 'advanced-offload';
  totalLayers: number;
  gpuLayersAllocated: number;
  cpuLayersAllocated: number;
  diskUsageGB: number;
  weightsSizeGB: number;
  kvCacheSizeGB: number;
  vramRequiredGB: number;
  ramRequiredGB: number;
  vramUtilizationPct: number;
  ramUtilizationPct: number;
  diskFits: boolean;
  memoryFits: boolean;
  maxPracticalContext: number;
  estimatedLoadTimeSec: number;
  estimatedTtftMs: number;
  estimatedTokPerSec: number;
  estimatedGpuUtilPct: number;
  estimatedCpuUtilPct: number;
  estimatedSteadyTempC: number;
  thermalState: 'nominal' | 'warm' | 'throttling';
  bottleneck: string;
  cliCommand: string;
}

export interface HalEvaluationResult {
  hardwareClass: HardwareClassSpec;
  allHardwareClasses: HardwareClassSpec[];
  usableVramGB: number;
  usableRamGB: number;
  runtimes: EvaluatedRuntime[];
  recommendedRuntimeId: RuntimeId;
  largestValidatedModel: {
    modelId: string;
    modelName: string;
    quantId: string;
    runtimeId: RuntimeId;
    estimatedTokPerSec: number;
    maxPracticalContext: number;
  };
  largestExperimentalModel: {
    modelId: string;
    modelName: string;
    quantId: string;
    runtimeId: RuntimeId;
    offloadStrategy: OffloadStrategy;
    estimatedTokPerSec: number;
    maxPracticalContext: number;
  };
  modelCompatibility: Record<
    string,
    {
      bestStandardStatus: ValidationStatus;
      bestOffloadStatus: ValidationStatus;
      recommendedQuant: string;
      recommendedRuntime: RuntimeId;
      estimatedTokPerSec: number;
      vramRequiredGB: number;
      ramRequiredGB: number;
      diskUsageGB: number;
    }
  >;
}

export interface BenchmarkRecord {
  id: string;
  timestamp: string;
  source: 'team-baseline' | 'local-run';
  hardwareClassId: string;
  hardwareLabel: string;
  modelId: string;
  modelName: string;
  runtimeId: RuntimeId;
  quantId: string;
  offloadStrategy: OffloadStrategy;
  gpuLayersSplit: string;
  contextLength: number;
  maxPracticalContext: number;
  ramUsedGB: number;
  vramUsedGB: number;
  diskUsageGB: number;
  loadTimeSec: number;
  ttftMs: number;
  tokensPerSec: number;
  cpuUtilPct: number;
  gpuUtilPct: number;
  peakTempC: number;
  thermalBehavior: 'Stable' | 'Warm Sustained' | 'Thermal Throttled';
  validationStatus: ValidationStatus;
}

export interface DownloadTask {
  id: string;
  modelId: string;
  modelName: string;
  quantId: string;
  fileName: string;
  totalGB: number;
  downloadedGB: number;
  progressPct: number;
  speedMBs: number;
  status: 'downloading' | 'completed' | 'cancelled' | 'paused' | 'failed';
  startedAt: string;
  localPath: string;
  errorMessage?: string;
}

export interface RuntimeSession {
  id: string;
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';
  startedAt: string | null;
  stoppedAt: string | null;
  executionMode: 'native' | 'hosted';
  endpointUrl: string;
  plan: ExecutionPlan | null;
  totalPromptsRun: number;
  totalTokensGenerated: number;
  lastTtftMs: number | null;
  lastTokPerSec: number | null;
  logs: Array<{ ts: string; level: 'info' | 'warn' | 'error'; message: string }>;
}

export interface TelemetrySample {
  timestamp: string;
  ramUsedGB: number;
  ramTotalGB: number;
  vramUsedGB: number;
  vramTotalGB: number;
  cpuUtilPct: number;
  gpuUtilPct: number;
  tempC: number;
  tokensPerSec: number;
  ttftMs: number;
  powerWatts: number;
  source: 'live-telemetry';
}

export interface DiagnosticCheck {
  id: string;
  category: 'Hardware' | 'Memory' | 'Runtime' | 'Storage' | 'Thermal';
  name: string;
  status: 'pass' | 'warn' | 'fail';
  measuredValue: string;
  threshold: string;
  detail: string;
  remediation?: string;
}

export interface DiagnosticReport {
  id: string;
  generatedAt: string;
  overallStatus: 'pass' | 'warn' | 'fail';
  hardwareSummary: string;
  checks: DiagnosticCheck[];
}
