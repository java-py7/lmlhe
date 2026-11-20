import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Play,
  Search,
  Send,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import type {
  DownloadTask,
  ExecutionPlan,
  HalEvaluationResult,
  KvCacheQuant,
  LocalHardwareProfile,
  ModelSpec,
  OffloadStrategy,
  QuantizationSpec,
  RuntimeConfigInput,
  RuntimeId,
  RuntimeSession,
} from '../../shared/types.ts';
import { ValidationLabel } from './ValidationLabel.tsx';

interface ModelRuntimeViewProps {
  profile: LocalHardwareProfile;
  evaluation: HalEvaluationResult | null;
  models: ModelSpec[];
  quantizations: QuantizationSpec[];
  config: RuntimeConfigInput;
  plan: ExecutionPlan | null;
  downloads: DownloadTask[];
  session: RuntimeSession;
  onChangeConfig: (next: RuntimeConfigInput) => void;
  onStartDownload: (modelId: string, quantId: string, totalGB: number) => void;
  onCancelDownload: (id: string) => void;
  onLaunch: () => void;
  onStop: () => void;
  onRunPrompt: (prompt: string) => Promise<{
    promptTokens: number;
    completionTokens: number;
    ttftMs: number;
    tokensPerSec: number;
    responseText: string;
  } | null>;
  launchError: string | null;
}

const CONTEXT_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

