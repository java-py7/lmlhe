export interface LocalAgentQuickSpec {
  cpu: string;
  cores: number;
  threads: number;
  ram_total_gb: number;
  ram_free_gb: number;
  gpu: string;
  vram: string;
}

export interface LocalAgentStatusResponse {
  status: string;
  service: string;
  connected: boolean;
  role: string;
  version: string;
  timestamp: number;
  machine: {
    hostname: string;
    os: string;
    architecture: string;
    python_version: string;
  };
  quick_spec: LocalAgentQuickSpec;
}

export interface LocalAgentState {
  status: 'checking' | 'connected' | 'disconnected';
  url: string;
  data: LocalAgentStatusResponse | null;
  error?: string;
  hardware: HardwareProfile | null;
  models: ModelEntry[];
  runtimes: RuntimeStatusResponse | null;
  metrics: LiveMetrics | null;
}

export interface DeploymentInfo {
  is_hosted: boolean;
  environment: 'production' | 'development';
  provider: string;
  target_scope: 'server_container' | 'local_workstation';
  badge_text: string;
  description: string;
  hardware_notice: string;
}

export interface CPUInfo {
  name: string;
  architecture: string;
  physical_cores: number;
  logical_threads: number;
  frequency_mhz?: {
    current: number;
    min: number;
    max: number;
  };
  utilization_percent: number;
  per_core_percent?: number[];
  temperature_celsius?: number;
  temperature_supported?: boolean;
}

export interface RAMInfo {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  total_gb: number;
  available_gb: number;
  used_gb: number;
  utilization_percent: number;
  swap_total_bytes?: number;
  swap_used_bytes?: number;
  swap_free_bytes?: number;
}

export interface GPUInfo {
  detected: boolean;
  name: string;
  vendor: string;
  dedicated_vram_bytes?: number;
  dedicated_vram_formatted?: string;
  shared_vram_bytes?: number;
  shared_vram_formatted?: string;
  driver_version?: string;
  cuda_compute_capability?: string;
  utilization_percent?: string;
  temperature_celsius?: string;
}

export interface DriveInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
  total_gb: number;
  free_gb: number;
  used_gb: number;
  percent_used: number;
}

export interface OSInfo {
  system: string;
  release: string;
  version: string;
  machine: string;
  python_version: string;
}

export interface HardwareProfile {
  cpu: CPUInfo;
  ram: RAMInfo;
  gpu: GPUInfo;
  storage: DriveInfo[];
  os: OSInfo;
  deployment?: DeploymentInfo;
}

export interface ModelEntry {
  id: string;
  name: string;
  file_name: string;
  path: string;
  format: string;
  quantization: string;
  size_bytes: number;
  size_formatted: string;
  architecture: string;
  parameter_size: string;
  context_length: number;
  runtime_compatibility: string[];
  is_available: boolean;
  status_message: string;
  location_drive: string;
  source: string;
  modified_at?: string | null;
}

export interface LlamaCppSettings {
  executable_path: string;
  cli_executable_path?: string;
  host: string;
  port: number;
  threads: number;
  gpu_layers: number;
  context_size: number;
  batch_size: number;
  ubatch_size: number;
  use_mmap: boolean;
  flash_attn: boolean;
  cache_type_k?: string;
  cache_type_v?: string;
}

export interface OllamaSettings {
  host: string;
  port: number;
  base_url: string;
  executable_path: string;
}

export interface SecuritySettings {
  api_key?: string | null;
  api_key_configured?: boolean;
  allow_remote_access: boolean;
  require_auth_for_local: boolean;
  listen_host: string;
  listen_port: number;
  allowed_origins: string[];
}

export interface EngineConfig {
  active_runtime: string;
  active_model_id: string;
  llama_cpp: LlamaCppSettings;
  ollama: OllamaSettings;
  security: SecuritySettings;
  model_directories: string[];
  monitoring_poll_interval_sec: number;
  deployment?: DeploymentInfo;
}

