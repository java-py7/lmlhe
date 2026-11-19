import {
  HardwareProfile,
  EngineConfig,
  RuntimeStatusResponse,
  LiveMetrics,
  DiagnosticsSuite,
  ModelEntry,
  AdvisorHardwareSummary,
  AdvisorRecommendationItem,
  SetupProgress,
  BenchmarkRecord,
  LocalAgentStatusResponse,
  AgentInstallersResponse,
} from './types';

let activeLocalAgentUrl: string = localStorage.getItem('engine_local_agent_url') || 'http://127.0.0.1:8008';

export function getActiveLocalAgentUrl(): string {
  return activeLocalAgentUrl;
}

export function setActiveLocalAgentUrl(url: string) {
  activeLocalAgentUrl = url.replace(/\/+$/, '');
  localStorage.setItem('engine_local_agent_url', activeLocalAgentUrl);
}

export async function probeLocalAgent(preferredUrl?: string): Promise<{
  connected: boolean;
  url: string;
  data?: LocalAgentStatusResponse;
  error?: string;
}> {
  const custom = preferredUrl || localStorage.getItem('engine_local_agent_url');
  const candidates = custom
    ? [custom, 'http://127.0.0.1:8008', 'http://127.0.0.1:8000', 'http://localhost:8008', 'http://localhost:8000']
    : ['http://127.0.0.1:8008', 'http://127.0.0.1:8000', 'http://localhost:8008', 'http://localhost:8000'];

  const uniqueCandidates = Array.from(new Set(candidates.map((c) => c.replace(/\/+$/, ''))));

  for (const url of uniqueCandidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${url}/api/v1/agent/status`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          setActiveLocalAgentUrl(url);
          return { connected: true, url, data };
        }
      }
    } catch {
      // try next candidate
    }
  }

  return {
    connected: false,
    url: activeLocalAgentUrl,
    error: 'Local hardware agent not reachable on 127.0.0.1 (ports 8008/8000)',
  };
}

export async function localAgentRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${activeLocalAgentUrl}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      let errMessage = `HTTP ${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        if (data.detail) errMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      } catch {}
      throw new Error(errMessage);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export const localAgentApi = {
  probe: probeLocalAgent,
  getUrl: getActiveLocalAgentUrl,
  setUrl: setActiveLocalAgentUrl,
  getStatus: () => localAgentRequest<LocalAgentStatusResponse>('/api/v1/agent/status'),
  getHardware: () => localAgentRequest<HardwareProfile>('/api/v1/hardware'),
  getModels: () => localAgentRequest<{ status: string; models: ModelEntry[]; active_model_id?: string }>('/api/v1/models'),
  getRuntimes: () => localAgentRequest<RuntimeStatusResponse>('/api/v1/runtimes'),
  getMetrics: () => localAgentRequest<LiveMetrics>('/api/v1/metrics'),
  selectModel: (modelId: string) =>
    localAgentRequest<{ status: string; active_model_id: string; active_runtime?: string }>('/api/v1/models/select', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId }),
    }),
};

function getApiBase(): string {
  const custom = localStorage.getItem('engine_api_base');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '';
}

export function getApiKey(): string {
  return sessionStorage.getItem('engine_api_key') || localStorage.getItem('engine_api_key') || '';
}

export function setApiKey(key: string, persist: boolean = true) {
  if (persist) {
    localStorage.setItem('engine_api_key', key);
  } else {
    sessionStorage.setItem('engine_api_key', key);
  }
}

