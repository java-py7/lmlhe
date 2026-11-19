import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Database,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  CheckCircle2,
  Laptop,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { AgentDownloadCard } from '@/components/agent/AgentDownloadCard';

export function HardwarePage() {
  const { showSuccess, showError, showInfo } = useToast();
  const {
    hardware,
    models,
    activeModelId,
    config,
    refreshConfig,
    localAgent,
    checkLocalAgent,
    setLocalAgentUrl,
  } = useEngine();

  // Local agent URL input state
  const [agentUrlInput, setAgentUrlInput] = useState(localAgent.url || 'http://127.0.0.1:8008');
  const [isProbing, setIsProbing] = useState(false);

  // Calculator state
  const [selectedModelId, setSelectedModelId] = useState(activeModelId || '');
  const [contextLength, setContextLength] = useState(2048);
  const [recommendation, setRecommendation] = useState<any | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const hasHardware = Boolean(hardware);

  useEffect(() => {
    if (activeModelId && !selectedModelId) {
      setSelectedModelId(activeModelId);
    }
  }, [activeModelId, selectedModelId]);

  // Query configuration recommendation when model or context changes
  useEffect(() => {
    if (!selectedModelId) return;
    api.recommendConfig(selectedModelId, contextLength)
      .then(setRecommendation)
      .catch((err) => console.warn('Recommendation calc error:', err.message));
  }, [selectedModelId, contextLength]);

  const handleApplyConfig = async () => {
    if (!recommendation?.recommendations || !config) return;
    setIsApplying(true);
    try {
      const rec = recommendation.recommendations;
      const updatedConfig = {
        ...config,
        llama_cpp: {
          ...config.llama_cpp,
          threads: rec.threads,
          gpu_layers: rec.gpu_layers,
          context_size: rec.context_size,
          batch_size: rec.batch_size,
          ubatch_size: rec.ubatch_size,
          use_mmap: rec.use_mmap,
        },
      };
      await api.updateConfig(updatedConfig);
      await refreshConfig();
      showSuccess('Recommended execution parameters applied to configuration!');
    } catch (err: any) {
      showError(err.message || 'Failed to apply configuration');
    } finally {
      setIsApplying(false);
    }
  };

  const handleConnectAgent = async () => {
    setIsProbing(true);
    showInfo(`Probing local agent at ${agentUrlInput}...`);
    try {
      const ok = await checkLocalAgent(agentUrlInput.trim());
      if (ok) {
        showSuccess('Successfully connected to local PC agent!');
      } else {
        showError('Local agent not found. Ensure LMLHE-Agent.exe has been started on your computer.');
      }
    } catch (err: any) {
      showError(err.message || 'Connection failed');
    } finally {
      setIsProbing(false);
    }
  };

  // Safety margin evaluation
  const safety = recommendation?.safety_margin;
  const isExceeds = safety?.safety_tier === 'EXCEEDS';
  const isMarginal = safety?.safety_tier === 'MARGINAL';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Hardware Architecture & Engine Profiler
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Physical workstation topologies, memory allocation safety, and runtime telemetry
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={hasHardware ? 'success' : 'outline'}
            className="text-[10px] uppercase font-bold"
          >
            {hasHardware ? 'LOCAL WORKSTATION' : 'LOCAL AGENT OFFLINE'}
          </Badge>
        </div>
      </div>

      {/* If Local Agent is Offline, Show Standalone Installer Distribution Card */}
      {!hasHardware ? (
        <AgentDownloadCard />
      ) : (
        /* Physical Workstation Hardware Profiles & Bottlenecks */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Full Hardware Profile */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  Physical Hardware Topologies
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  LOCAL WORKSTATION
                </Badge>
              </div>
              <CardDescription>Comprehensive system architecture and physical hardware detection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Host Operating System</span>
                <span className="font-medium text-foreground">
                  {hardware?.os?.system} {hardware?.os?.release} ({hardware?.os?.machine})
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Python Runtime</span>
                <span className="font-mono text-foreground">Python {hardware?.os?.python_version}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Processor Brand</span>
                <span className="font-medium text-foreground">{hardware?.cpu?.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Core / Thread Topologies</span>
                <span className="font-mono text-foreground">
                  {hardware?.cpu?.physical_cores} Physical Cores | {hardware?.cpu?.logical_threads} Threads
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Processor Frequency</span>
                <span className="font-mono text-foreground">
                  {hardware?.cpu?.frequency_mhz?.current ? `${Math.round(hardware.cpu.frequency_mhz.current)} MHz` : 'Dynamic Base'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Total System RAM</span>
                <span className="font-mono text-foreground">
                  {(hardware?.ram?.total_gb ?? 0).toFixed(1)} GB ({(hardware?.ram?.available_gb ?? 0).toFixed(1)} GB available)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Graphics Hardware (GPU)</span>
                <span className="font-medium text-foreground">
                  {hardware?.gpu?.detected ? hardware.gpu.name : 'CPU / Integrated Graphics'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Dedicated VRAM</span>
                <span className="font-mono text-foreground">
                  {hardware?.gpu?.dedicated_vram_formatted || 'Unavailable (CPU GEMM)'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">Shared Video Memory Pool</span>
                <span className="font-mono text-foreground">
                  {hardware?.gpu?.shared_vram_formatted || 'Standard Host RAM'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Qualitative Bottleneck Analysis */}
          <Card className="flex flex-col justify-between">
            <div>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  Hardware Bottleneck Analysis
                </CardTitle>
                <CardDescription>Qualitative engineering assessment for local inference</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs leading-relaxed text-muted-foreground">
                <div className="p-3.5 rounded-lg border border-border bg-muted/30 text-foreground space-y-2">
                  <div className="font-semibold text-xs flex items-center gap-1.5 text-primary">
                    <ShieldCheck className="w-4 h-4" />
                    Compute & Memory Bus Architecture
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Detected {hardware?.cpu?.name} with {hardware?.cpu?.physical_cores} physical cores and {(hardware?.ram?.total_gb ?? 0).toFixed(1)} GB RAM.
                    {!hardware?.gpu?.detected || !hardware?.gpu?.dedicated_vram_bytes || hardware.gpu.dedicated_vram_bytes < 1024 * 1024 * 1024
                      ? ' No high-bandwidth discrete GPU detected. CPU GEMM execution with thread pooling provides the dependable, stable inference baseline.'
                      : hardware.gpu.dedicated_vram_bytes >= 6 * 1024 * 1024 * 1024
                      ? ` High-capacity discrete GPU (${hardware.gpu.name}) detected with ${hardware.gpu.dedicated_vram_formatted} VRAM. Full or extensive layer offloading is supported.`
                      : ` Mid-tier or legacy discrete GPU (${hardware.gpu.name}) detected with ${hardware.gpu.dedicated_vram_formatted} VRAM. Partial offloading is dynamically balanced to avoid PCIe bus stalls.`}
                  </p>
                </div>

                {/* Memory tier guidelines */}
                <div className="space-y-2 pt-1 text-[11px]">
                  <div className="font-medium text-foreground">Engine Inference Recommendations:</div>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground pl-1">
                    <li><strong>Quantization:</strong> Q4_K_M or Q4_0 provides the best balance of perplexity retention and cache efficiency.</li>
                    <li><strong>Thread Count:</strong> Set threads equal to physical core count ({hardware?.cpu?.physical_cores || 4}) to avoid hyperthreading context thrashing.</li>
                    <li><strong>Memory Paging:</strong> Always enable memory mapping (<code className="text-primary font-mono">--mmap</code>) to allow virtual memory offload.</li>
                  </ul>
                </div>
              </CardContent>
            </div>
          </Card>
        </div>
      )}

      {/* Memory Safety & Context Calculator */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Memory Safety & Context Window Calculator
              </CardTitle>
              <CardDescription>
                Simulate working memory requirements for different context lengths before execution
              </CardDescription>
            </div>
            {safety && (
              <Badge
                variant={isExceeds ? 'destructive' : isMarginal ? 'warning' : 'success'}
                className="text-[10px] uppercase font-mono self-start sm:self-auto"
              >
                {safety.safety_tier}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Controls row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-muted/20 border border-border">
            {/* Model Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Target Model</label>
              <Select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
              >
                {models.length > 0 ? (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.format} - {m.size_formatted})
                    </option>
                  ))
                ) : (
                  <option value="">No models discovered</option>
                )}
              </Select>
            </div>

            {/* Context Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Context Window Size</span>
                <span className="font-mono text-primary font-semibold">{contextLength.toLocaleString()} tokens</span>
              </div>
              <Slider
                min={512}
                max={32768}
                step={512}
                value={contextLength}
                onValueChange={setContextLength}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>512</span>
                <span>4,096</span>
                <span>8,192</span>
                <span>16,384</span>
                <span>32,768</span>
              </div>
            </div>
          </div>

          {/* Calculator Output Grid */}
          {recommendation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground block">Model Weights</span>
                  <span className="text-base font-bold font-mono text-foreground">
                    {(safety?.weights_memory_gb ?? 0).toFixed(2)} GB
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground block">KV Cache Buffer</span>
                  <span className="text-base font-bold font-mono text-foreground">
                    {(safety?.kv_cache_memory_gb ?? 0).toFixed(2)} GB
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground block">Total Working RAM</span>
                  <span className="text-base font-bold font-mono text-primary">
                    {(safety?.estimated_working_memory_gb ?? 0).toFixed(2)} GB
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground block">Available RAM</span>
                  <span className="text-base font-bold font-mono text-foreground">
                    {(hardware?.ram?.available_gb ?? 0).toFixed(1)} GB
                  </span>
                </div>
              </div>

              {/* Safety notice */}
              <div
                className={cn(
                  'p-3.5 rounded-lg border text-xs flex items-start gap-2.5',
                  isExceeds
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : isMarginal
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                )}
              >
                {isExceeds ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                )}
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    {isExceeds ? 'High Memory Safety Risk' : isMarginal ? 'Marginal Memory Safety' : 'Safe Operating Margin'}
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">{safety?.message}</p>
                </div>
              </div>

              {/* Recommended parameter buttons */}
              {recommendation.recommendations && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20">
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-foreground">Optimal Parameters for this Model & Context:</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      -t {recommendation.recommendations.threads} | -ngl {recommendation.recommendations.gpu_layers} | -c {recommendation.recommendations.context_size} | {recommendation.recommendations.use_mmap ? '--mmap' : '--no-mmap'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleApplyConfig}
                    disabled={isApplying}
                    className="shrink-0 text-xs"
                  >
                    Apply & Save Parameters
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage Partitions Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            Active Storage Partitions & Disk Space
          </CardTitle>
          <CardDescription>Verified drive space available for local GGUF models and Ollama blobs</CardDescription>
        </CardHeader>
        <CardContent>
          {(hardware?.storage || []).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {(hardware?.storage || []).map((d) => (
                <div key={d.mountpoint} className="p-3.5 rounded-lg border border-border bg-card space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>{d.mountpoint}</span>
                    <Badge variant="outline" className="text-[10px]">{d.fstype || 'Drive'}</Badge>
                  </div>
                  <Progress value={d.percent_used} indicatorColor={d.percent_used > 85 ? 'bg-rose-500' : 'bg-primary'} />
                  <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                    <span>{(d.free_gb ?? 0).toFixed(1)} GB free</span>
                    <span>{d.percent_used}% used</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
              Local storage partitions unavailable. Connect the local agent to inspect your PC's drives.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
