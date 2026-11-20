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
  Globe,
  Zap,
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

export function HardwarePage() {
  const { showSuccess, showError } = useToast();
  const {
    hardware,
    models,
    activeModelId,
    config,
    refreshConfig,
    clientHardware,
    clientRuntimes,
    refreshClientDetection,
    isDetecting,
    isOriginLocal,
    isHosted,
    isExactLocalEngine,
    cpuScore,
    isBenchmarking,
    runSpeedTest,
  } = useEngine();

  // Calculator state
  const [selectedModelId, setSelectedModelId] = useState(activeModelId || '');
  const [contextLength, setContextLength] = useState(2048);
  const [recommendation, setRecommendation] = useState<any | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const hasHardware = Boolean(hardware || clientHardware);

  useEffect(() => {
    if (activeModelId && !selectedModelId) {
      setSelectedModelId(activeModelId);
    }
  }, [activeModelId, selectedModelId]);

  // Query configuration recommendation when model or context changes (if backend supports it)
  useEffect(() => {
    if (!selectedModelId || !isOriginLocal) return;
    api.recommendConfig(selectedModelId, contextLength)
      .then(setRecommendation)
      .catch((err) => console.warn('Recommendation calc error:', err.message));
  }, [selectedModelId, contextLength, isOriginLocal]);

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
            Direct browser capability detection, hardware topologies, and memory safety margins
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshClientDetection()}
            disabled={isDetecting}
            className="text-xs h-8 gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isDetecting && 'animate-spin')} />
            {isDetecting ? 'Detecting...' : 'Re-Detect Hardware'}
          </Button>

          <Badge
            variant={hasHardware ? 'success' : 'outline'}
            className="text-[10px] uppercase font-bold"
          >
            {isExactLocalEngine
              ? 'LOCAL ENGINE (EXACT)'
              : isOriginLocal
              ? 'LOCAL WORKSTATION'
              : 'BROWSER ESTIMATE (~)'}
          </Badge>
        </div>
      </div>

      {/* Hardware Profiles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Full Detected Hardware Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                Detected Hardware Topologies
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {isExactLocalEngine
                  ? 'LOCAL ENGINE'
                  : isOriginLocal
                  ? 'SYSTEM TELEMETRY'
                  : 'BROWSER ESTIMATES (~)'}
              </Badge>
            </div>
            <CardDescription>
              {isExactLocalEngine
                ? 'Exact physical hardware telemetry received from local engine daemon (127.0.0.1:8000)'
                : isOriginLocal
                ? 'Comprehensive system architecture and physical hardware telemetry'
                : 'Directly detected via WebGL unmasked renderer, deviceMemory, and engineering estimates (~)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Host Operating System / Platform</span>
              <span className="font-medium text-foreground">
                {hardware?.os?.system || clientHardware?.platform?.os || 'Detected Client'} ({hardware?.os?.machine || clientHardware?.cpu?.architecture || 'x86_64'})
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Browser Client</span>
              <span className="font-mono text-foreground">
                {clientHardware?.platform?.browser || 'Browser Sandbox'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Processor / Threads</span>
              <span className="font-medium text-foreground">
                {hardware?.cpu?.name || clientHardware?.cpu?.name || 'Host Processor'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Thread Topology</span>
              <span className="font-mono text-foreground">
                {hardware?.cpu?.physical_cores ? `~${hardware.cpu.physical_cores} Physical Cores ${isHosted && !isExactLocalEngine ? '(est.)' : ''} | ` : ''}
                {hardware?.cpu?.logical_threads || clientHardware?.cpu?.logical_threads || 1} Logical Threads
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">CPU Instruction Sets</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                {hardware?.cpu?.instruction_sets?.detected_list && hardware.cpu.instruction_sets.detected_list.length > 0 ? (
                  <div className="flex flex-wrap gap-1 justify-end">
                    {hardware.cpu.instruction_sets.detected_list.map((ins) => (
                      <Badge key={ins} variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 py-0">
                        {ins}
                      </Badge>
                    ))}
                    <Badge variant="success" className="text-[9px] py-0 font-normal">
                      Verified
                    </Badge>
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    {hardware?.cpu?.instruction_sets_formatted || 'Unavailable (Browser sandbox)'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-border">
              <span className="text-muted-foreground">Relative CPU Speed</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-foreground">
                  {cpuScore !== null ? `${cpuScore} Mops/s` : isBenchmarking ? 'Testing...' : 'Ready'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runSpeedTest()}
                  disabled={isBenchmarking}
                  className="h-6 px-2 text-[10px] gap-1"
                >
                  <Zap className={cn('w-3 h-3 text-amber-500', isBenchmarking && 'animate-spin')} />
                  {isBenchmarking ? 'Testing...' : 'Test Speed'}
                </Button>
              </div>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">System RAM</span>
              <span className="font-mono text-foreground">
                {hardware?.ram?.total_gb
                  ? `${hardware.ram.total_gb.toFixed(1)} GB (~${hardware.ram.available_gb.toFixed(1)} GB free ${isHosted && !isExactLocalEngine ? 'est.' : ''})`
                  : clientHardware?.ram?.total_formatted || 'Unavailable (Browser sandbox)'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Graphics Hardware (GPU)</span>
              <span className="font-medium text-foreground">
                {hardware?.gpu?.detected
                  ? hardware.gpu.name
                  : clientHardware?.gpu?.detected
                  ? clientHardware.gpu.name
                  : 'CPU / Integrated Graphics'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Dedicated VRAM</span>
              <span className="font-mono text-foreground">
                {hardware?.gpu?.dedicated_vram_formatted || clientHardware?.gpu?.dedicated_vram_formatted || (hardware?.gpu?.detected ? 'Shared / unknown' : 'Unavailable (CPU GEMM)')}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">WebGPU Acceleration</span>
              <span className="font-mono text-foreground">
                {clientHardware?.capabilities?.webgpu
                  ? `Supported (${clientHardware.webgpu.adapter_name || 'Hardware Device'})`
                  : 'Not Available in Current Browser'}
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
                  Detected {hardware?.cpu?.name || clientHardware?.cpu?.name} with {hardware?.cpu?.logical_threads || clientHardware?.cpu?.logical_threads || 4} threads.
                  {hardware?.gpu?.name?.includes('730') || clientHardware?.gpu?.name?.includes('730')
                    ? ' NVIDIA GeForce GT 730 detected. This Kepler-architecture GPU supports partial layer offloading, but unified CPU threading provides the dependable primary compute backbone.'
                    : hardware?.gpu?.detected || clientHardware?.gpu?.detected
                    ? ` GPU detected: ${hardware?.gpu?.name || clientHardware?.gpu?.name}. Hardware acceleration is available for supported runtimes.`
                    : ' No dedicated discrete GPU detected. Highly-optimized CPU thread pooling provides stable and dependable inference.'}
                </p>
              </div>

              {/* Browser Capabilities Checklist */}
              <div className="p-3.5 rounded-lg border border-border bg-card space-y-2">
                <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-primary" />
                  Client Browser Runtime Capabilities
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', clientHardware?.capabilities?.webassembly ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <span>WebAssembly (Wasm)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', clientHardware?.capabilities?.webgl2 ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <span>WebGL 2.0</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', clientHardware?.capabilities?.webgpu ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                    <span>WebGPU API</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', clientHardware?.capabilities?.web_workers ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <span>Web Workers</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Interactive Memory & Engine Parameter Calculator (Local Origin) */}
      {isOriginLocal && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Interactive Engine Parameter & Memory Safety Calculator
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                OFFLINE FORMULAE
              </Badge>
            </div>
            <CardDescription>
              Predicts working set RAM/VRAM allocations and determines exact optimal thread/layer parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Target Model Selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Select Evaluated Model</label>
                <Select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="text-xs"
                >
                  <option value="">Choose a model...</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.format} - {m.size_formatted})
                    </option>
                  ))}
                </Select>
              </div>

              {/* Target Context Window */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">Context Window Size</span>
                  <span className="font-mono text-muted-foreground">{contextLength} tokens</span>
                </div>
                <Slider
                  min={512}
                  max={8192}
                  step={512}
                  value={contextLength}
                  onValueChange={(val) => setContextLength(val)}
                />
              </div>
            </div>

            {/* Recommendation & Safety Results */}
            {recommendation && (
              <div className="pt-4 border-t border-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3.5 rounded-lg border border-border bg-card">
                    <div className="text-[11px] text-muted-foreground">Estimated Working Memory</div>
                    <div className="text-base font-bold font-mono text-foreground mt-0.5">
                      {safety?.working_memory_gb ? `${safety.working_memory_gb.toFixed(2)} GB` : '—'}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg border border-border bg-card">
                    <div className="text-[11px] text-muted-foreground">Available System RAM</div>
                    <div className="text-base font-bold font-mono text-foreground mt-0.5">
                      {safety?.available_ram_gb ? `${safety.available_ram_gb.toFixed(2)} GB` : '—'}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg border border-border bg-card">
                    <div className="text-[11px] text-muted-foreground">Memory Safety Status</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge
                        variant={isExceeds ? 'destructive' : isMarginal ? 'warning' : 'success'}
                        className="text-[10px] font-bold"
                      >
                        {safety?.safety_tier || 'SAFE'}
                      </Badge>
                    </div>
                  </div>
                </div>

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
      )}

      {/* Storage & Drives */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            Active Storage Partitions & Disk Space
          </CardTitle>
          <CardDescription>
            {isOriginLocal
              ? 'Physical drives available for local GGUF models and Ollama blobs'
              : 'Origin storage sandbox quota and local model storage availability'}
          </CardDescription>
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
          ) : clientHardware?.storage?.quota_formatted ? (
            <div className="p-4 rounded-lg border border-border bg-card space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span>{clientHardware.storage.label}</span>
                <Badge variant="outline" className="text-[10px]">Browser FS</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Estimated available origin quota: <span className="font-mono text-foreground font-medium">{clientHardware.storage.quota_formatted}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
              Storage partition details unavailable in browser sandbox. Run locally for physical disk inspection.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