export function ModelRuntimeView({
  profile,
  evaluation,
  models,
  quantizations,
  config,
  plan,
  downloads,
  session,
  onChangeConfig,
  onStartDownload,
  onCancelDownload,
  onLaunch,
  onStop,
  onRunPrompt,
  launchError,
}: ModelRuntimeViewProps) {
  const [executionTab, setExecutionTab] = useState<'standard' | 'advanced'>('standard');
  const [validationFilter, setValidationFilter] = useState<'all' | 'team-validated' | 'experimental'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCli, setCopiedCli] = useState(false);

  // Interactive test prompt state
  const [promptInput, setPromptInput] = useState(
    'Explain how KV-cache quantization affects long-context memory usage on consumer GPUs.',
  );
  const [isInferring, setIsInferring] = useState(false);
  const [lastInference, setLastInference] = useState<{
    promptTokens: number;
    completionTokens: number;
    ttftMs: number;
    tokensPerSec: number;
    responseText: string;
  } | null>(null);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === config.modelId) ?? models[0],
    [models, config.modelId],
  );

  const compatibleRuntimes = evaluation?.runtimes ?? [];

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !`${model.name} ${model.family} ${model.useCase}`.toLowerCase().includes(q)) {
        return false;
      }
      const compat = evaluation?.modelCompatibility[model.id];
      const relevantStatus =
        executionTab === 'standard' ? compat?.bestStandardStatus : compat?.bestOffloadStatus;

      if (validationFilter === 'team-validated' && relevantStatus !== 'team-validated') {
        return false;
      }
      if (validationFilter === 'experimental' && relevantStatus !== 'experimental') {
        return false;
      }
      return true;
    });
  }, [models, searchQuery, evaluation, executionTab, validationFilter]);

  const handleSelectModel = (model: ModelSpec) => {
    const compat = evaluation?.modelCompatibility[model.id];
    const nextRuntime: RuntimeId =
      executionTab === 'advanced'
        ? model.isMoE && profile.gpuVendor === 'nvidia' && profile.ramTotalGB >= 64
          ? 'ktransformers'
          : 'llama.cpp'
        : compat?.recommendedRuntime ?? evaluation?.recommendedRuntimeId ?? 'llama.cpp';

    const nextStrategy: OffloadStrategy =
      executionTab === 'standard'
        ? profile.vramTotalGB >= 4 || profile.unifiedMemory
          ? 'full-gpu'
          : 'cpu-only-mmap'
        : model.isMoE
          ? 'moe-cpu-experts'
          : profile.vramTotalGB >= 4 && !profile.unifiedMemory
            ? 'hybrid-gpu-cpu'
            : 'cpu-only-mmap';

    const nextQuant =
      executionTab === 'advanced'
        ? model.paramsB >= 70
          ? 'IQ2_XS'
          : 'IQ3_XXS'
        : compat?.recommendedQuant ?? model.defaultQuant;

    const nextGpuLayers =
      nextStrategy === 'full-gpu'
        ? model.layers
        : nextStrategy === 'cpu-only-mmap'
          ? 0
          : Math.max(1, Math.round(model.layers * 0.55));

    onChangeConfig({
      ...config,
      modelId: model.id,
      runtimeId: nextRuntime,
      quantId: nextQuant,
      offloadStrategy: nextStrategy,
      gpuLayers: nextGpuLayers,
      contextSize: Math.min(config.contextSize, model.maxNativeContext),
    });
  };

  const handleExecutionTabSwitch = (tab: 'standard' | 'advanced') => {
    setExecutionTab(tab);
    if (!selectedModel) return;
    if (tab === 'standard') {
      const nextStrategy: OffloadStrategy =
        profile.vramTotalGB >= 4 || profile.unifiedMemory ? 'full-gpu' : 'cpu-only-mmap';
      onChangeConfig({
        ...config,
        offloadStrategy: nextStrategy,
        gpuLayers: nextStrategy === 'full-gpu' ? selectedModel.layers : 0,
        quantId: config.quantId.startsWith('IQ') ? 'Q4_K_M' : config.quantId,
      });
    } else {
      const nextStrategy: OffloadStrategy = selectedModel.isMoE
        ? 'moe-cpu-experts'
        : profile.vramTotalGB >= 4 && !profile.unifiedMemory
          ? 'hybrid-gpu-cpu'
          : 'cpu-only-mmap';
      onChangeConfig({
        ...config,
        runtimeId:
          selectedModel.isMoE && profile.gpuVendor === 'nvidia' && profile.ramTotalGB >= 64
            ? 'ktransformers'
            : 'llama.cpp',
        offloadStrategy: nextStrategy,
        gpuLayers:
          nextStrategy === 'hybrid-gpu-cpu' ? Math.max(1, Math.round(selectedModel.layers * 0.5)) : 0,
      });
    }
  };

  const handleRuntimeChange = (runtimeId: RuntimeId) => {
    const validQuants = quantizations.filter((q) => q.compatibleRuntimes.includes(runtimeId));
    const quantStillValid = validQuants.some((q) => q.id === config.quantId);
    const nextQuant = quantStillValid ? config.quantId : (validQuants[0]?.id ?? 'Q4_K_M');
    const nextStrategy: OffloadStrategy =
      runtimeId === 'exllamav2' || runtimeId === 'vllm' || runtimeId === 'tensorrt-llm' || runtimeId === 'mlx-lm'
        ? 'full-gpu'
        : config.offloadStrategy;

    onChangeConfig({
      ...config,
      runtimeId,
      quantId: nextQuant,
      offloadStrategy: nextStrategy,
      gpuLayers: nextStrategy === 'full-gpu' && selectedModel ? selectedModel.layers : config.gpuLayers,
    });
  };

  const handleCopyCli = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan.cliCommand);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 1800);
    } catch {
      // Ignore sandboxed clipboard error
    }
  };

  const handleTestPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || session.status !== 'running') return;
    setIsInferring(true);
    try {
      const result = await onRunPrompt(promptInput);
      if (result) setLastInference(result);
    } finally {
      setIsInferring(false);
    }
  };

  const activeDownloadForSelection = downloads.find(
    (d) => d.modelId === config.modelId && d.quantId === config.quantId && d.status !== 'cancelled',
  );

  const isRunning = session.status === 'running';

  return (
    <div className="space-y-8">
      {/* Header + Execution Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Model Selection &amp; Runtime Configuration
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select models calibrated to your detected local hardware, toggle between Standard GPU and Advanced Offload execution, download weights, and launch or stop the runtime.
          </p>
        </div>

        {/* Interactive Mode Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => handleExecutionTabSwitch('standard')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              executionTab === 'standard'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Standard Execution
          </button>
          <button
            type="button"
            onClick={() => handleExecutionTabSwitch('advanced')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              executionTab === 'advanced'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Advanced / Offload Options
          </button>
        </div>
      </div>

      {/* Main Two-Column Workspace: Left = Model Selection Table, Right = Runtime Configuration & Launch */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): Model Selection Table */}
        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter models (e.g. Qwen, 70B, MoE)…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md shrink-0">
              {(['all', 'team-validated', 'experimental'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setValidationFilter(status)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    validationFilter === status
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {status === 'all' ? 'All Models' : status === 'team-validated' ? 'Team Validated' : 'Experimental'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-3 text-right">Params</th>
                  <th className="py-2.5 px-3 text-right">Est. Speed</th>
                  <th className="py-2.5 px-3 text-right">Disk / Mem</th>
                  <th className="py-2.5 px-4">
                    {executionTab === 'standard' ? 'Standard Status' : 'Offload Status'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredModels.map((model) => {
                  const compat = evaluation?.modelCompatibility[model.id];
                  const status =
                    executionTab === 'standard'
                      ? (compat?.bestStandardStatus ?? 'experimental')
                      : (compat?.bestOffloadStatus ?? 'experimental');
                  const isSelected = model.id === config.modelId;

                  return (
                    <tr
                      key={model.id}
                      onClick={() => handleSelectModel(model)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-sky-950/35'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{model.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {model.family} · {model.layers}L{model.isMoE ? ` · MoE (${model.activeParamsB}B active)` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {model.paramsB}B
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {compat ? `${compat.estimatedTokPerSec} tok/s` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {compat ? `${compat.diskUsageGB} GB` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <ValidationLabel status={status} compact />
                      </td>
                    </tr>
                  );
                })}
                {filteredModels.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      No models match this filter for your local hardware. Try switching to Advanced / Offload Options or viewing All Models.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Runtime Configurator + Resource Budget + Launch */}
        <div className="xl:col-span-5 space-y-5">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {selectedModel?.name ?? 'Select Model'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedModel?.useCase}
                </p>
              </div>
              {plan && <ValidationLabel status={plan.validationStatus} />}
            </div>

            {/* Validation Rationale */}
            {plan && (
              <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-100">
                  {plan.validationHeadline}
                </div>
                {plan.validationReasons.map((reason, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {reason}
                  </p>
                ))}
              </div>
            )}

            {/* Runtime Controls */}
            <div className="space-y-4">
              {/* Runtime Engine + Quantization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Inference Runtime</span>
                  <select
                    value={config.runtimeId}
                    onChange={(e) => handleRuntimeChange(e.target.value as RuntimeId)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    {compatibleRuntimes.map((r) => (
                      <option key={r.engine.id} value={r.engine.id}>
                        {r.engine.name} {r.compatible ? (r.recommended ? '(Recommended)' : '') : '(Incompatible)'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Quantization Format</span>
                  <select
                    value={config.quantId}
                    onChange={(e) => onChangeConfig({ ...config, quantId: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    {quantizations.map((q) => {
                      const supported = q.compatibleRuntimes.includes(config.runtimeId);
                      return (
                        <option key={q.id} value={q.id} disabled={!supported}>
                          {q.label} {q.teamValidated ? '· Validated' : '· Experimental'}
                          {!supported ? ' (N/A for runtime)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              {/* Offloading Strategy + KV Cache Quantization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Offloading Strategy</span>
                  <select
                    value={config.offloadStrategy}
                    onChange={(e) => {
                      const strategy = e.target.value as OffloadStrategy;
                      const layers = selectedModel?.layers ?? 32;
                      onChangeConfig({
                        ...config,
                        offloadStrategy: strategy,
                        gpuLayers:
                          strategy === 'full-gpu'
                            ? layers
                            : strategy === 'cpu-only-mmap'
                              ? 0
                              : strategy === 'disk-layer-stream'
                                ? 1
                                : Math.round(layers * 0.5),
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="full-gpu">Full GPU Resident (Standard)</option>
                    <option value="hybrid-gpu-cpu">Hybrid GPU + CPU Split (Advanced)</option>
                    <option value="moe-cpu-experts">MoE Experts on CPU / Attn GPU (Advanced)</option>
                    <option value="cpu-only-mmap">CPU-Only mmap (No VRAM)</option>
                    <option value="disk-layer-stream">Disk Layer Streaming / AirLLM (Experimental)</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">KV-Cache Precision</span>
                  <select
                    value={config.kvCacheQuant}
                    onChange={(e) => onChangeConfig({ ...config, kvCacheQuant: e.target.value as KvCacheQuant })}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="fp16">FP16 (Default Accuracy)</option>
                    <option value="q8_0">Q8_0 (~47% KV Savings)</option>
                    <option value="q4_0">Q4_0 (~72% KV Savings)</option>
                  </select>
                </label>
              </div>

              {/* CPU / GPU Layer Split Slider */}
              {selectedModel && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      GPU / CPU Layer Split (-ngl)
                    </span>
                    <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {plan?.gpuLayersAllocated ?? config.gpuLayers} GPU / {plan?.cpuLayersAllocated ?? 0} CPU (Total {selectedModel.layers})
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={selectedModel.layers}
                    step={1}
                    disabled={config.offloadStrategy === 'full-gpu' || config.offloadStrategy === 'cpu-only-mmap' || config.offloadStrategy === 'disk-layer-stream'}
                    value={plan?.gpuLayersAllocated ?? config.gpuLayers}
                    onChange={(e) => onChangeConfig({ ...config, gpuLayers: Number(e.target.value) })}
                    className="w-full cursor-pointer disabled:opacity-40"
                  />
                </div>
              )}

              {/* Context Size Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Context Window Size</span>
                  <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {config.contextSize.toLocaleString()} tok{' '}
                    {plan && (
                      <span className="text-slate-500 dark:text-slate-400">
                        (Max practical: {plan.maxPracticalContext.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CONTEXT_STEPS.filter((c) => c <= (selectedModel?.maxNativeContext ?? 131072)).map((ctx) => {
                    const overPractical = plan ? ctx > plan.maxPracticalContext : false;
                    const active = config.contextSize === ctx;
                    return (
                      <button
                        key={ctx}
                        type="button"
                        onClick={() => onChangeConfig({ ...config, contextSize: ctx })}
                        className={`px-2.5 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-sky-500 dark:text-slate-950 dark:border-sky-500'
                            : overPractical
                              ? 'bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-300/70 dark:border-amber-800'
                              : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {ctx >= 1024 ? `${ctx / 1024}K` : ctx}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CPU Threads + Flash Attention + mmap */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">CPU Threads</span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {config.cpuThreads} / {profile.cpuCores}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(2, profile.cpuCores)}
                    value={config.cpuThreads}
                    onChange={(e) => onChangeConfig({ ...config, cpuThreads: Number(e.target.value) })}
                    className="w-full cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-700 dark:text-slate-300 pt-3 sm:pt-4">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.flashAttention}
                      onChange={(e) => onChangeConfig({ ...config, flashAttention: e.target.checked })}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                    <span>Flash Attn</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.useMmap}
                      onChange={(e) => onChangeConfig({ ...config, useMmap: e.target.checked })}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                    <span>mmap</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Real-Time HAL Resource Projection */}
            {plan && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Projected Decode</div>
                    <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                      {plan.estimatedTokPerSec} tok/s
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Est. TTFT</div>
                    <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                      {plan.estimatedTtftMs} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Model Load</div>
                    <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                      {plan.estimatedLoadTimeSec} s
                    </div>
                  </div>
                </div>

                {/* VRAM / Unified Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    <span>{profile.unifiedMemory ? 'Unified Memory Required' : 'VRAM Required'}</span>
                    <span>
                      {plan.vramRequiredGB} GB / {profile.unifiedMemory ? profile.unifiedMemoryPoolGB : profile.vramTotalGB} GB ({plan.vramUtilizationPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        plan.vramUtilizationPct > 100
                          ? 'bg-red-600'
                          : plan.vramUtilizationPct > 85
                            ? 'bg-amber-500'
                            : 'bg-blue-700 dark:bg-sky-400'
                      }`}
                      style={{ width: `${Math.min(100, plan.vramUtilizationPct)}%` }}
                    />
                  </div>
                </div>

                {/* System RAM Bar */}
                {!profile.unifiedMemory && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      <span>Host System RAM Required</span>
                      <span>
                        {plan.ramRequiredGB} GB / {profile.ramTotalGB} GB ({plan.ramUtilizationPct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          plan.ramUtilizationPct > 100
                            ? 'bg-red-600'
                            : plan.ramUtilizationPct > 85
                              ? 'bg-amber-500'
                              : 'bg-emerald-600 dark:bg-emerald-400'
                        }`}
                        style={{ width: `${Math.min(100, plan.ramUtilizationPct)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>Weights: {plan.weightsSizeGB} GB · KV: {plan.kvCacheSizeGB} GB · Disk: {plan.diskUsageGB} GB</span>
                  <span>Bottleneck: {plan.bottleneck}</span>
                </div>
              </div>
            )}

            {/* Action Bar: Download + Launch / Stop */}
            {launchError && (
              <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-2.5">
                {launchError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {plan && (
                <button
                  type="button"
                  onClick={() => onStartDownload(plan.model.id, plan.quant.id, plan.diskUsageGB)}
                  disabled={activeDownloadForSelection?.status === 'downloading' || activeDownloadForSelection?.status === 'completed'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-55 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {activeDownloadForSelection?.status === 'completed'
                      ? 'Weights Downloaded'
                      : activeDownloadForSelection?.status === 'downloading'
                        ? `Downloading ${activeDownloadForSelection.progressPct}%`
                        : `Download (${plan.diskUsageGB} GB)`}
                  </span>
                </button>
              )}

              {!isRunning ? (
                <button
                  type="button"
                  onClick={onLaunch}
                  disabled={!plan || plan.validationStatus === 'exceeds-hardware'}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Launch Runtime</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Stop Running Model</span>
                </button>
              )}
            </div>

            {/* Generated Runnable CLI Command */}
            {plan && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Generated Local Launch Command</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCli}
                    className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    {copiedCli ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCli ? 'Copied' : 'Copy CLI'}</span>
                  </button>
                </div>
                <pre className="text-[11px] font-mono bg-slate-950 text-slate-200 p-3 rounded-md overflow-x-auto leading-relaxed">
                  {plan.cliCommand}
                </pre>
              </div>
            )}
          </div>

          {/* Active Downloads Queue */}
          {downloads.length > 0 && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Model Weight Downloads ({downloads.length})
              </div>
              <div className="space-y-3">
                {downloads.map((dl) => (
                  <div key={dl.id} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono truncate text-slate-800 dark:text-slate-200">
                        {dl.fileName}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          {dl.downloadedGB.toFixed(2)} / {dl.totalGB} GB
                          {dl.status === 'downloading' ? ` · ${dl.speedMBs} MB/s` : ` · ${dl.status}`}
                        </span>
                        {dl.status === 'downloading' && (
                          <button
                            type="button"
                            onClick={() => onCancelDownload(dl.id)}
                            aria-label={`Cancel ${dl.fileName}`}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          dl.status === 'completed'
                            ? 'bg-emerald-600'
                            : dl.status === 'cancelled'
                              ? 'bg-slate-400'
                              : 'bg-blue-700 dark:bg-sky-400'
                        }`}
                        style={{ width: `${dl.progressPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Runtime Inference Probe (when running) */}
          {isRunning && session.plan && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Active Runtime Test Console
                  </h3>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {session.endpointUrl} · {session.plan.model.name} ({session.plan.quant.id})
                  </p>
                </div>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Running
                </span>
              </div>

              <form onSubmit={handleTestPrompt} className="flex gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Send a test prompt to measure TTFT and tok/s…"
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                />
                <button
                  type="submit"
                  disabled={isInferring}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isInferring ? 'Running…' : 'Probe Prompt'}</span>
                </button>
              </form>

              {lastInference && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    <span>TTFT: {lastInference.ttftMs} ms</span>
                    <span aria-hidden="true">·</span>
                    <span>Decode: {lastInference.tokensPerSec} tok/s</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Tokens: {lastInference.promptTokens} in / {lastInference.completionTokens} out
                    </span>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-slate-800 dark:text-slate-200 leading-relaxed">
                    {lastInference.responseText}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
