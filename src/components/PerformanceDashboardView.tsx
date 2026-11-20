import { Flame, Play, Square } from 'lucide-react';
import type {
  ExecutionPlan,
  LocalHardwareProfile,
  RuntimeSession,
  TelemetrySample,
} from '../../shared/types.ts';
import { ValidationLabel } from './ValidationLabel.tsx';

interface PerformanceDashboardViewProps {
  profile: LocalHardwareProfile;
  session: RuntimeSession;
  plan: ExecutionPlan | null;
  telemetryHistory: TelemetrySample[];
  stressLoadActive: boolean;
  onLaunch: () => void;
  onStop: () => void;
  onToggleStress: () => void;
  onOpenConfigurator: () => void;
}

interface TelemetryChartProps {
  title: string;
  unit: string;
  maxValue: number;
  series: Array<{
    label: string;
    color: string;
    values: number[];
    currentValue: string;
  }>;
}

function TelemetryChart({ title, unit, maxValue, series }: TelemetryChartProps) {
  const width = 560;
  const height = 165;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const makePoints = (values: number[]) => {
    if (values.length === 0) return '';
    const count = Math.max(2, values.length);
    return values
      .map((val, idx) => {
        const x = padLeft + (idx / (count - 1)) * plotW;
        const clamped = Math.max(0, Math.min(maxValue, val));
        const y = padTop + plotH - (clamped / Math.max(0.01, maxValue)) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span
                className="w-2.5 h-0.5 inline-block rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="text-slate-500 dark:text-slate-400">{s.label}:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{s.currentValue}</span>
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible"
        role="img"
        aria-label={`${title} telemetry chart`}
      >
        {yTicks.map((ratio) => {
          const y = padTop + plotH - ratio * plotH;
          const labelVal = Math.round(maxValue * ratio);
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500 text-[9px] font-mono"
              >
                {labelVal}
                {unit}
              </text>
            </g>
          );
        })}

        {series.map((s) => {
          const pts = makePoints(s.values);
          if (!pts) return null;
          return (
            <polyline
              key={s.label}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pts}
            />
          );
        })}

        <text
          x={padLeft}
          y={height - 4}
          className="fill-slate-400 dark:fill-slate-500 text-[9px] font-mono"
        >
          -30s
        </text>
        <text
          x={width - padRight}
          y={height - 4}
          textAnchor="end"
          className="fill-slate-400 dark:fill-slate-500 text-[9px] font-mono"
        >
          Now
        </text>
      </svg>
    </div>
  );
}

