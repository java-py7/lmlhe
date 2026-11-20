import express from 'express';
import path from 'node:path';
import type {
  BenchmarkRecord,
  LocalHardwareProfile,
  RuntimeConfigInput,
} from '../shared/types.ts';
import {
  BASELINE_BENCHMARKS,
  GITHUB_PROJECTS,
  HARDWARE_CLASSES,
  MODELS,
  QUANTIZATIONS,
  RUNTIME_ENGINES,
} from './catalog.ts';
import {
  computeExecutionPlan,
  evaluateHardwareProfile,
  runDiagnosticsSuite,
} from './hal.ts';
import { getSystemHardwareProfile } from './hardware.ts';
import { DownloadManager } from './downloader.ts';
import { RuntimeManager } from './runtimeManager.ts';
import { TelemetryCollector } from './telemetry.ts';
import { executeBenchmarkRun } from './benchmarkRunner.ts';

// In-memory runtime state for engine
const benchmarks: BenchmarkRecord[] = [...BASELINE_BENCHMARKS];
const modelsDir = path.resolve(process.cwd(), 'models');
const downloadManager = new DownloadManager(modelsDir);
const runtimeManager = new RuntimeManager();
const telemetryCollector = new TelemetryCollector(runtimeManager);

let activeProfile: LocalHardwareProfile | null = null;

