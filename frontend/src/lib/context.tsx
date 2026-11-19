import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api, localAgentApi } from './api';
import {
  HardwareProfile,
  ModelEntry,
  RuntimeStatusResponse,
  EngineConfig,
  LiveMetrics,
  DeploymentInfo,
  LocalAgentState,
} from './types';
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

  // Environment & Local Agent status
  isOriginLocal: boolean;
  isHosted: boolean;
  localAgent: LocalAgentState;
  serverHardware: HardwareProfile | null;
  serverDeployment: DeploymentInfo | null;

  // Actions
  refreshHardware: () => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshRuntimes: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshAll: () => Promise<void>;
  checkLocalAgent: (customUrl?: string) => Promise<boolean>;
  setLocalAgentUrl: (url: string) => void;
  selectModel: (modelId: string) => Promise<void>;
  switchRuntime: (runtime: string) => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const { showSuccess, showError, showInfo } = useToast();

  const isOriginLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0');

  // Server state (from origin backend)
  const [serverHardware, setServerHardware] = useState<HardwareProfile | null>(null);
  const [serverConfig, setServerConfig] = useState<EngineConfig | null>(null);
  const [serverDeployment, setServerDeployment] = useState<DeploymentInfo | null>(null);

  // Local Agent state (bridges physical PC when frontend is cloud-hosted)
  const [localAgent, setLocalAgent] = useState<LocalAgentState>({
    status: isOriginLocal ? 'connected' : 'checking',
    url: localAgentApi.getUrl(),
    data: null,
    hardware: null,
    models: [],
    runtimes: null,
    metrics: null,
  });

  // Effective active data state presented to UI
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Reference to avoid stale probe closures
  const isOriginLocalRef = useRef(isOriginLocal);
  isOriginLocalRef.current = isOriginLocal;

  // Probes local agent on user's computer
  const checkLocalAgent = useCallback(async (customUrl?: string): Promise<boolean> => {
    if (customUrl) {
      localAgentApi.setUrl(customUrl);
    }

    setLocalAgent((prev) => ({ ...prev, status: 'checking', url: customUrl || prev.url }));

    try {
      const probe = await api.probeLocalAgent(customUrl);
      if (probe.connected && probe.data) {
        // Fetch full physical hardware and models from local agent
        let agentHw: HardwareProfile | null = null;
        let agentModels: ModelEntry[] = [];
        let agentRuntimes: RuntimeStatusResponse | null = null;

        try {
          const [hwData, modelsData, runtimesData] = await Promise.allSettled([
            localAgentApi.getHardware(),
            localAgentApi.getModels(),
            localAgentApi.getRuntimes(),
          ]);

          if (hwData.status === 'fulfilled') agentHw = hwData.value;
          if (modelsData.status === 'fulfilled') {
            agentModels = modelsData.value.models || [];
            if (modelsData.value.active_model_id) {
              setActiveModelId(modelsData.value.active_model_id);
            }
          }
          if (runtimesData.status === 'fulfilled') agentRuntimes = runtimesData.value;
        } catch (e: any) {
          console.warn('Local agent details fetch error:', e.message);
        }

        setLocalAgent({
          status: 'connected',
          url: probe.url,
          data: probe.data,
          hardware: agentHw,
          models: agentModels,
          runtimes: agentRuntimes,
          metrics: null,
        });

        return true;
      } else {
        setLocalAgent((prev) => ({
          ...prev,
          status: 'disconnected',
          error: probe.error || 'Local hardware agent not detected on localhost',
          data: null,
          hardware: null,
          models: [],
          runtimes: null,
        }));
        return false;
      }
    } catch (err: any) {
      setLocalAgent((prev) => ({
        ...prev,
        status: 'disconnected',
        error: err.message || 'Connection failed',
        data: null,
        hardware: null,
        models: [],
        runtimes: null,
      }));
      return false;
    }
  }, []);

  const setLocalAgentUrl = useCallback((url: string) => {
    localAgentApi.setUrl(url);
    setLocalAgent((prev) => ({ ...prev, url }));
  }, []);

  // Fetch Server Data (always loaded to inspect environment and server configuration)
  const refreshServerData = useCallback(async () => {
    try {
      const [cfgData, hwData] = await Promise.allSettled([
        api.getConfig(),
        api.getHardware(),
      ]);

      if (cfgData.status === 'fulfilled') {
        setServerConfig(cfgData.value);
        if (cfgData.value.deployment) {
          setServerDeployment(cfgData.value.deployment);
        }
        if (cfgData.value.active_model_id && !activeModelId) {
          setActiveModelId(cfgData.value.active_model_id);
        }
      }

      if (hwData.status === 'fulfilled') {
        setServerHardware(hwData.value);
        if (hwData.value.deployment) {
          setServerDeployment(hwData.value.deployment);
        }
      }
    } catch (err: any) {
      console.warn('Server data note:', err.message);
    }
  }, [activeModelId]);

  // Refresh methods
  const refreshHardware = useCallback(async () => {
    if (isOriginLocal) {
      try {
        const data = await api.getHardware();
        setServerHardware(data);
      } catch (err: any) {
        console.warn('Local hardware fetch note:', err.message);
      }
    } else {
      // In cloud mode: refresh local agent hardware if connected
      if (localAgent.status === 'connected') {
        try {
          const hw = await localAgentApi.getHardware();
          setLocalAgent((prev) => ({ ...prev, hardware: hw }));
        } catch {
          // Probe again if disconnected
          await checkLocalAgent();
        }
      }
    }
  }, [isOriginLocal, localAgent.status, checkLocalAgent]);

  const refreshModels = useCallback(async () => {
    if (isOriginLocal) {
      try {
        const data = await api.getModels();
        setLocalAgent((prev) => ({ ...prev, models: data.models || [] }));
        if (data.active_model_id) {
          setActiveModelId(data.active_model_id);
        }
      } catch (err: any) {
        console.warn('Models fetch note:', err.message);
      }
    } else {
      if (localAgent.status === 'connected') {
        try {
          const data = await localAgentApi.getModels();
          setLocalAgent((prev) => ({ ...prev, models: data.models || [] }));
          if (data.active_model_id) {
            setActiveModelId(data.active_model_id);
          }
        } catch {
          await checkLocalAgent();
        }
      }
    }
  }, [isOriginLocal, localAgent.status, checkLocalAgent]);

  const refreshRuntimes = useCallback(async () => {
    if (isOriginLocal) {
      try {
        const data = await api.getRuntimes();
        setLocalAgent((prev) => ({ ...prev, runtimes: data }));
      } catch (err: any) {
        console.warn('Runtimes fetch note:', err.message);
      }
    } else {
      if (localAgent.status === 'connected') {
        try {
          const data = await localAgentApi.getRuntimes();
          setLocalAgent((prev) => ({ ...prev, runtimes: data }));
        } catch {
          await checkLocalAgent();
        }
      }
    }
  }, [isOriginLocal, localAgent.status, checkLocalAgent]);

  const refreshConfig = useCallback(async () => {
    await refreshServerData();
  }, [refreshServerData]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await refreshServerData();
    if (isOriginLocal) {
      await Promise.allSettled([refreshHardware(), refreshRuntimes(), refreshModels()]);
    } else {
      await checkLocalAgent();
    }
    setIsLoading(false);
  }, [isOriginLocal, refreshServerData, refreshHardware, refreshRuntimes, refreshModels, checkLocalAgent]);

  // Determine whether running in a hosted environment (Render, etc.)
  const isHosted = Boolean(
    !isOriginLocal &&
      (serverDeployment?.is_hosted ||
        serverHardware?.deployment?.is_hosted ||
        (typeof window !== 'undefined' && window.location.hostname.includes('render.com')))
  );

  // Active Effective Hardware presented to user:
  // RULE 1: Never substitute cloud hardware for user's local hardware!
  const effectiveHardware: HardwareProfile | null = isOriginLocal
    ? serverHardware
    : localAgent.status === 'connected'
    ? localAgent.hardware
    : null; // Null when disconnected in cloud mode!

  // Active Effective Models:
  const effectiveModels: ModelEntry[] = isOriginLocal
    ? localAgent.models.length > 0
      ? localAgent.models
      : []
    : localAgent.status === 'connected'
    ? localAgent.models
    : [];

  const effectiveRuntimes: RuntimeStatusResponse | null = isOriginLocal
    ? localAgent.runtimes
    : localAgent.status === 'connected'
    ? localAgent.runtimes
    : null;

  const activeModel = effectiveModels.find((m) => m.id === activeModelId);

  // Derived effective runtime: Ollama models use Ollama runtime strictly
  const activeRuntime =
    activeModel &&
    (activeModel.format === 'Ollama' ||
      activeModel.source === 'ollama_api' ||
      (activeModel.runtime_compatibility &&
        activeModel.runtime_compatibility.includes('ollama') &&
        !activeModel.runtime_compatibility.includes('llama.cpp server')))
      ? 'ollama'
      : effectiveRuntimes?.active_runtime || serverConfig?.active_runtime || 'llama.cpp server';

  const selectModel = async (modelId: string) => {
    try {
      if (!isOriginLocal && localAgent.status === 'connected') {
        const res = await localAgentApi.selectModel(modelId);
        setActiveModelId(res.active_model_id);
        showSuccess(`Selected model: ${modelId} (${res.active_runtime})`);
        await refreshModels();
      } else {
        const res = await api.selectModel(modelId);
        setActiveModelId(res.active_model_id);
        showSuccess(`Selected model: ${res.model?.name || modelId} (${res.active_runtime})`);
        await Promise.allSettled([refreshModels(), refreshRuntimes()]);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to select model');
      throw err;
    }
  };

  const switchRuntime = async (runtime: string) => {
    try {
      const res = await api.switchRuntime(runtime);
      showSuccess(`Active runtime switched to: ${res.active_runtime}`);
      await refreshRuntimes();
    } catch (err: any) {
      showError(err.message || 'Failed to switch runtime');
      throw err;
    }
  };

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Live telemetry polling (polls local agent when connected, or local server when origin is localhost)
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        if (!isOriginLocal && localAgent.status === 'connected') {
          const m = await localAgentApi.getMetrics();
          if (mounted) {
            setLocalAgent((prev) => ({ ...prev, metrics: m }));
          }
        } else if (isOriginLocal) {
          const m = await api.getMetrics();
          if (mounted) {
            setLocalAgent((prev) => ({ ...prev, metrics: m }));
          }
        }
      } catch {
        // silent polling catch
      }
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOriginLocal, localAgent.status]);

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
        metrics: localAgent.metrics,
        isLoading,

        isOriginLocal,
        isHosted,
        localAgent,
        serverHardware,
        serverDeployment,

        refreshHardware,
        refreshModels,
        refreshRuntimes,
        refreshConfig,
        refreshAll,
        checkLocalAgent,
        setLocalAgentUrl,
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
