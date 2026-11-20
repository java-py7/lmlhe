import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
import {
  HardwareProfile,
  ModelEntry,
  RuntimeStatusResponse,
  EngineConfig,
  LiveMetrics,
  DeploymentInfo,
  ClientDetectedHardware,
  ClientDetectedRuntimes,
} from './types';
import {
  detectBrowserHardware,
  detectWebGPUAsync,
  detectBrowserStorageAsync,
  detectLocalOllamaDirect,
  detectLocalLlamaCppDirect,
  probeLocalBackendAsync,
  runCpuBenchmark,
  buildClientHardwareProfile,
  buildClientRuntimeStatus,
} from './browserDetection';
import { useToast } from './toast';

interface EngineContextType {
  hardware: HardwareProfile | null;
  models: ModelEntry[];
  activeModelId: string;
  activeModel: ModelEntry | undefined;
  runtimes: RuntimeStatusResponse | null;
  activeRuntime: string;
  config: EngineConfig | null;
  metrics: LiveMetrics | null;
  isLoading: boolean;
  isDetecting: boolean;

  // Direct Environment & Browser Detection
  isOriginLocal: boolean;
  isHosted: boolean;
  isExactLocalEngine: boolean;
  clientHardware: ClientDetectedHardware | null;
  clientRuntimes: ClientDetectedRuntimes | null;

  // CPU Benchmark & Speed Test
  cpuScore: number | null;
  isBenchmarking: boolean;
  runSpeedTest: () => Promise<number>;

  // Actions
  refreshHardware: () => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshRuntimes: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshClientDetection: () => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
  switchRuntime: (runtime: string) => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const { showSuccess, showError } = useToast();

  const isOriginLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0');

  // Server state (from origin backend)
  const [serverHardware, setServerHardware] = useState<HardwareProfile | null>(null);
  const [serverConfig, setServerConfig] = useState<EngineConfig | null>(null);
  const [, setServerDeployment] = useState<DeploymentInfo | null>(null);
  const [serverModels, setServerModels] = useState<ModelEntry[]>([]);
  const [serverRuntimes, setServerRuntimes] = useState<RuntimeStatusResponse | null>(null);
  const [serverMetrics, setServerMetrics] = useState<LiveMetrics | null>(null);

  // Direct browser & local service detection state
  const [clientHardware, setClientHardware] = useState<ClientDetectedHardware | null>(null);
  const [clientRuntimes, setClientRuntimes] = useState<ClientDetectedRuntimes | null>(null);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [isExactLocalEngine, setIsExactLocalEngine] = useState<boolean>(false);