export function createServerApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // CORS and Headers middleware for robust communication
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    next();
  });

  const apiRouter = express.Router();

  // 1. Catalog API
  apiRouter.get('/catalog', (_req, res) => {
    res.json({
      projects: GITHUB_PROJECTS,
      runtimes: RUNTIME_ENGINES,
      models: MODELS,
      quantizations: QUANTIZATIONS,
      hardwareClasses: HARDWARE_CLASSES,
    });
  });

  // 2. Real System Hardware API (Native OS inspection)
  apiRouter.get('/hal/system-hardware', (_req, res) => {
    try {
      const profile = getSystemHardwareProfile();
      activeProfile = profile;
      res.json(profile);
    } catch (err: any) {
      console.error('System hardware inspection error:', err);
      res.status(500).json({ error: err.message || 'Failed to inspect system hardware' });
    }
  });

  // 3. HAL Hardware Profile Evaluation
  apiRouter.post('/hal/evaluate', (req, res) => {
    let profile = req.body?.profile as LocalHardwareProfile | undefined;
    if (!profile || typeof profile.cpuCores !== 'number') {
      profile = getSystemHardwareProfile();
    }
    activeProfile = profile;
    const evaluation = evaluateHardwareProfile(profile);
    res.json(evaluation);
  });

  // 4. HAL Execution Plan & Runtime Configurator
  apiRouter.post('/hal/plan', (req, res) => {
    let profile = req.body?.profile as LocalHardwareProfile | undefined;
    const config = req.body?.config as RuntimeConfigInput | undefined;
    if (!profile || typeof profile.cpuCores !== 'number') {
      profile = getSystemHardwareProfile();
    }
    if (!config) {
      res.status(400).json({ error: 'Runtime configuration input is required.' });
      return;
    }
    activeProfile = profile;
    const plan = computeExecutionPlan(profile, config);
    res.json(plan);
  });

  // 5. Benchmarks Registry & Real Benchmark Runner
  apiRouter.get('/benchmarks', (_req, res) => {
    res.json({ benchmarks });
  });

  apiRouter.post('/benchmarks/run', async (req, res) => {
    let profile = req.body?.profile as LocalHardwareProfile | undefined;
    const config = req.body?.config as RuntimeConfigInput | undefined;
    if (!profile || typeof profile.cpuCores !== 'number') {
      profile = getSystemHardwareProfile();
    }
    if (!config) {
      res.status(400).json({ error: 'Profile and runtime config are required to run a benchmark.' });
      return;
    }
    activeProfile = profile;

    try {
      const record = await executeBenchmarkRun(profile, config, runtimeManager);
      benchmarks.unshift(record);
      if (benchmarks.length > 50) benchmarks.pop();
      res.json({ record, benchmarks });
    } catch (err: any) {
      console.error('Benchmark execution error:', err);
      res.status(500).json({ error: err.message || 'Benchmark run failed' });
    }
  });

  // 6. Real Model Downloads Flow
  apiRouter.get('/runtime/downloads', (_req, res) => {
    res.json({ downloads: downloadManager.getTasks() });
  });

  apiRouter.post('/runtime/download', async (req, res) => {
    const { modelId, quantId, totalGB } = req.body as {
      modelId?: string;
      quantId?: string;
      totalGB?: number;
    };
    if (!modelId || !quantId) {
      res.status(400).json({ error: 'Valid modelId and quantId are required.' });
      return;
    }

    try {
      const task = await downloadManager.startDownload(modelId, quantId, totalGB);
      runtimeManager.appendLog('info', `Initiated artifact download for ${task.fileName} (${task.totalGB} GB).`);
      res.json({ task });
    } catch (err: any) {
      console.error('Download start error:', err);
      res.status(400).json({ error: err.message || 'Failed to start model download' });
    }
  });

  apiRouter.post('/runtime/download/:id/cancel', (req, res) => {
    const task = downloadManager.cancelDownload(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Download task not found.' });
      return;
    }
    runtimeManager.appendLog('warn', `Cancelled weight artifact download: ${task.fileName}.`);
    res.json({ task });
  });

  // 7. Runtime Launch, Stop, Status & Real Inference
  apiRouter.get('/runtime/status', (_req, res) => {
    res.json({
      session: runtimeManager.getSession(),
      stressLoadActive: runtimeManager.isStressLoadActive(),
    });
  });

  apiRouter.post('/runtime/launch', async (req, res) => {
    let profile = req.body?.profile as LocalHardwareProfile | undefined;
    const config = req.body?.config as RuntimeConfigInput | undefined;

    if (!profile || typeof profile.cpuCores !== 'number') {
      profile = getSystemHardwareProfile();
    }
    if (!config) {
      res.status(400).json({ error: 'Profile and config are required to launch runtime.' });
      return;
    }

    activeProfile = profile;
    const plan = computeExecutionPlan(profile, config);

    if (plan.validationStatus === 'exceeds-hardware') {
      res.status(422).json({
        error: 'Configuration exceeds detected local hardware memory or engine compatibility.',
        plan,
      });
      return;
    }

    try {
      const session = await runtimeManager.launch(plan, config);
      res.json({ session });
    } catch (err: any) {
      console.error('Runtime launch error:', err);
      res.status(500).json({ error: err.message || 'Failed to launch runtime' });
    }
  });

  apiRouter.post('/runtime/stop', async (_req, res) => {
    try {
      const session = await runtimeManager.stop();
      res.json({ session });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to stop runtime' });
    }
  });

  apiRouter.post('/runtime/stress', (req, res) => {
    const active = Boolean(req.body?.active);
    runtimeManager.setStressLoad(active);
    res.json({ stressLoadActive: active });
  });

  apiRouter.post('/runtime/infer', async (req, res) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'Prompt cannot be empty.' });
      return;
    }

    try {
      const result = await runtimeManager.runInference(prompt);
      res.json({
        ...result,
        session: runtimeManager.getSession(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Inference execution failed' });
    }
  });

  // 8. Real Live Telemetry SSE Stream
  apiRouter.get('/runtime/telemetry', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSample = () => {
      const sample = telemetryCollector.sample(activeProfile);
      res.write(`data: ${JSON.stringify(sample)}\n\n`);
    };

    sendSample();
    const timer = setInterval(sendSample, 1000);

    req.on('close', () => {
      clearInterval(timer);
    });
  });

  // 9. Diagnostics Suite API
  apiRouter.post('/diagnostics/run', (req, res) => {
    let profile = req.body?.profile as LocalHardwareProfile | undefined;
    const config = req.body?.config as RuntimeConfigInput | undefined;

    if (!profile || typeof profile.cpuCores !== 'number') {
      profile = getSystemHardwareProfile();
    }
    activeProfile = profile;

    const plan = config ? computeExecutionPlan(profile, config) : runtimeManager.getSession().plan;
    const report = runDiagnosticsSuite(profile, plan);
    res.json({ report });
  });

  // Mount router at both '/api' and '/' to ensure 100% compatibility with any Vercel rewrite scheme
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  return app;
}

const app = createServerApp();
export default app;
