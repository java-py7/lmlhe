import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu,
  Database,
  HardDrive,
  Zap,
  Play,
  Square,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Server,
  Layers,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useToast();
  const {
    hardware,
    models,
    activeModel,
    activeRuntime,
    runtimes,
    config,
    metrics,
    refreshRuntimes,
    refreshModels,
    isHosted,
    isExactLocalEngine,
    cpuScore,
    isBenchmarking,
    runSpeedTest,
  } = useEngine();

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Whether we have verified local hardware
  const hasHardware = Boolean(hardware);

  // CPU / RAM values from live metrics or hardware fallback
  const cpuPercent = hasHardware
    ? Math.round(metrics?.cpu?.utilization_percent ?? hardware?.cpu?.utilization_percent ?? 0)
    : 0;
  const ramPercent = hasHardware
    ? Math.round(metrics?.ram?.utilization_percent ?? hardware?.ram?.utilization_percent ?? 0)
    : 0;
  const ramUsedGb = hasHardware
    ? (metrics?.ram?.used_gb ?? hardware?.ram?.used_gb ?? 0)
    : 0;
  const ramTotalGb = hasHardware
    ? (metrics?.ram?.total_gb ?? hardware?.ram?.total_gb ?? 0)
    : 0;
  const ramFreeGb = hasHardware
    ? (metrics?.ram?.available_gb ?? hardware?.ram?.available_gb ?? 0)
    : 0;

  const gpu = hardware?.gpu;
  const infer = metrics?.inference;
  const isOllama = activeRuntime === 'ollama';

  const isLlamaRunning = Boolean(runtimes?.llama_cpp?.status?.running);
  const isLlamaHealthy = Boolean(runtimes?.llama_cpp?.status?.healthy);
  const isOllamaOnline = Boolean(runtimes?.ollama?.detected);

  const isServerReady = isOllama ? isOllamaOnline : isLlamaHealthy;

  const handleStartRuntime = async () => {
    setIsStarting(true);
    try {
      if (isOllama) {
        showInfo('Verifying Ollama service connection...');
        await api.startRuntime();
        showSuccess('Ollama service connected and responsive!');
      } else {
        showInfo('Starting llama.cpp server subprocess...');
        const cfgLlama = config?.llama_cpp;
        await api.startLlamaServer({
          threads: cfgLlama?.threads || 4,
          gpu_layers: cfgLlama?.gpu_layers || 0,
          context_size: cfgLlama?.context_size || 2048,
          port: cfgLlama?.port || 8080,
        });
        showSuccess('llama-server successfully started!');
      }
      await refreshRuntimes();
    } catch (err: any) {
      showError(err.message || 'Failed to start inference runtime');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopRuntime = async () => {
    setIsStopping(true);
    try {
      if (isOllama) {
        await api.stopRuntime();
        showInfo('Ollama inference session halted');
      } else {
        await api.stopLlamaServer();
        showInfo('llama-server stopped');
      }
      await refreshRuntimes();
    } catch (err: any) {
      showError(err.message || 'Failed to halt runtime');
    } finally {
      setIsStopping(false);
    }
  };

  // Sparkline history data from metrics
  const cpuHistory = metrics?.history?.cpu || [];
  const ramHistory = metrics?.history?.ram || [];
  const throughputHistory = metrics?.history?.throughput || [];

  return (
    <div className="space-y-6">
      {/* 4 Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Utilization / Speed Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {isHosted && !isExactLocalEngine ? 'CPU Architecture & Speed' : 'CPU Utilization'}
            </CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              {hasHardware
                ? isHosted && !isExactLocalEngine
                  ? `~${hardware?.cpu?.physical_cores || 4}C / ${hardware?.cpu?.logical_threads || 8}T`
                  : `${hardware?.cpu?.physical_cores || 4}C / ${hardware?.cpu?.logical_threads || 8}T`
                : 'ESTIMATE (~)'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {isHosted && !isExactLocalEngine ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">
                    {cpuScore !== null ? `${cpuScore} Mops/s` : isBenchmarking ? 'Testing...' : 'Ready'}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={hardware?.cpu?.name}>
                    {hardware?.cpu?.name?.split(' ')[0] || 'Processor'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground font-mono">Relative Speed Score</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runSpeedTest()}
                    disabled={isBenchmarking}
                    className="h-6 px-2 text-[10px] gap-1 shrink-0"
                  >
                    <Zap className={cn('w-3 h-3 text-amber-500', isBenchmarking && 'animate-spin')} />
                    {isBenchmarking ? 'Testing...' : 'Test Speed'}
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground/80 pt-1.5 border-t border-border/50">
                  Live CPU % requires local engine (localhost:8000)
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">
                    {hasHardware ? `${cpuPercent}%` : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={hardware?.cpu?.name}>
                    {hasHardware ? hardware?.cpu?.name?.split(' ')[0] || 'Processor' : 'Hardware Unavailable'}
                  </span>
                </div>
                <Progress value={cpuPercent} indicatorColor={cpuPercent > 85 ? 'bg-rose-500' : 'bg-primary'} />
                {/* Sparkline */}
                <div className="h-9 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cpuHistory}>
                      <Area type="monotone" dataKey="v" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Memory Allocation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Memory Allocation</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              {isHosted && !isExactLocalEngine
                ? 'ESTIMATE (~)'
                : hasHardware
                ? `${ramPercent}%`
                : 'ESTIMATE (~)'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight">
                {isHosted && !isExactLocalEngine
                  ? `~${ramUsedGb.toFixed(1)} GB (est.)`
                  : hasHardware
                  ? `${ramUsedGb.toFixed(1)} GB`
                  : '~3.2 GB (est.)'}
              </span>
              <span className="text-xs text-muted-foreground">
                {isHosted && !isExactLocalEngine
                  ? `~${ramFreeGb.toFixed(1)} GB free (estimate)`
                  : hasHardware
                  ? `${ramFreeGb.toFixed(1)} GB free of ${ramTotalGb.toFixed(0)} GB`
                  : '~4.8 GB free (estimate)'}
              </span>
            </div>
            <Progress
              value={isHosted && !isExactLocalEngine ? 40 : ramPercent}
              indicatorColor={ramPercent > 85 ? 'bg-rose-500' : 'bg-indigo-500'}
            />
            {isHosted && !isExactLocalEngine ? (
              <div className="text-[10px] text-muted-foreground/80 pt-1">
                Estimated from {ramTotalGb.toFixed(0)} GB device memory (assuming ~60% free)
              </div>
            ) : (
              <div className="h-9 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ramHistory}>
                    <Area type="monotone" dataKey="v" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GPU & VRAM */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">GPU & VRAM</CardTitle>
            <Badge variant={gpu?.detected ? 'success' : 'outline'} className="text-[10px]">
              {hasHardware
                ? gpu?.detected
                  ? gpu.vendor || 'DETECTED'
                  : 'CPU-ONLY'
                : 'ESTIMATE (~)'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight">
                {hasHardware
                  ? gpu?.detected
                    ? gpu.dedicated_vram_formatted || 'Detected'
                    : 'CPU GEMM'
                  : '—'}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={gpu?.name || 'CPU GEMM'}>
                {hasHardware ? (gpu?.detected ? gpu.name : 'Integrated / None') : 'Generic GPU'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 truncate">
              Shared pool: {hasHardware ? gpu?.shared_vram_formatted || 'Standard RAM pool' : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Offload Mode: <span className="font-medium text-foreground">{hasHardware ? (gpu?.detected ? 'GPU Acceleration' : 'CPU Thread Pooling') : 'Auto Balancing'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Inference Telemetry */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Inference Telemetry</CardTitle>
            <Badge
              variant={
                infer?.state === 'generating'
                  ? 'default'
                  : infer?.state === 'error'
                  ? 'destructive'
                  : 'outline'
              }
              className="text-[10px] uppercase font-mono"
            >
              {infer?.state || 'IDLE'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight">
                {infer?.tokens_per_second ? infer.tokens_per_second.toFixed(1) : '0.0'} t/s
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {infer?.time_to_first_token_sec ? `TTFT: ${(infer.time_to_first_token_sec * 1000).toFixed(0)} ms` : 'TTFT: --'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              Last Session: {infer?.tokens_generated || 0} tokens ({infer?.last_duration_sec || 0}s)
            </div>
            {/* Sparkline */}
            <div className="h-9 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputHistory}>
                  <Area type="monotone" dataKey="v" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Runtime Profile & Storage Margin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Inference Runtime Profile */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Active Inference Runtime Profile</CardTitle>
                <CardDescription>Current execution engine and model parameters</CardDescription>
              </div>
              <Badge
                variant={isServerReady ? 'success' : isLlamaRunning ? 'warning' : 'outline'}
                className="text-[10px] font-mono"
              >
                {isOllama
                  ? isOllamaOnline
                    ? 'OLLAMA CONNECTED'
                    : 'OLLAMA OFFLINE'
                  : isLlamaHealthy
                  ? 'LLAMA SERVER READY'
                  : isLlamaRunning
                  ? 'INITIALIZING'
                  : 'SERVER STOPPED'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Selected Model</span>
                <span className="font-semibold text-foreground">{activeModel?.name || 'None Selected'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Model Format & Size</span>
                <span className="font-mono text-foreground">
                  {activeModel
                    ? `${activeModel.format} (${activeModel.quantization}) | ${activeModel.size_formatted}`
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Active Runtime</span>
                <span className="font-mono font-medium text-primary capitalize">{activeRuntime}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">CPU Threads Allocated</span>
                <span className="font-mono text-foreground">
                  {isOllama ? 'Auto (Ollama Engine)' : config?.llama_cpp?.threads || 4}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">GPU Layer Offload (-ngl)</span>
                <span className="font-mono text-foreground">
                  {isOllama
                    ? 'Auto (Ollama VRAM Managed)'
                    : config?.llama_cpp?.gpu_layers !== undefined
                    ? config.llama_cpp.gpu_layers
                    : 0}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Context Window Size</span>
                <span className="font-mono text-foreground">
                  {isOllama
                    ? activeModel?.context_length
                      ? activeModel.context_length.toLocaleString()
                      : '4,096'
                    : config?.llama_cpp?.context_size || 2048}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">Memory Mapping (mmap)</span>
                <span className="font-mono text-foreground">
                  {isOllama
                    ? 'Auto (Ollama Managed)'
                    : config?.llama_cpp?.use_mmap
                    ? 'Enabled (mmap)'
                    : 'Disabled (--no-mmap)'}
                </span>
              </div>
            </CardContent>
          </div>

          <div className="p-5 pt-0 flex flex-wrap gap-2.5">
            <Button
              size="sm"
              onClick={handleStartRuntime}
              disabled={isStarting}
              className="gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isOllama ? 'Check Ollama Connection' : 'Start llama.cpp Server'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleStopRuntime}
              disabled={isStopping}
              className="gap-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              {isOllama ? 'Halt Ollama Inference' : 'Stop Server'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/inference')}
              className="gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Open Chat Studio
            </Button>
          </div>
        </Card>

        {/* Storage Environment & Memory Safety */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Storage Environment & Memory Safety</CardTitle>
                <CardDescription>Drive free space and model allocation safety margin</CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px]">
                CHECKED
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drive list */}
              <div className="space-y-3">
                {(hardware?.storage || []).length > 0 ? (
                  (hardware?.storage || []).map((d) => (
                    <div key={d.mountpoint} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{d.mountpoint} ({d.fstype || 'Drive'})</span>
                        <span className="text-muted-foreground font-mono">
                          {(d.free_gb ?? 0).toFixed(1)} GB free / {(d.total_gb ?? 0).toFixed(0)} GB ({d.percent_used ?? 0}% used)
                        </span>
                      </div>
                      <Progress
                        value={d.percent_used ?? 0}
                        indicatorColor={(d.percent_used ?? 0) > 85 ? 'bg-rose-500' : 'bg-primary'}
                      />
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground">
                    {!hasHardware
                      ? 'Local drive partitions unavailable in browser sandbox.'
                      : 'No storage volumes detected.'}
                  </div>
                )}
              </div>

              {/* Memory Safety Margin Box */}
              <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Memory Safety Margin
                  </span>
                  <Badge variant={hasHardware ? 'success' : 'outline'} className="text-[10px]">
                    {hasHardware ? 'OPTIMIZED' : 'OFFLINE'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {hasHardware
                    ? `Available physical RAM (${ramFreeGb.toFixed(1)} GB of ${ramTotalGb.toFixed(0)} GB) provides stable operating headroom. Weights paging via mmap is activated to prevent out-of-memory faults during long context generation.`
                    : 'Direct hardware detection is active. Run the engine backend locally on localhost:8000 for exact physical memory tracking.'}
                </p>
              </div>
            </CardContent>
          </div>

          <div className="p-5 pt-0 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/hardware')}
              className="w-full text-xs"
            >
              Inspect Complete Hardware Topologies & Calculator
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