export interface RuntimeStatusResponse {
  active_runtime: string;
  supported_runtimes: string[];
  all_runtimes: Array<{
    runtime_id: string;
    display_name: string;
    available: boolean;
    supported_formats: string[];
    message: string;
  }>;
  adapters: Record<string, {
    runtime_id: string;
    display_name: string;
    available: boolean;
    supported_formats: string[];
    message: string;
  }>;
  llama_cpp: {
    detected: boolean;
    executable_path: string;
    status: {
      running: boolean;
      healthy: boolean;
      pid?: number;
      port?: number;
      uptime_seconds?: number;
      memory_rss_formatted?: string;
    };
  };
  ollama: {
    detected: boolean;
    version: string;
    base_url: string;
    running_models: Array<{ name: string; size: number }>;
  };
}

export interface InferenceTelemetry {
  state: 'idle' | 'generating' | 'error';
  model?: string;
  runtime?: string;
  tokens_per_second?: number;
  prompt_eval_tokens_per_second?: number;
  time_to_first_token_sec?: number;
  last_duration_sec?: number;
  tokens_generated?: number;
}

export interface LiveMetrics {
  cpu: CPUInfo;
  ram: RAMInfo;
  gpu: GPUInfo;
  storage: DriveInfo[];
  inference: InferenceTelemetry;
  history?: {
    cpu: Array<{ t: number; v: number }>;
    ram: Array<{ t: number; v: number }>;
    throughput: Array<{ t: number; v: number }>;
  };
}

export interface BenchmarkRecord {
  id: string;
  timestamp: string;
  model_name: string;
  runtime: string;
  context_length: number;
  threads: number;
  gpu_layers: number;
  tokens_per_second: number;
  prompt_eval_tokens_per_second?: number;
  time_to_first_token_sec?: number;
  total_duration_sec: number;
  tokens_generated: number;
  memory_rss_bytes?: number;
  memory_rss_formatted?: string;
  notes?: string;
}

export interface DiagnosticItem {
  id: string;
  name: string;
  status: 'passed' | 'warning' | 'failed';
  message: string;
  remediation?: string;
}

export interface DiagnosticsSuite {
  timestamp: string;
  overall_status: 'healthy' | 'warning' | 'degraded';
  checks: DiagnosticItem[];
}

export interface AdvisorRecommendationItem {
  id: string;
  model_id?: string;
  name: string;
  publisher: string;
  architecture: string;
  parameter_size: string;
  parameter_count_b?: number | null;
  format: string;
  quantization: string;
  size_bytes: number;
  size_formatted: string;
  fit_score: number | null;
  tier: string;
  recommendation_tier?: string;
  safety_level: 'SAFE' | 'MARGINAL' | 'RISKY';
  recommended_runtime: string;
  ram_required_gb: number | null;
  ram_required_formatted?: string;
  vram_allocated_gb?: number | null;
  estimated_tok_per_sec: number | null;
  estimated_performance?: string;
  context_length: number;
  license: string;
  download_url?: string;
  reasoning: string;
  tier_reason?: string;
  raw?: any;
}

export interface AdvisorHardwareSummary {
  status?: string;
  os?: string;
  cpu?: {
    model?: string;
    physical_cores?: number;
    logical_threads?: number;
    architecture?: string;
  };
  ram?: {
    total_bytes?: number;
    total_formatted?: string;
    available_bytes?: number;
    available_formatted?: string;
    used_percent?: number;
  };
  gpu?: {
    detected?: boolean;
    name?: string;
    vendor?: string;
    dedicated_vram_bytes?: number;
    dedicated_vram_formatted?: string;
    shared_vram_formatted?: string;
  };
  active_runtime?: string;
  max_safe_model_formatted?: string;
  deployment?: DeploymentInfo;
}

export interface SetupProgress {
  task_id: string;
  model_id: string;
  status: 'pending' | 'downloading' | 'configuring' | 'verifying' | 'completed' | 'failed' | 'cancelled';
  progress_percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  current_step: string;
  error?: string;
}