  // CPU Speed benchmark state
  const [cpuScore, setCpuScore] = useState<number | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);

  // Effective active data state presented to UI
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [preferredRuntime, setPreferredRuntime] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isOriginLocalRef = useRef(isOriginLocal);
  isOriginLocalRef.current = isOriginLocal;

  /**
   * Run client CPU speed test loop
   */
  const runSpeedTest = useCallback(async (): Promise<number> => {
    setIsBenchmarking(true);
    // Yield to let UI show spinner
    await new Promise((r) => setTimeout(r, 20));
    try {
      const score = runCpuBenchmark(350);
      setCpuScore(score);
      return score;
    } finally {
      setIsBenchmarking(false);
    }
  }, []);

  /**
   * Direct Browser & Local PC Detection
   * Probes browser APIs (WebGL, WebGPU, deviceMemory, threads, storage)
   * and local ports (Ollama at localhost:11434, llama.cpp at localhost:8080)
   */
  const runDirectDetection = useCallback(async () => {
    setIsDetecting(true);
    try {
      // 1. Synchronous browser hardware specs
      const initialHw = detectBrowserHardware();

      // 2. Check if local engine backend is running on localhost:8000
      let exactBackendHw: HardwareProfile | null = null;
      if (!isOriginLocalRef.current) {
        try {
          exactBackendHw = await probeLocalBackendAsync();
          if (exactBackendHw) {
            setServerHardware(exactBackendHw);
            setIsExactLocalEngine(true);
          } else {
            setIsExactLocalEngine(false);
          }
        } catch {
          setIsExactLocalEngine(false);
        }
      }

      // 3. Async WebGPU, Storage, and Local AI runtimes in parallel
      const [webGpuRes, storageRes, ollamaRes, llamaRes] = await Promise.allSettled([
        detectWebGPUAsync(),
        detectBrowserStorageAsync(),
        detectLocalOllamaDirect(),
        detectLocalLlamaCppDirect(),
      ]);

      const updatedHw: ClientDetectedHardware = { ...initialHw };

      if (webGpuRes.status === 'fulfilled') {
        updatedHw.webgpu = webGpuRes.value;
        if (webGpuRes.value.supported && webGpuRes.value.adapter_name) {
          if (!updatedHw.gpu.detected || updatedHw.gpu.name.includes('Unavailable')) {
            updatedHw.gpu.name = webGpuRes.value.adapter_name;
            updatedHw.gpu.detected = true;
          }
        }
      }

      if (storageRes.status === 'fulfilled') {
        updatedHw.storage = {
          quota_gb: storageRes.value.quota_gb,
          used_mb: storageRes.value.used_mb,
          quota_formatted: storageRes.value.quota_formatted,
          label: 'Origin Browser Storage Quota',
        };
      }

      setClientHardware(updatedHw);

      const runtimesData: ClientDetectedRuntimes = {
        ollama:
          ollamaRes.status === 'fulfilled'
            ? ollamaRes.value
            : {
                detected: false,
                status: 'offline',
                cors_blocked: false,
                url: 'http://127.0.0.1:11434',
                models: [],
                running_models: [],
                message: 'Ollama not detected',
              },
        llama_cpp:
          llamaRes.status === 'fulfilled'
            ? llamaRes.value
            : {
                detected: false,
                url: 'http://127.0.0.1:8080',
                message: 'llama.cpp probe disabled',
                disabled: true,
              },
        webgpu: {
          supported: webGpuRes.status === 'fulfilled' ? webGpuRes.value.supported : false,
          device_name: webGpuRes.status === 'fulfilled' ? webGpuRes.value.adapter_name : undefined,
        },
      };

      setClientRuntimes(runtimesData);

      // Auto-select first available local model if none active
      if (runtimesData.ollama.detected && runtimesData.ollama.models.length > 0) {
        setActiveModelId((current) => {
          if (!current) {
            return runtimesData.ollama.models[0].id;
          }
          return current;
        });
      }
    } catch (err: any) {
      console.warn('Direct browser detection note:', err?.message || err);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  // Fetch Server Configuration
  const refreshServerData = useCallback(async () => {
    try {
      const cfgData = await api.getConfig();
      setServerConfig(cfgData);
      if (cfgData.deployment) {
        setServerDeployment(cfgData.deployment);
      }
      if (cfgData.active_model_id && !activeModelId) {
        setActiveModelId(cfgData.active_model_id);
      }
      if (cfgData.active_runtime) {
        setPreferredRuntime(cfgData.active_runtime);
      }

      if (isOriginLocalRef.current) {
        try {
          const hw = await api.getHardware();
          setServerHardware(hw);
        } catch {
          // ignore local hardware fetch error
        }
      }
    } catch (err: any) {
      console.warn('Server data note:', err.message);
    }
  }, [activeModelId]);

  // Refresh methods
  const refreshHardware = useCallback(async () => {
    if (isOriginLocalRef.current) {
      try {
        const data = await api.getHardware();
        setServerHardware(data);
      } catch (err: any) {
        console.warn('Local hardware fetch note:', err.message);
      }
    }
    await runDirectDetection();
  }, [runDirectDetection]);

  const refreshModels = useCallback(async () => {
    if (isOriginLocalRef.current) {
      try {
        const data = await api.getModels();
        setServerModels(data.models || []);
        if (data.active_model_id) {
          setActiveModelId(data.active_model_id);
        }
      } catch (err: any) {
        console.warn('Models fetch note:', err.message);
      }
    }
    try {
      const ollamaData = await detectLocalOllamaDirect();
      setClientRuntimes((prev) => {
        if (!prev) return null;
        return { ...prev, ollama: ollamaData };
      });
    } catch {}
  }, []);

  const refreshRuntimes = useCallback(async () => {
    if (isOriginLocalRef.current) {
      try {
        const data = await api.getRuntimes();
        setServerRuntimes(data);
      } catch (err: any) {
        console.warn('Runtimes fetch note:', err.message);
      }
    }
    const [ollamaRes, llamaRes] = await Promise.allSettled([
      detectLocalOllamaDirect(),
      detectLocalLlamaCppDirect(true),
    ]);
    setClientRuntimes((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        ollama: ollamaRes.status === 'fulfilled' ? ollamaRes.value : prev.ollama,
        llama_cpp: llamaRes.status === 'fulfilled' ? llamaRes.value : prev.llama_cpp,
      };
    });
  }, []);

  const refreshConfig = useCallback(async () => {
    await refreshServerData();
  }, [refreshServerData]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await refreshServerData();
    await Promise.allSettled([
      runDirectDetection(),
      refreshModels(),
      refreshRuntimes(),
    ]);
    setIsLoading(false);
  }, [refreshServerData, runDirectDetection, refreshModels, refreshRuntimes]);

  const isHosted = !isOriginLocal;

  // Effective Active Hardware:
  // When hosted, NEVER show Render / cloud server specs!
  // If local engine responded on localhost:8000, present exact local engine values.
  // Otherwise, present browser-estimated client hardware (~).
  const effectiveHardware: HardwareProfile | null = isOriginLocal
    ? serverHardware || (clientHardware ? buildClientHardwareProfile(clientHardware) : null)
    : isExactLocalEngine && serverHardware
    ? serverHardware
    : clientHardware
    ? buildClientHardwareProfile(clientHardware)
    : null;

  // Effective Active Models:
  const directOllamaModels = clientRuntimes?.ollama?.models || [];
  const effectiveModels: ModelEntry[] = isOriginLocal
    ? (() => {
        const map = new Map<string, ModelEntry>();
        for (const m of serverModels) {
          map.set(m.id, m);
        }
        for (const m of directOllamaModels) {
          if (!map.has(m.id)) {
            map.set(m.id, m);
          }
        }
        return Array.from(map.values());
      })()
    : directOllamaModels;

  const effectiveRuntimes: RuntimeStatusResponse | null = isOriginLocal
    ? serverRuntimes || (clientRuntimes ? buildClientRuntimeStatus(clientRuntimes, preferredRuntime || 'ollama') : null)
    : clientRuntimes
    ? buildClientRuntimeStatus(clientRuntimes, preferredRuntime || 'ollama')
    : null;

  const activeModel = effectiveModels.find((m) => m.id === activeModelId);

  // Robust runtime resolution:
  const activeRuntime =
    activeModel &&
    (activeModel.format === 'Ollama' ||
      activeModel.source === 'ollama_api' ||
      activeModel.id.startsWith('ollama_') ||
      (activeModel.runtime_compatibility &&
        activeModel.runtime_compatibility.includes('ollama') &&
        !activeModel.runtime_compatibility.includes('llama.cpp server')))
      ? 'ollama'
      : activeModel && activeModel.format === 'GGUF'
      ? 'llama.cpp server'
      : preferredRuntime || effectiveRuntimes?.active_runtime || serverConfig?.active_runtime || 'ollama';

  const selectModel = async (modelId: string) => {
    try {
      const targetModel = effectiveModels.find((m) => m.id === modelId);
      const isTargetOllama =
        targetModel &&
        (targetModel.format === 'Ollama' ||
          targetModel.source === 'ollama_api' ||
          targetModel.id.startsWith('ollama_'));

      if (isOriginLocal) {
        const res = await api.selectModel(modelId);
        setActiveModelId(res.active_model_id);
        setPreferredRuntime(res.active_runtime || (isTargetOllama ? 'ollama' : 'llama.cpp server'));
        showSuccess(`Selected model: ${res.model?.name || modelId} (${res.active_runtime})`);
        await Promise.allSettled([refreshModels(), refreshRuntimes()]);
      } else {
        setActiveModelId(modelId);
        const resolvedRuntime = isTargetOllama ? 'ollama' : 'llama.cpp server';
        setPreferredRuntime(resolvedRuntime);
        showSuccess(`Selected model: ${targetModel?.name || modelId} (${resolvedRuntime})`);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to select model');
      throw err;
    }
  };

  const switchRuntime = async (runtime: string) => {
    try {
      setPreferredRuntime(runtime);
      if (isOriginLocal) {
        const res = await api.switchRuntime(runtime);
        showSuccess(`Active runtime switched to: ${res.active_runtime}`);
        await refreshRuntimes();
      } else {
        showSuccess(`Active runtime switched to: ${runtime}`);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to switch runtime');
      throw err;
    }
  };

  // Initial load - runs only once on mount
  useEffect(() => {
    refreshAll().then(() => {
      // Run CPU speed benchmark once automatically after detection
      runSpeedTest();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live telemetry polling for local server
  useEffect(() => {
    if (!isOriginLocal && !isExactLocalEngine) return;

    let mounted = true;
    const poll = async () => {
      try {
        const m = await api.getMetrics();
        if (mounted) {
          setServerMetrics(m);
        }
      } catch {
        // silent polling catch
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOriginLocal, isExactLocalEngine]);

  return (
    <EngineContext.Provider
      value={{
        hardware: effectiveHardware,
        models: effectiveModels,
        activeModelId,
        activeModel,
        runtimes: effectiveRuntimes,
        activeRuntime,
        config: serverConfig,
        metrics: serverMetrics,
        isLoading,
        isDetecting,

        isOriginLocal,
        isHosted,
        isExactLocalEngine,
        clientHardware,
        clientRuntimes,

        cpuScore,
        isBenchmarking,
        runSpeedTest,

        refreshHardware,
        refreshModels,
        refreshRuntimes,
        refreshConfig,
        refreshAll,
        refreshClientDetection: runDirectDetection,
        selectModel,
        switchRuntime,
      }}
    >
      {children}
    </EngineContext.Provider>
  );
}

export function useEngine() {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return context;
}