export function clearApiKey() {
  localStorage.removeItem('engine_api_key');
  sessionStorage.removeItem('engine_api_key');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase();
  const url = `${base}${endpoint}`;
  const key = getApiKey();

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (key && !headers.has('X-API-Key') && !headers.has('Authorization')) {
    headers.set('X-API-Key', key);
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errMessage = `HTTP ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) {
        errMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // Keep default error message
    }
    throw new Error(errMessage);
  }

  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export const api = {
  localAgent: localAgentApi,
  probeLocalAgent,
  // Health
  getHealth: () => request<any>('/api/v1/health'),

  // Hardware
  getHardware: () => request<HardwareProfile>('/api/v1/hardware'),

  // Configuration
  getConfig: () => request<EngineConfig>('/api/v1/config'),
  updateConfig: (cfg: Partial<EngineConfig>) =>
    request<{ status: string; config: EngineConfig }>('/api/v1/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  saveConfig: (cfg: Partial<EngineConfig>) =>
    request<{ status: string; config: EngineConfig }>('/api/v1/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  getApiKey: () => getApiKey(),
  setApiKey: (key: string, persist: boolean = true) => setApiKey(key, persist),
  clearApiKey: () => clearApiKey(),
  recommendConfig: (modelId?: string, contextLength?: number) =>
    request<any>('/api/v1/config/recommend', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId, context_length: contextLength }),
    }),
  validateConfig: (req: any) =>
    request<any>('/api/v1/config/validate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // Runtimes
  getRuntimes: () => request<RuntimeStatusResponse>('/api/v1/runtimes'),
  getRuntimeStatus: () => request<any>('/api/v1/runtimes/status'),
  switchRuntime: (runtime: string) =>
    request<{ status: string; active_runtime: string }>('/api/v1/runtimes/switch', {
      method: 'POST',
      body: JSON.stringify({ runtime }),
    }),
  startRuntime: (params?: any) =>
    request<any>('/api/v1/runtimes/start', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),
  stopRuntime: () =>
    request<any>('/api/v1/runtimes/stop', {
      method: 'POST',
    }),
  startLlamaServer: (params: any) =>
    request<any>('/api/v1/runtimes/llama/start', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  stopLlamaServer: () =>
    request<any>('/api/v1/runtimes/llama/stop', {
      method: 'POST',
    }),

  // Models
  getModels: () =>
    request<{
      active_model_id: string;
      models: ModelEntry[];
      model_directories: string[];
      total_count: number;
      available_count: number;
    }>('/api/v1/models'),
  scanModels: () =>
    request<{ count: number; available_count: number; models: ModelEntry[] }>('/api/v1/models/scan', {
      method: 'POST',
    }),
  refreshModels: () =>
    request<{ count: number; available_count: number; models: ModelEntry[] }>('/api/v1/models/refresh', {
      method: 'POST',
    }),
  selectModel: (modelId: string) =>
    request<{ status: string; active_model_id: string; active_runtime: string; model: ModelEntry }>(
      '/api/v1/models/select',
      {
        method: 'POST',
        body: JSON.stringify({ model_id: modelId }),
      }
    ),
  addModel: (path: string, name?: string) =>
    request<{ status: string; model: ModelEntry }>('/api/v1/models/add', {
      method: 'POST',
      body: JSON.stringify({ path, name }),
    }),
  deleteModel: (modelId: string) =>
    request<{ status: string; id: string }>(`/api/v1/models/${encodeURIComponent(modelId)}`, {
      method: 'DELETE',
    }),
  getModelDirectories: () =>
    request<{ status: string; directories: string[] }>('/api/v1/models/directories'),
  addModelDirectory: (directoryPath: string) =>
    request<any>('/api/v1/models/directories', {
      method: 'POST',
      body: JSON.stringify({ directory_path: directoryPath }),
    }),
  addDirectory: (directoryPath: string) =>
    request<any>('/api/v1/models/directories', {
      method: 'POST',
      body: JSON.stringify({ directory_path: directoryPath }),
    }),
  removeModelDirectory: (directoryPath: string) =>
    request<any>('/api/v1/models/directories', {
      method: 'DELETE',
      body: JSON.stringify({ directory_path: directoryPath }),
    }),
  removeDirectory: (directoryPath: string) =>
    request<any>('/api/v1/models/directories', {
      method: 'DELETE',
      body: JSON.stringify({ directory_path: directoryPath }),
    }),

  // Telemetry & Metrics
  getMetrics: () => request<LiveMetrics>('/api/v1/metrics'),

  // Diagnostics
  getDiagnostics: () => request<DiagnosticsSuite>('/api/v1/diagnostics'),
  getLogs: (source: 'llama' | 'app', lines: number = 100) =>
    request<{ logs: string }>(`/api/v1/logs/${source}?lines=${lines}`),

  // Benchmarks
  getBenchmarks: () =>
    request<{ historical: any; custom: BenchmarkRecord[] }>('/api/v1/benchmarks'),
  runBenchmark: (req: any) =>
    request<any>('/api/v1/benchmarks', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  deleteBenchmark: (id: string) =>
    request<any>(`/api/v1/benchmarks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Evaluations
  getEvaluations: () => request<{ evaluations: any[] }>('/api/v1/evaluations'),
  runEvaluation: (req: any) =>
    request<any>('/api/v1/evaluations/run', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  rateEvaluation: (evalId: string, rating: number, feedback?: string) =>
    request<any>(`/api/v1/evaluations/${encodeURIComponent(evalId)}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    }),

  // Advisor
  getAdvisorHardwareSummary: () =>
    request<AdvisorHardwareSummary>('/api/v1/advisor/hardware-summary'),
  getAdvisorRecommendations: (params: {
    workload?: string;
    preference?: string;
    catalog_source?: string;
    search_query?: string;
    force_refresh?: boolean;
  }) =>
    request<{ count: number; recommendations: AdvisorRecommendationItem[] }>(
      '/api/v1/advisor/recommendations',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    ),
  startAdvisorSetup: (req: any) =>
    request<{ task_id: string; message: string }>('/api/v1/advisor/setup', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  getAdvisorSetupProgress: (taskId: string) =>
    request<SetupProgress>(`/api/v1/advisor/setup/${encodeURIComponent(taskId)}/progress`),
  cancelAdvisorSetup: (taskId: string) =>
    request<any>(`/api/v1/advisor/setup/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    }),
  getRuntimeInstallGuide: (runtimeId: string) =>
    request<{ status: string; guide: any }>(
      `/api/v1/advisor/runtimes/install-guide/${encodeURIComponent(runtimeId)}`
    ),

  // Agent Distribution & Installers
  getAgentInstallers: () => request<AgentInstallersResponse>('/api/v1/agent/installers'),

  // Inference (Non-streaming)
  generateInference: (prompt: string, model?: string, temperature: number = 0.7, maxTokens: number = 512) =>
    request<any>('/api/v1/inference/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, model, temperature, max_tokens: maxTokens, stream: false }),
    }),

  // Inference (Streaming SSE)
  streamChatCompletions: async (
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      onToken: (token: string) => void;
      onComplete?: () => void;
      onError?: (err: Error) => void;
      signal?: AbortSignal;
    }
  ) => {
    const base = getApiBase();
    const url = `${base}/api/v1/chat/completions`;
    const key = getApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (key) {
      headers['X-API-Key'] = key;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages,
          model: options.model,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 512,
          stream: true,
        }),
        signal: options.signal,
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const d = await res.json();
          if (d.detail) errMsg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Readable stream not supported');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') {
            options.onComplete?.();
            return;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                options.onToken(delta);
              }
            } catch {
              // Non-JSON SSE chunk
            }
          }
        }
      }
      options.onComplete?.();
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      options.onError ? options.onError(err) : console.error('Streaming chat error:', err);
    }
  },
};
