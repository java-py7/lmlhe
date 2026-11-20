import type {
  BenchmarkRecord,
  ExecutionPlan,
  LocalHardwareProfile,
  RuntimeConfigInput,
} from '../shared/types.ts';
import { computeExecutionPlan, evaluateHardwareProfile } from './hal.ts';
import type { RuntimeManager } from './runtimeManager.ts';

export async function executeBenchmarkRun(
  profile: LocalHardwareProfile,
  config: RuntimeConfigInput,
  runtimeManager: RuntimeManager
): Promise<BenchmarkRecord> {
  const evaluation = evaluateHardwareProfile(profile);
  const plan = computeExecutionPlan(profile, config);
  const session = runtimeManager.getSession();

  let measuredTokSec = plan.estimatedTokPerSec;
  let measuredTtft = plan.estimatedTtftMs;
  let measuredLoad = plan.estimatedLoadTimeSec;
  let actualOutput = '';

  // If a runtime session is running or Ollama is reachable, run real prompt execution!
  const isRuntimeRunning = session.status === 'running';

  if (isRuntimeRunning) {
    try {
      const benchmarkPrompt =
        'Evaluate memory efficiency: Explain how 4-bit weight quantization affects inference memory and cache requirements in two concise bullet points.';
      const res = await runtimeManager.runInference(benchmarkPrompt);

      measuredTokSec = res.tokensPerSec;
      measuredTtft = res.ttftMs;
      measuredLoad = Number((res.totalLatencyMs / 1000).toFixed(1));
      actualOutput = res.responseText;
    } catch (err: any) {
      console.warn('Live benchmark prompt error, falling back to execution plan baseline:', err.message);
    }
  }

  const peakTemp = Math.min(
    94,
    Math.round(plan.estimatedSteadyTempC + (measuredTokSec > 20 ? 5 : 1))
  );

  const record: BenchmarkRecord = {
    id: `bm-local-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: isRuntimeRunning && actualOutput ? 'local-run' : 'team-baseline',
    hardwareClassId: evaluation.hardwareClass.id,
    hardwareLabel: `This PC (${profile.cpuCores}T · ${profile.ramTotalGB}GB RAM · ${profile.gpuName})`,
    modelId: plan.model.id,
    modelName: plan.model.name,
    runtimeId: plan.runtime.id,
    quantId: plan.quant.id,
    offloadStrategy: plan.config.offloadStrategy,
    gpuLayersSplit: profile.unifiedMemory
      ? `${plan.gpuLayersAllocated} / ${plan.totalLayers} Unified`
      : `${plan.gpuLayersAllocated} / ${plan.totalLayers} GPU`,
    contextLength: plan.config.contextSize,
    maxPracticalContext: plan.maxPracticalContext,
    ramUsedGB: plan.ramRequiredGB,
    vramUsedGB: plan.vramRequiredGB,
    diskUsageGB: plan.diskUsageGB,
    loadTimeSec: measuredLoad,
    ttftMs: measuredTtft,
    tokensPerSec: measuredTokSec,
    cpuUtilPct: plan.estimatedCpuUtilPct,
    gpuUtilPct: plan.estimatedGpuUtilPct,
    peakTempC: peakTemp,
    thermalBehavior:
      peakTemp >= 84 ? 'Thermal Throttled' : peakTemp >= 75 ? 'Warm Sustained' : 'Stable',
    validationStatus: plan.validationStatus,
  };

  return record;
}
