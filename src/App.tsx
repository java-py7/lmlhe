import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Cpu,
  GitBranch,
  Menu,
  Moon,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Square,
  Sun,
  X,
} from 'lucide-react';
import type {
  BenchmarkRecord,
  DiagnosticReport,
  DownloadTask,
  ExecutionPlan,
  GitHubProject,
  HalEvaluationResult,
  HardwareClassSpec,
  LocalHardwareProfile,
  ModelSpec,
  QuantizationSpec,
  RuntimeConfigInput,
  RuntimeId,
  RuntimeSession,
  TelemetrySample,
} from '../shared/types.ts';
import {
  detectLocalComputerHardware,
} from './lib/localHardwareDetector.ts';
import { HardwareProbeView } from './components/HardwareProbeView.tsx';
import { ModelRuntimeView } from './components/ModelRuntimeView.tsx';
import { PerformanceDashboardView } from './components/PerformanceDashboardView.tsx';
import { BenchmarksView } from './components/BenchmarksView.tsx';
import { EcosystemView } from './components/EcosystemView.tsx';
import { DiagnosticsView } from './components/DiagnosticsView.tsx';

type NavSection =
  | 'hardware'
  | 'models'
  | 'performance'
  | 'benchmarks'
  | 'ecosystem'
  | 'diagnostics';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  breadcrumb: string;
  icon: typeof Cpu;
}> = [
    { id: 'hardware', label: 'Hardware Probe', breadcrumb: 'Local Hardware Probe', icon: Cpu },
    { id: 'models', label: 'Models & Runtime', breadcrumb: 'Models & Runtime Config', icon: Sliders },
    { id: 'performance', label: 'Performance Monitor', breadcrumb: 'Performance Telemetry', icon: Activity },
    { id: 'benchmarks', label: 'Benchmarks & Matrix', breadcrumb: 'Benchmarks & Capacity Matrix', icon: BarChart3 },
    { id: 'ecosystem', label: 'Ecosystem & HAL', breadcrumb: 'GitHub Projects & HAL', icon: GitBranch },
    { id: 'diagnostics', label: 'Diagnostics', breadcrumb: 'Diagnostics Suite', icon: ShieldCheck },
  ];

