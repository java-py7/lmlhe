import React from 'react';
import {
  Activity,
  Cpu,
  Database,
  Thermometer,
  Zap,
  HardDrive,
  Clock,
  Layers,
  AlertCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useEngine } from '@/lib/context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export function MonitorPage() {
  const { metrics, hardware } = useEngine();

  const cpu = metrics?.cpu || hardware?.cpu;
  const ram = metrics?.ram || hardware?.ram;
  const gpu = metrics?.gpu || hardware?.gpu;
  const infer = metrics?.inference;

  const cpuPercent = Math.round(cpu?.utilization_percent || 0);
  const ramPercent = Math.round(ram?.utilization_percent || 0);

  const cpuHistory = metrics?.history?.cpu || [];
  const ramHistory = metrics?.history?.ram || [];
  const throughputHistory = metrics?.history?.throughput || [];

  // Combine CPU & RAM history for multi-line chart
  const combinedHistory = cpuHistory.map((pt, i) => ({
    time: i,
    cpu: pt.v,
    ram: ramHistory[i]?.v || 0,
  }));

  return (
    <div className="space-y-6">
      {/* 4 Primary Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">CPU Core Topologies</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              {cpu?.frequency_mhz?.current ? `${Math.round(cpu.frequency_mhz.current)} MHz` : 'Dynamic'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight">{cpuPercent}%</span>
              <span className="text-xs text-muted-foreground">{cpu?.physical_cores} Cores / {cpu?.logical_threads} Threads</span>
            </div>
            <Progress value={cpuPercent} indicatorColor={cpuPercent > 85 ? 'bg-rose-500' : 'bg-primary'} />
            {/* Per core breakdown */}
            {cpu?.per_core_percent && cpu.per_core_percent.length > 0 && (
              <div className="grid grid-cols-4 gap-1 pt-1 text-[10px] font-mono text-center">
                {cpu.per_core_percent.map((p, idx) => (
                  <div key={idx} className="p-1 rounded bg-muted/40 border border-border">
                    <span className="text-muted-foreground block text-[9px]">C{idx}</span>
                    <strong className="text-primary">{Math.round(p)}%</strong>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Physical Memory (RAM)</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              {ramPercent}%
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight">{ram?.used_gb?.toFixed(1) || '0.0'} GB</span>
              <span className="text-xs text-muted-foreground">of {ram?.total_gb?.toFixed(0) || '16'} GB</span>
            </div>
            <Progress value={ramPercent} indicatorColor={ramPercent > 85 ? 'bg-rose-500' : 'bg-indigo-500'} />
            <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
              <span>Free: <strong className="text-foreground">{ram?.available_gb?.toFixed(1) || '0.0'} GB</strong></span>
              <span>Swap: <strong className="text-foreground">{ram?.swap_used_bytes ? (ram.swap_used_bytes / (1024**3)).toFixed(1) : '0'} GB</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* GPU */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">GPU & VRAM Sensors</CardTitle>
            <Badge variant={gpu?.detected ? 'success' : 'outline'} className="text-[10px]">
              {gpu?.detected ? gpu.vendor || 'ONLINE' : 'CPU-ONLY'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight">
                {gpu?.detected ? gpu.dedicated_vram_formatted || 'Detected' : 'Unavailable'}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={gpu?.name}>
                {gpu?.name || 'CPU GEMM'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1 pt-1">
              <div className="flex justify-between">
                <span>GPU Utilization:</span>
                <span className="font-mono text-foreground">{gpu?.utilization_percent || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>GPU Core Temp:</span>
                <span className="font-mono text-foreground">{gpu?.temperature_celsius || 'Not supported'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inference Telemetry */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Inference Throughput</CardTitle>
            <Badge
              variant={
                infer?.state === 'generating'
                  ? 'default'
                  : infer?.state === 'error'
                  ? 'destructive'
                  : 'outline'
              }
              className="text-[10px] font-mono uppercase"
            >
              {infer?.state || 'IDLE'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight">
                {infer?.tokens_per_second ? infer.tokens_per_second.toFixed(1) : '0.0'} t/s
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {infer?.time_to_first_token_sec ? `TTFT: ${(infer.time_to_first_token_sec * 1000).toFixed(0)} ms` : 'TTFT: --'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1 pt-1">
              <div className="flex justify-between">
                <span>Prompt Eval Speed:</span>
                <span className="font-mono text-foreground">
                  {infer?.prompt_eval_tokens_per_second ? `${infer.prompt_eval_tokens_per_second.toFixed(1)} t/s` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Active Model:</span>
                <span className="font-mono text-foreground truncate max-w-[130px]">{infer?.model || 'None'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Recharts Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU & Memory Utilization Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Compute & Memory Load History (Last 30 Samples)
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> CPU
                </span>
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> RAM
                </span>
              </div>
            </div>
            <CardDescription>Live real-time utilization trend polled every 2000ms</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={combinedHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="ram" stroke="#6366f1" fill="url(#ramGrad)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Token Generation Throughput Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                Generation Throughput (Tokens / Sec)
              </CardTitle>
              <span className="font-mono text-xs font-semibold text-emerald-400">
                {infer?.tokens_per_second ? `${infer.tokens_per_second.toFixed(1)} t/s` : '0.0 t/s'}
              </span>
            </div>
            <CardDescription>Streaming generation speed sustained across tokens</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughputHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="toksGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="t" hide />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Area type="monotone" dataKey="v" stroke="#10b981" fill="url(#toksGrad)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Sensor Subsystems & Telemetry Readouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Active Hardware Sensors</CardTitle>
            <CardDescription>Telemetry sensors queryable from OS and device drivers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">CPU Temperature Sensor</span>
              <span className="font-mono text-foreground">
                {cpu?.temperature_supported ? `${cpu.temperature_celsius} °C` : 'Driver telemetry unsupported'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">GPU Temperature Sensor</span>
              <span className="font-mono text-foreground">{gpu?.temperature_celsius || 'Not supported'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">GPU Utilization Sensor</span>
              <span className="font-mono text-foreground">{gpu?.utilization_percent || 'Unavailable'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Active Storage Partitions</span>
              <span className="font-mono text-foreground">{(hardware?.storage || []).length} active drives</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Inference Engine Diagnostics</CardTitle>
            <CardDescription>Current runtime session parameters in engine memory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Inference Pipeline State</span>
              <span className="font-mono uppercase font-medium text-primary">{infer?.state || 'idle'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Active Model in Memory</span>
              <span className="font-semibold text-foreground truncate max-w-[200px]">{infer?.model || 'None'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">Time to First Token (TTFT)</span>
              <span className="font-mono text-foreground">
                {infer?.time_to_first_token_sec ? `${(infer.time_to_first_token_sec * 1000).toFixed(1)} ms` : 'Awaiting prompt'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Prompt Evaluation Throughput</span>
              <span className="font-mono text-foreground">
                {infer?.prompt_eval_tokens_per_second ? `${infer.prompt_eval_tokens_per_second.toFixed(1)} tokens/sec` : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
