import { useMemo, useState } from 'react';
import { ArrowUpDown, Play } from 'lucide-react';
import type {
  BenchmarkRecord,
  HalEvaluationResult,
  HardwareClassSpec,
  ModelSpec,
  RuntimeConfigInput,
} from '../../shared/types.ts';
import { ValidationLabel } from './ValidationLabel.tsx';

interface BenchmarksViewProps {
  benchmarks: BenchmarkRecord[];
  hardwareClasses: HardwareClassSpec[];
  evaluation: HalEvaluationResult | null;
  models: ModelSpec[];
  currentConfig: RuntimeConfigInput;
  isRunningBenchmark: boolean;
  onRunBenchmark: () => void;
}

type SortKey = 'tokensPerSec' | 'ttftMs' | 'vramUsedGB' | 'ramUsedGB' | 'loadTimeSec' | 'maxPracticalContext';

export function BenchmarksView({
  benchmarks,
  hardwareClasses,
  evaluation,
  currentConfig,
  models,
  isRunningBenchmark,
  onRunBenchmark,
}: BenchmarksViewProps) {
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'team-baseline' | 'local-run'>('all');
  const [validationFilter, setValidationFilter] = useState<'all' | 'team-validated' | 'experimental'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('tokensPerSec');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortBy(key);
      setSortAsc(key === 'ttftMs' || key === 'loadTimeSec');
    }
  };

  const filteredBenchmarks = useMemo(() => {
    return benchmarks
      .filter((b) => {
        if (classFilter !== 'all' && b.hardwareClassId !== classFilter) return false;
        if (sourceFilter !== 'all' && b.source !== sourceFilter) return false;
        if (validationFilter !== 'all' && b.validationStatus !== validationFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const diff = a[sortBy] - b[sortBy];
        return sortAsc ? diff : -diff;
      });
  }, [benchmarks, classFilter, sourceFilter, validationFilter, sortBy, sortAsc]);

  const currentModelName =
    models.find((m) => m.id === currentConfig.modelId)?.name ?? currentConfig.modelId;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Quantization, Offloading Benchmarks &amp; Hardware Class Limits
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Measured RAM, VRAM, disk usage, load time, TTFT, tokens/sec, maximum practical context length, and thermal behaviour across quantization and offloading strategies.
          </p>
        </div>

        <button
          type="button"
          onClick={onRunBenchmark}
          disabled={isRunningBenchmark}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 self-start lg:self-auto cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {isRunningBenchmark
              ? 'Running Local Profile Benchmark…'
              : `Benchmark ${currentModelName} (${currentConfig.quantId})`}
          </span>
        </button>
      </div>

      {/* Section 1: Hardware Class Capacity Matrix (Largest Useful Model per Hardware Class) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Largest Practically Executable Model by Hardware Class
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your detected local computer is highlighted below. Distinguishes Team-Validated daily-driver limits from Experimentally Possible offload ceilings.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                  <th className="py-2.5 px-4">Hardware Class</th>
                  <th className="py-2.5 px-3">Largest Team-Validated</th>
                  <th className="py-2.5 px-3">Largest Experimental (Offload)</th>
                  <th className="py-2.5 px-3">Recommended Engine</th>
                  <th className="py-2.5 px-3 text-right">Practical Context</th>
                  <th className="py-2.5 px-4">Throughput &amp; Thermal Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {hardwareClasses.map((hc) => {
                  const isUserClass = evaluation?.hardwareClass.id === hc.id;
                  return (
                    <tr
                      key={hc.id}
                      className={
                        isUserClass
                          ? 'bg-blue-50/80 dark:bg-sky-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span>{hc.name}</span>
                          {isUserClass && (
                            <span className="text-[11px] font-mono text-blue-700 dark:text-sky-400">
                              (Your PC)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {hc.typicalSpecs}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-emerald-700 dark:text-emerald-400">
                          {hc.largestValidatedModel}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {hc.largestValidatedQuant}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-amber-700 dark:text-amber-400">
                          {hc.largestExperimentalModel}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {hc.largestExperimentalQuant}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {hc.recommendedRuntime}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {hc.practicalContextCeiling.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                          {hc.expectedTokPerSec}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {hc.thermalNotes}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 2: Quantization & Offloading Benchmark Table */}
      <section className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Benchmark Results Matrix ({filteredBenchmarks.length} runs)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click column headers to sort. Run a benchmark above to append calibrated results for your exact local PC configuration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Hardware Classes</option>
              {hardwareClasses.map((hc) => (
                <option key={hc.id} value={hc.id}>
                  {hc.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-md">
              {(['all', 'team-baseline', 'local-run'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    sourceFilter === src
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {src === 'all' ? 'All Runs' : src === 'team-baseline' ? 'Team Baselines' : 'This PC Runs'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-md">
              {(['all', 'team-validated', 'experimental'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setValidationFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    validationFilter === st
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {st === 'all' ? 'Any Status' : st === 'team-validated' ? 'Validated' : 'Experimental'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                  <th className="py-2.5 px-4">Model · Runtime · Quant</th>
                  <th className="py-2.5 px-3">Hardware &amp; Offload</th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('tokensPerSec')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>tok/s</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('ttftMs')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>TTFT</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('loadTimeSec')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>Load</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('vramUsedGB')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>VRAM / RAM / Disk</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('maxPracticalContext')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>Max Ctx</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">CPU / GPU / Temp</th>
                  <th className="py-2.5 px-4">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredBenchmarks.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.source === 'local-run'
                        ? 'bg-blue-50/50 dark:bg-sky-950/25'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {row.modelName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {row.runtimeId} · {row.quantId}
                        {row.source === 'local-run' ? ' · Local Run' : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[220px]">
                      <div className="text-slate-700 dark:text-slate-300 truncate" title={row.hardwareLabel}>
                        {row.hardwareLabel}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {row.offloadStrategy} ({row.gpuLayersSplit})
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
                      {row.tokensPerSec.toFixed(1)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {row.ttftMs} ms
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {row.loadTimeSec} s
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {row.vramUsedGB} / {row.ramUsedGB} / {row.diskUsageGB} GB
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {(row.maxPracticalContext / 1024).toFixed(0)}K
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-700 dark:text-slate-300">
                        {row.cpuUtilPct}% / {row.gpuUtilPct}% · {row.peakTempC}°C
                      </div>
                      <div
                        className={`text-[11px] font-sans ${
                          row.thermalBehavior === 'Thermal Throttled'
                            ? 'text-red-600 dark:text-red-400'
                            : row.thermalBehavior === 'Warm Sustained'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {row.thermalBehavior}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <ValidationLabel status={row.validationStatus} compact />
                    </td>
                  </tr>
                ))}
                {filteredBenchmarks.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      No benchmark runs match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