const INITIAL_SESSION: RuntimeSession = {
  id: 'session-idle',
  status: 'idle',
  startedAt: null,
  stoppedAt: null,
  executionMode: 'native',
  endpointUrl: 'http://127.0.0.1:8080/v1',
  plan: null,
  totalPromptsRun: 0,
  totalTokensGenerated: 0,
  lastTtftMs: null,
  lastTokPerSec: null,
  logs: [],
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('hardware');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('localscale-theme') === 'dark';
  });

  // Catalog data from backend
  const [projects, setProjects] = useState<GitHubProject[]>([]);
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [quantizations, setQuantizations] = useState<QuantizationSpec[]>([]);
  const [hardwareClasses, setHardwareClasses] = useState<HardwareClassSpec[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRecord[]>([]);

  // Client-detected local hardware state
  const [profile, setProfile] = useState<LocalHardwareProfile | null>(null);
  const [isProbing, setIsProbing] = useState(true);

  // HAL evaluation & active runtime plan
  const [evaluation, setEvaluation] = useState<HalEvaluationResult | null>(null);
  const [config, setConfig] = useState<RuntimeConfigInput>({
    modelId: 'qwen-2.5-7b',
    runtimeId: 'llama.cpp',
    quantId: 'Q4_K_M',
    offloadStrategy: 'full-gpu',
    gpuLayers: 28,
    contextSize: 8192,
    kvCacheQuant: 'q8_0',
    cpuThreads: 6,
    flashAttention: true,
    useMmap: true,
    batchSize: 512,
  });
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);

  // Runtime lifecycle, downloads, telemetry & diagnostics
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [session, setSession] = useState<RuntimeSession>(INITIAL_SESSION);
  const [stressLoadActive, setStressLoadActive] = useState(false);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetrySample[]>([]);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const hasAutoConfigured = useRef(false);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('localscale-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('localscale-theme', 'light');
    }
  }, [darkMode]);

  // Load backend catalog, benchmarks, runtime status & downloads on mount
  useEffect(() => {
    async function loadInitialBackendState() {
      try {
        const [catRes, bmRes, statusRes, dlRes] = await Promise.all([
          fetch('/api/catalog'),
          fetch('/api/benchmarks'),
          fetch('/api/runtime/status'),
          fetch('/api/runtime/downloads'),
        ]);
        if (catRes.ok) {
          const cat = await catRes.json();
          setProjects(cat.projects ?? []);
          setModels(cat.models ?? []);
          setQuantizations(cat.quantizations ?? []);
          setHardwareClasses(cat.hardwareClasses ?? []);
        }
        if (bmRes.ok) {
          const bm = await bmRes.json();
          setBenchmarks(bm.benchmarks ?? []);
        }
        if (statusRes.ok) {
          const st = await statusRes.json();
          if (st.session) setSession(st.session);
          setStressLoadActive(Boolean(st.stressLoadActive));
        }
        if (dlRes.ok) {
          const dl = await dlRes.json();
          setDownloads(dl.downloads ?? []);
        }
      } catch (err) {
        console.error('Failed to load initial catalog:', err);
      }
    }
    loadInitialBackendState();
  }, []);

  // Probe local computer hardware
  const probeLocalHardware = useCallback(async () => {
    setIsProbing(true);
    try {
      const detected = await detectLocalComputerHardware();
      setProfile(detected);
    } finally {
      setIsProbing(false);
    }
  }, []);

  useEffect(() => {
    probeLocalHardware();
  }, [probeLocalHardware]);

  // Evaluate profile via Backend HAL whenever profile changes
  useEffect(() => {
    if (!profile) return;
    const currentProfile = profile;
    let cancelled = false;
    async function evaluate() {
      try {
        const res = await fetch('/api/hal/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: currentProfile }),
        });
        if (!res.ok || cancelled) return;
        const evalData = (await res.json()) as HalEvaluationResult;
        setEvaluation(evalData);

        // On first detection, auto-select the largest Team-Validated model for this PC
        if (!hasAutoConfigured.current && evalData.largestValidatedModel) {
          hasAutoConfigured.current = true;
          const targetModel = models.find((m) => m.id === evalData.largestValidatedModel.modelId);
          const layers = targetModel?.layers ?? 28;
          const useGpu = currentProfile.vramTotalGB >= 4 || currentProfile.unifiedMemory;
          setConfig({
            modelId: evalData.largestValidatedModel.modelId,
            runtimeId: evalData.largestValidatedModel.runtimeId,
            quantId: evalData.largestValidatedModel.quantId,
            offloadStrategy: useGpu ? 'full-gpu' : 'cpu-only-mmap',
            gpuLayers: useGpu ? layers : 0,
            contextSize: Math.min(8192, evalData.largestValidatedModel.maxPracticalContext || 8192),
            kvCacheQuant: 'q8_0',
            cpuThreads: Math.max(2, Math.floor(currentProfile.cpuCores * 0.75)),
            flashAttention: true,
            useMmap: true,
            batchSize: 512,
          });
        }
      } catch (err) {
        console.error('HAL evaluation failed:', err);
      }
    }
    evaluate();
    return () => {
      cancelled = true;
    };
  }, [profile, models]);

  // Compute execution plan via Backend HAL whenever profile or config changes
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    async function computePlan() {
      try {
        const res = await fetch('/api/hal/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, config }),
        });
        if (!res.ok || cancelled) return;
        const nextPlan = (await res.json()) as ExecutionPlan;
        setPlan(nextPlan);
        setLaunchError(null);
      } catch (err) {
        console.error('HAL plan computation failed:', err);
      }
    }
    computePlan();
    return () => {
      cancelled = true;
    };
  }, [profile, config]);

  // Run Diagnostics automatically once profile & plan are ready
  const runDiagnostics = useCallback(async () => {
    if (!profile) return;
    setIsRunningDiag(true);
    try {
      const res = await fetch('/api/diagnostics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, config }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosticReport(data.report);
      }
    } finally {
      setIsRunningDiag(false);
    }
  }, [profile, config]);

  useEffect(() => {
    if (profile && plan && !diagnosticReport) {
      runDiagnostics();
    }
  }, [profile, plan, diagnosticReport, runDiagnostics]);

  // Subscribe to live Telemetry SSE stream
  useEffect(() => {
    const es = new EventSource('/api/runtime/telemetry');
    es.onmessage = (event) => {
      try {
        const sample = JSON.parse(event.data) as TelemetrySample;
        setTelemetryHistory((prev) => {
          const next = [...prev, sample];
          return next.length > 32 ? next.slice(next.length - 32) : next;
        });
      } catch {
        // Ignore malformed frame
      }
    };
    return () => {
      es.close();
    };
  }, []);

  // Poll active downloads smoothly
  useEffect(() => {
    const hasActive = downloads.some((d) => d.status === 'downloading');
    if (!hasActive) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/runtime/downloads');
        if (res.ok) {
          const data = await res.json();
          setDownloads(data.downloads ?? []);
        }
      } catch {
        // Ignore transient poll error
      }
    }, 550);
    return () => clearInterval(timer);
  }, [downloads]);

  // Handlers
  const handleStartDownload = async (modelId: string, quantId: string, totalGB: number) => {
    const res = await fetch('/api/runtime/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, quantId, totalGB }),
    });
    if (res.ok) {
      const dlRes = await fetch('/api/runtime/downloads');
      if (dlRes.ok) {
        const data = await dlRes.json();
        setDownloads(data.downloads ?? []);
      }
    }
  };

  const handleCancelDownload = async (id: string) => {
    await fetch(`/api/runtime/download/${id}/cancel`, { method: 'POST' });
    const dlRes = await fetch('/api/runtime/downloads');
    if (dlRes.ok) {
      const data = await dlRes.json();
      setDownloads(data.downloads ?? []);
    }
  };

  const handleLaunchRuntime = async () => {
    if (!profile) return;
    setLaunchError(null);
    const res = await fetch('/api/runtime/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, config }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLaunchError(data.error ?? 'Failed to launch runtime.');
      return;
    }
    setSession(data.session);
  };

  const handleStopRuntime = async () => {
    const res = await fetch('/api/runtime/stop', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setSession(data.session);
      setStressLoadActive(false);
    }
  };

  const handleToggleStress = async () => {
    const next = !stressLoadActive;
    const res = await fetch('/api/runtime/stress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    });
    if (res.ok) {
      setStressLoadActive(next);
      const statusRes = await fetch('/api/runtime/status');
      if (statusRes.ok) {
        const st = await statusRes.json();
        if (st.session) setSession(st.session);
      }
    }
  };

  const handleRunPrompt = async (prompt: string) => {
    const res = await fetch('/api/runtime/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.session) setSession(data.session);
    return {
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      ttftMs: data.ttftMs,
      tokensPerSec: data.tokensPerSec,
      responseText: data.responseText,
    };
  };

  const handleRunBenchmark = async () => {
    if (!profile) return;
    setIsRunningBenchmark(true);
    try {
      const res = await fetch('/api/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, config }),
      });
      if (res.ok) {
        const data = await res.json();
        setBenchmarks(data.benchmarks ?? []);
      }
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleSelectModelFromHardware = (modelId: string, mode: 'standard' | 'offload') => {
    const targetModel = models.find((m) => m.id === modelId);
    if (!targetModel || !profile || !evaluation) return;
    if (mode === 'standard') {
      const useGpu = profile.vramTotalGB >= 4 || profile.unifiedMemory;
      setConfig({
        ...config,
        modelId,
        runtimeId: evaluation.largestValidatedModel.runtimeId,
        quantId: evaluation.largestValidatedModel.quantId,
        offloadStrategy: useGpu ? 'full-gpu' : 'cpu-only-mmap',
        gpuLayers: useGpu ? targetModel.layers : 0,
      });
    } else {
      const strategy = evaluation.largestExperimentalModel.offloadStrategy;
      setConfig({
        ...config,
        modelId,
        runtimeId: evaluation.largestExperimentalModel.runtimeId,
        quantId: evaluation.largestExperimentalModel.quantId,
        offloadStrategy: strategy,
        gpuLayers:
          strategy === 'hybrid-gpu-cpu'
            ? Math.max(1, Math.round(targetModel.layers * 0.45))
            : strategy === 'cpu-only-mmap'
              ? 0
              : targetModel.layers,
      });
    }
    setActiveSection('models');
  };

  const handleSelectRuntimeFromEcosystem = (runtimeId: RuntimeId) => {
    const validQuants = quantizations.filter((q) => q.compatibleRuntimes.includes(runtimeId));
    const quantStillValid = validQuants.some((q) => q.id === config.quantId);
    setConfig({
      ...config,
      runtimeId,
      quantId: quantStillValid ? config.quantId : (validQuants[0]?.id ?? 'Q4_K_M'),
    });
    setActiveSection('models');
  };

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeSection) ?? NAV_ITEMS[0];
  const isRunning = session.status === 'running';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1520] sticky top-0 h-screen">
        {/* Brand Wordmark */}
        <div className="h-14 px-5 flex items-center border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSection('hardware')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            LocalScale
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary Workspace Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${active
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer: Local PC Summary + Theme Toggle */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {profile && (
            <div className="space-y-0.5 text-xs">
              <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={profile.gpuName}>
                {profile.gpuName}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {profile.cpuCores}T · {profile.ramTotalGB}GB RAM ·{' '}
                {profile.unifiedMemory ? `${profile.unifiedMemoryPoolGB}GB Unified` : `${profile.vramTotalGB}GB VRAM`}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-200/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>{darkMode ? 'Light Interface' : 'Dark Interface'}</span>
            {darkMode ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Moon className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[82vw] bg-white dark:bg-[#0F1520] border-r border-slate-200 dark:border-slate-800 flex flex-col h-full">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
                LocalScale
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${active
                      ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 rounded-md"
              >
                <span>{darkMode ? 'Light Interface' : 'Dark Interface'}</span>
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb Left, Max 2 Primary Actions Right */}
        <header className="h-14 sticky top-0 z-30 bg-white/95 dark:bg-[#0F1520]/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                {activeNavMeta.breadcrumb}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => probeLocalHardware()}
              disabled={isProbing}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Re-scan Local PC</span>
            </button>

            {!isRunning ? (
              <button
                type="button"
                onClick={handleLaunchRuntime}
                disabled={!plan || plan.validationStatus === 'exceeds-hardware'}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Launch Runtime</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopRuntime}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop Runtime</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Workspace Viewport */}
        <main className="flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7">
          {!profile ? (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center space-y-2">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Probing your local computer hardware…
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reading WebGPU adapter limits, WebGL2 unmasked GPU renderer, logical CPU concurrency, StorageManager quota, and local compute throughput.
              </p>
            </div>
          ) : (
            <>
              {activeSection === 'hardware' && (
                <HardwareProbeView
                  profile={profile}
                  evaluation={evaluation}
                  isProbing={isProbing}
                  onRescan={() => probeLocalHardware()}
                  onUpdateProfile={(next) => setProfile(next)}
                  onSelectModelAndOpenConfig={handleSelectModelFromHardware}
                />
              )}

              {activeSection === 'models' && (
                <ModelRuntimeView
                  profile={profile}
                  evaluation={evaluation}
                  models={models}
                  quantizations={quantizations}
                  config={config}
                  plan={plan}
                  downloads={downloads}
                  session={session}
                  onChangeConfig={setConfig}
                  onStartDownload={handleStartDownload}
                  onCancelDownload={handleCancelDownload}
                  onLaunch={handleLaunchRuntime}
                  onStop={handleStopRuntime}
                  onRunPrompt={handleRunPrompt}
                  launchError={launchError}
                />
              )}

              {activeSection === 'performance' && (
                <PerformanceDashboardView
                  profile={profile}
                  session={session}
                  plan={plan}
                  telemetryHistory={telemetryHistory}
                  stressLoadActive={stressLoadActive}
                  onLaunch={handleLaunchRuntime}
                  onStop={handleStopRuntime}
                  onToggleStress={handleToggleStress}
                  onOpenConfigurator={() => setActiveSection('models')}
                />
              )}

              {activeSection === 'benchmarks' && (
                <BenchmarksView
                  benchmarks={benchmarks}
                  hardwareClasses={hardwareClasses}
                  evaluation={evaluation}
                  models={models}
                  currentConfig={config}
                  isRunningBenchmark={isRunningBenchmark}
                  onRunBenchmark={handleRunBenchmark}
                />
              )}

              {activeSection === 'ecosystem' && (
                <EcosystemView
                  projects={projects}
                  profile={profile}
                  evaluation={evaluation}
                  onSelectRuntimeForConfig={handleSelectRuntimeFromEcosystem}
                />
              )}

              {activeSection === 'diagnostics' && (
                <DiagnosticsView
                  report={diagnosticReport}
                  session={session}
                  isRunning={isRunningDiag}
                  onRunDiagnostics={runDiagnostics}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
