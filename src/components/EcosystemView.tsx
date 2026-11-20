import { useMemo, useState } from 'react';
import { Code2, ExternalLink, Search } from 'lucide-react';
import type {
  GitHubProject,
  HalEvaluationResult,
  LocalHardwareProfile,
  RuntimeId,
} from '../../shared/types.ts';
import { ValidationLabel } from './ValidationLabel.tsx';

interface EcosystemViewProps {
  projects: GitHubProject[];
  profile: LocalHardwareProfile;
  evaluation: HalEvaluationResult | null;
  onSelectRuntimeForConfig: (runtimeId: RuntimeId) => void;
}

export function EcosystemView({
  projects,
  profile,
  evaluation,
  onSelectRuntimeForConfig,
}: EcosystemViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showHalPayload, setShowHalPayload] = useState(false);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      const q = search.trim().toLowerCase();
      if (
        q &&
        !`${p.name} ${p.repo} ${p.summary} ${p.quantizationFormats.join(' ')} ${p.targetHardware}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [projects, search, categoryFilter]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Constrained-Hardware Runtimes, GitHub Projects &amp; Project 3 HAL
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Backend evaluation of open-source inference engines (llama.cpp, MLC LLM, ExLlamaV2, vLLM, TensorRT-LLM, MLX-LM, KTransformers) automatically scored against your detected local computer.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowHalPayload((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto cursor-pointer"
        >
          <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showHalPayload ? 'Hide HAL JSON Payload' : 'Inspect Live HAL API'}</span>
        </button>
      </div>

      {/* Optional Live Project 3 HAL Architecture & JSON Contract Inspector */}
      {showHalPayload && evaluation && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Project 3 Hardware / Runtime Abstraction Layer (HAL) Endpoints
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                REST contract translating client-detected local computer profiles into normalized runtime execution plans.
              </p>
            </div>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              POST /api/hal/evaluate · POST /api/hal/plan · POST /api/diagnostics/run
            </div>
          </div>
          <pre className="text-[11px] font-mono bg-slate-950 text-slate-200 p-4 rounded-md overflow-x-auto max-h-72 leading-relaxed">
            {JSON.stringify(
              {
                detectedLocalHardware: {
                  detectionSource: profile.detectionSource,
                  cpu: `${profile.cpuModel} (${profile.cpuCores}T)`,
                  gpu: `${profile.gpuName} (${profile.gpuVendor})`,
                  ramTotalGB: profile.ramTotalGB,
                  vramTotalGB: profile.vramTotalGB,
                  unifiedMemory: profile.unifiedMemory,
                  diskAvailableGB: profile.diskAvailableGB,
                },
                halClassification: {
                  hardwareClass: evaluation.hardwareClass.id,
                  recommendedRuntime: evaluation.recommendedRuntimeId,
                  usableVramGB: evaluation.usableVramGB,
                  usableRamGB: evaluation.usableRamGB,
                  largestValidatedModel: evaluation.largestValidatedModel,
                  largestExperimentalModel: evaluation.largestExperimentalModel,
                },
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}

      {/* Section 1: Runtime Engine Compatibility Matrix for THIS Local Computer */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Engine Evaluation for Your Detected PC ({profile.gpuName})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evaluates universal constrained-hardware engines alongside GPU-oriented runtimes (vLLM, TensorRT-LLM, ExLlamaV2) where local hardware permits.
          </p>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                  <th className="py-2.5 px-4">Runtime Engine</th>
                  <th className="py-2.5 px-3">Supported Quants</th>
                  <th className="py-2.5 px-3">Offloading</th>
                  <th className="py-2.5 px-3 text-right">Base Overhead</th>
                  <th className="py-2.5 px-3">Local PC Fit</th>
                  <th className="py-2.5 px-4">Evaluation &amp; Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {(evaluation?.runtimes ?? []).map((item) => (
                  <tr
                    key={item.engine.id}
                    className={
                      item.recommended
                        ? 'bg-blue-50/50 dark:bg-sky-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.engine.name}
                        {item.recommended && (
                          <span className="ml-2 text-[11px] font-mono text-blue-700 dark:text-sky-400">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {item.engine.repo}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 max-w-[180px]">
                      {item.engine.supportedQuants.join(', ')}
                    </td>
                    <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {item.engine.supportsHybridOffload
                        ? 'Hybrid GPU + CPU'
                        : item.engine.supportsCpuOnly
                          ? 'CPU / GPU'
                          : 'GPU-Resident Only'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {item.estimatedOverheadGB} GB
                    </td>
                    <td className="py-3.5 px-3">
                      <ValidationLabel status={item.effectiveValidation} compact />
                    </td>
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.compatibilityReason}
                      </div>
                      {item.compatible && (
                        <button
                          type="button"
                          onClick={() => onSelectRuntimeForConfig(item.engine.id)}
                          className="mt-1.5 text-xs font-medium text-blue-700 dark:text-sky-400 hover:underline cursor-pointer"
                        >
                          Use in Runtime Configurator →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 2: Curated GitHub Constrained-Hardware Projects Registry */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Identified GitHub Projects for Constrained-Hardware Inference ({filteredProjects.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Backend team evaluation covering quantization formats, layer offloading mechanisms, strengths, and deployment trade-offs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search GitHub projects…"
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Categories</option>
              <option value="constrained-edge">Constrained / Edge Universal</option>
              <option value="gpu-high-throughput">GPU High-Throughput</option>
              <option value="hybrid-moe">Hybrid MoE / Low-Bit Offload</option>
              <option value="apple-silicon">Apple Silicon Native</option>
              <option value="disk-offload">Disk Layer Streaming</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-900 dark:text-slate-50 hover:text-blue-700 dark:hover:text-sky-400 transition-colors"
                    >
                      <span>{project.name}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    </a>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      <span>{project.repo}</span>
                      <span aria-hidden="true">·</span>
                      <span>{project.language}</span>
                      <span aria-hidden="true">·</span>
                      <span>{project.starsApprox} stars</span>
                    </div>
                  </div>
                  <ValidationLabel status={project.validationStatus} compact />
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {project.summary}
                </p>

                <dl className="space-y-1.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div>
                    <dt className="inline font-medium text-slate-500 dark:text-slate-400">Quantization: </dt>
                    <dd className="inline font-mono text-[11px] text-slate-800 dark:text-slate-200">
                      {project.quantizationFormats.join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-500 dark:text-slate-400">Offloading: </dt>
                    <dd className="inline text-slate-700 dark:text-slate-300">{project.offloadingSupport}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-500 dark:text-slate-400">Target Hardware: </dt>
                    <dd className="inline text-slate-700 dark:text-slate-300">{project.targetHardware}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-emerald-700 dark:text-emerald-400">Strengths: </dt>
                    <dd className="inline text-slate-700 dark:text-slate-300">{project.strengths}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-amber-700 dark:text-amber-400">Trade-offs: </dt>
                    <dd className="inline text-slate-700 dark:text-slate-300">{project.tradeoffs}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