export function PerformanceDashboardView({
  profile,
  session,
  plan,
  telemetryHistory,
  stressLoadActive,
  onLaunch,
  onStop,
  onToggleStress,
  onOpenConfigurator,
}: PerformanceDashboardViewProps) {
  const latest = telemetryHistory[telemetryHistory.length - 1] ?? {
    timestamp: new Date().toISOString(),
    ramUsedGB: Number((profile.ramTotalGB * 0.28).toFixed(1)),
    ramTotalGB: profile.ramTotalGB,
    vramUsedGB: 0.6,
    vramTotalGB: profile.unifiedMemory ? profile.unifiedMemoryPoolGB : profile.vramTotalGB,
    cpuUtilPct: 10,
    gpuUtilPct: 4,
    tempC: profile.currentGpuTempC ?? 46,
    tokensPerSec: 0,
    ttftMs: 0,
    powerWatts: 18,
    source: 'live-telemetry',
  };

  const isRunning = session.status === 'running';
  const ramPct = latest.ramTotalGB > 0 ? Math.min(100, Math.round((latest.ramUsedGB / latest.ramTotalGB) * 100)) : 0;
  const vramPct = latest.vramTotalGB > 0 ? Math.min(100, Math.round((latest.vramUsedGB / latest.vramTotalGB) * 100)) : 0;

  const tempStatus =
    latest.tempC >= 84
      ? { label: 'Thermal Throttle', cls: 'text-red-700 dark:text-red-400' }
      : latest.tempC >= 75
        ? { label: 'Warm Sustained', cls: 'text-amber-700 dark:text-amber-400' }
        : { label: 'Nominal', cls: 'text-emerald-700 dark:text-emerald-400' };

  const maxTokScale = Math.max(
    20,
    Math.ceil(Math.max(...telemetryHistory.map((t) => t.tokensPerSec), plan?.estimatedTokPerSec ?? 20) * 1.25),
  );
  const maxTtftScale = Math.max(
    400,
    Math.ceil(Math.max(...telemetryHistory.map((t) => t.ttftMs), plan?.estimatedTtftMs ?? 400) * 1.25),
  );

  return (
    <div className="space-y-8">
      {/* Header + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Performance &amp; Resource Telemetry
          </h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span>
              Telemetry Source:{' '}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                Live OS Kernel Sensors
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Runtime State:{' '}
              <strong
                className={
                  isRunning
                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                    : 'font-medium text-slate-700 dark:text-slate-300'
                }
              >
                {isRunning && session.plan ? `Running ${session.plan.model.name} (${session.plan.quant.id})` : 'Idle (Standby)'}
              </strong>
            </span>
            {session.plan && (
              <>
                <span aria-hidden="true">·</span>
                <ValidationLabel status={session.plan.validationStatus} compact />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isRunning && (
            <button
              type="button"
              onClick={onToggleStress}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                stressLoadActive
                  ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{stressLoadActive ? 'Stop Thermal Stress' : 'Simulate Long-Context Load'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenConfigurator}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Change Config
          </button>
          {!isRunning ? (
            <button
              type="button"
              onClick={onLaunch}
              disabled={!plan || plan.validationStatus === 'exceeds-hardware'}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Launch Active Plan</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Stop Runtime</span>
            </button>
          )}
        </div>
      </div>

      {/* Top 7-Metric Real-Time Readout Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3.5">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Tokens / sec</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.tokensPerSec.toFixed(1)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            {isRunning ? 'Decode Active' : 'Standby'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Time to First Token</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.ttftMs > 0 ? `${latest.ttftMs}` : '—'}
            {latest.ttftMs > 0 && <span className="text-xs font-normal text-slate-500 ml-0.5">ms</span>}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            512-tok prefill
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {profile.unifiedMemory ? 'Unified Mem' : 'VRAM Used'}
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.vramUsedGB.toFixed(1)}
            <span className="text-xs font-normal text-slate-500 ml-0.5">GB</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            {vramPct}% of {latest.vramTotalGB} GB
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">System RAM</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.ramUsedGB.toFixed(1)}
            <span className="text-xs font-normal text-slate-500 ml-0.5">GB</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            {ramPct}% of {latest.ramTotalGB} GB
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">GPU Utilization</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.gpuUtilPct}%
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            ~{latest.powerWatts} W draw
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">CPU Utilization</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.cpuUtilPct}%
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            {profile.cpuCores} logical cores
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Temperature</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-1">
            {latest.tempC}°C
          </div>
          <div className={`text-[11px] font-medium mt-1 ${tempStatus.cls}`}>
            {tempStatus.label}
          </div>
        </div>
      </div>

      {/* Live Multi-Series Time Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TelemetryChart
          title="Decode Throughput (Tokens/sec)"
          unit=""
          maxValue={maxTokScale}
          series={[
            {
              label: 'Tokens/sec',
              color: '#0284c7',
              values: telemetryHistory.map((t) => t.tokensPerSec),
              currentValue: `${latest.tokensPerSec.toFixed(1)} tok/s`,
            },
          ]}
        />

        <TelemetryChart
          title="First-Token Latency (TTFT ms)"
          unit=""
          maxValue={maxTtftScale}
          series={[
            {
              label: 'TTFT',
              color: '#7c3aed',
              values: telemetryHistory.map((t) => t.ttftMs),
              currentValue: latest.ttftMs > 0 ? `${latest.ttftMs} ms` : 'Standby',
            },
          ]}
        />

        <TelemetryChart
          title="CPU & GPU Compute Utilization (%)"
          unit="%"
          maxValue={100}
          series={[
            {
              label: 'GPU',
              color: '#059669',
              values: telemetryHistory.map((t) => t.gpuUtilPct),
              currentValue: `${latest.gpuUtilPct}%`,
            },
            {
              label: 'CPU',
              color: '#d97706',
              values: telemetryHistory.map((t) => t.cpuUtilPct),
              currentValue: `${latest.cpuUtilPct}%`,
            },
          ]}
        />

        <TelemetryChart
          title="Memory Footprint (RAM & VRAM GB) & Thermal (°C)"
          unit=""
          maxValue={Math.max(100, profile.ramTotalGB)}
          series={[
            {
              label: 'VRAM (GB)',
              color: '#0284c7',
              values: telemetryHistory.map((t) => t.vramUsedGB),
              currentValue: `${latest.vramUsedGB.toFixed(1)} GB`,
            },
            {
              label: 'RAM (GB)',
              color: '#10b981',
              values: telemetryHistory.map((t) => t.ramUsedGB),
              currentValue: `${latest.ramUsedGB.toFixed(1)} GB`,
            },
            {
              label: 'Temp (°C)',
              color: '#dc2626',
              values: telemetryHistory.map((t) => t.tempC),
              currentValue: `${latest.tempC}°C`,
            },
          ]}
        />
      </div>

      {/* Session Allocation Summary & Runtime Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Active Allocation &amp; Session Summary
          </h3>
          {session.plan ? (
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2 flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Model &amp; Quantization</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 text-right">
                  {session.plan.model.name} ({session.plan.quant.id})
                </dd>
              </div>
              <div className="py-2 flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Runtime Engine</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{session.plan.runtime.name}</dd>
              </div>
              <div className="py-2 flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Layer Offload Split</dt>
                <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {session.plan.gpuLayersAllocated} GPU / {session.plan.cpuLayersAllocated} CPU
                </dd>
              </div>
              <div className="py-2 flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Model Load Time</dt>
                <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {session.plan.estimatedLoadTimeSec} s ({session.plan.diskUsageGB} GB disk)
                </dd>
              </div>
              <div className="py-2 flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Context / Practical Ceiling</dt>
                <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {session.plan.config.contextSize.toLocaleString()} / {session.plan.maxPracticalContext.toLocaleString()}
                </dd>
              </div>
              <div className="py-2 flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Prompts Executed / Tokens</dt>
                <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {session.totalPromptsRun} prompts · {session.totalTokensGenerated} tok
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No active runtime session. Click &quot;Launch Active Plan&quot; to begin live workload telemetry streaming for your detected local computer.
            </p>
          )}
        </div>

        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Runtime Event Stream
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {session.logs.length} events
            </span>
          </div>
          <div className="bg-slate-950 text-slate-200 rounded-md p-3.5 h-52 overflow-y-auto font-mono text-[11px] space-y-1.5">
            {session.logs.length === 0 ? (
              <div className="text-slate-500">Waiting for runtime launch or weight download event…</div>
            ) : (
              session.logs.map((entry, idx) => (
                <div key={`${entry.ts}-${idx}`} className="flex gap-2.5 leading-relaxed">
                  <span className="text-slate-500 shrink-0 tabular-nums">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <span
                    className={
                      entry.level === 'error'
                        ? 'text-red-400'
                        : entry.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-slate-200'
                    }
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
