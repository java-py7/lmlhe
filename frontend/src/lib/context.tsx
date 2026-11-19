import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { HardwareProfile, ModelEntry, RuntimeStatusResponse, EngineConfig, LiveMetrics } from './types';
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
  refreshHardware: () => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshRuntimes: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshAll: () => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
  switchRuntime: (runtime: string) => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const { showSuccess, showError } = useToast();
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [runtimes, setRuntimes] = useState<RuntimeStatusResponse | null>(null);
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const activeModel = models.find((m) => m.id === activeModelId);

  // Derived effective runtime: Ollama models are strictly Ollama runtime
  const activeRuntime = activeModel && (
    activeModel.format === 'Ollama' ||
    activeModel.source === 'ollama_api' ||
    (activeModel.runtime_compatibility && activeModel.runtime_compatibility.includes('ollama') && !activeModel.runtime_compatibility.includes('llama.cpp server'))
  )
    ? 'ollama'
    : runtimes?.active_runtime || config?.active_runtime || 'llama.cpp server';

  const refreshHardware = useCallback(async () => {
    try {
      const data = await api.getHardware();
      setHardware(data);
    } catch (err: any) {
      console.warn('Hardware fetch note:', err.message);
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const data = await api.getConfig();
      setConfig(data);
      if (data.active_model_id) {
        setActiveModelId(data.active_model_id);
      }
    } catch (err: any) {
      console.warn('Config fetch note:', err.message);
    }
  }, []);

  const refreshRuntimes = useCallback(async () => {
    try {
      const data = await api.getRuntimes();
      setRuntimes(data);
    } catch (err: any) {
      console.warn('Runtimes fetch note:', err.message);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const data = await api.getModels();
      setModels(data.models || []);
      if (data.active_model_id) {
        setActiveModelId(data.active_model_id);
      }
    } catch (err: any) {
      console.warn('Models fetch note:', err.message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.allSettled([
      refreshHardware(),
      refreshConfig(),
      refreshRuntimes(),
      refreshModels(),
    ]);
    setIsLoading(false);
  }, [refreshHardware, refreshConfig, refreshRuntimes, refreshModels]);

  const selectModel = async (modelId: string) => {
    try {
      const res = await api.selectModel(modelId);
      setActiveModelId(res.active_model_id);
      if (runtimes) {
        setRuntimes({ ...runtimes, active_runtime: res.active_runtime });
      }
      if (config) {
        setConfig({ ...config, active_model_id: res.active_model_id, active_runtime: res.active_runtime });
      }
      showSuccess(`Selected model: ${res.model?.name || modelId} (${res.active_runtime})`);
      await Promise.allSettled([refreshModels(), refreshRuntimes()]);
    } catch (err: any) {
      showError(err.message || 'Failed to select model');
      throw err;
    }
  };

  const switchRuntime = async (runtime: string) => {
    try {
      const res = await api.switchRuntime(runtime);
      if (runtimes) {
        setRuntimes({ ...runtimes, active_runtime: res.active_runtime });
      }
      if (config) {
        setConfig({ ...config, active_runtime: res.active_runtime });
      }
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

  // Live telemetry polling every 2s
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const m = await api.getMetrics();
        if (mounted) setMetrics(m);
      } catch {
        // silent polling catch
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <EngineContext.Provider
      value={{
        hardware,
        models,
        activeModelId,
        activeModel,
        runtimes,
        activeRuntime,
        config,
        metrics,
        isLoading,
        refreshHardware,
        refreshModels,
        refreshRuntimes,
        refreshConfig,
        refreshAll,
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
