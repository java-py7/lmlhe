import fs from 'node:fs';
import path from 'node:path';
import type { DownloadTask, ModelSpec, QuantizationSpec } from '../shared/types.ts';
import { MODELS, QUANTIZATIONS } from './catalog.ts';

export class DownloadManager {
  private tasks = new Map<string, DownloadTask>();
  private abortControllers = new Map<string, AbortController>();
  private modelsDir: string;

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir;
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  async startDownload(modelId: string, quantId: string, userTotalGB?: number): Promise<DownloadTask> {
    const model = MODELS.find((m) => m.id === modelId);
    const quant = QUANTIZATIONS.find((q) => q.id === quantId);

    if (!model || !quant) {
      throw new Error(`Invalid model (${modelId}) or quantization (${quantId}) requested.`);
    }

    // Check if an existing task is already running
    const existing = Array.from(this.tasks.values()).find(
      (t) => t.modelId === model.id && t.quantId === quant.id && (t.status === 'downloading' || t.status === 'completed')
    );
    if (existing) {
      return existing;
    }

    const quantLower = quant.id.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const fileName = `${model.id}-${quantLower}.gguf`;
    const localPath = path.join(this.modelsDir, fileName);

    // If file already exists and has size > 1MB, mark completed
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      if (stat.size > 1024 * 1024) {
        const sizeGB = Math.round((stat.size / 1e9) * 100) / 100;
        const completedTask: DownloadTask = {
          id: `dl-${Date.now()}`,
          modelId: model.id,
          modelName: model.name,
          quantId: quant.id,
          fileName,
          totalGB: sizeGB,
          downloadedGB: sizeGB,
          progressPct: 100,
          speedMBs: 0,
          status: 'completed',
          startedAt: new Date().toISOString(),
          localPath,
        };
        this.tasks.set(completedTask.id, completedTask);
        return completedTask;
      }
    }

    const estimatedGB =
      typeof userTotalGB === 'number' && userTotalGB > 0
        ? Number(userTotalGB.toFixed(2))
        : Number((((model.paramsB * quant.bitsPerWeight) / 8) * 1.07).toFixed(2));

    const task: DownloadTask = {
      id: `dl-${Date.now()}`,
      modelId: model.id,
      modelName: model.name,
      quantId: quant.id,
      fileName,
      totalGB: estimatedGB,
      downloadedGB: 0,
      progressPct: 0,
      speedMBs: 0,
      status: 'downloading',
      startedAt: new Date().toISOString(),
      localPath,
    };

    this.tasks.set(task.id, task);

    // Construct download candidates from Hugging Face
    // Model repo e.g. "bartowski/Llama-3.2-1B-Instruct-GGUF"
    const repo = model.huggingfaceRepo;
    const quantSuffix = quant.id.toUpperCase();
    
    // Common Hugging Face file naming variants
    const hfFileNameCandidates = [
      `${model.name.replace(/\s+/g, '-')}-${quantSuffix}.gguf`,
      `${model.id}-${quantSuffix}.gguf`,
      `${model.id.replace(/-/g, '_')}-${quantSuffix}.gguf`,
      `${model.id}-${quantLower}.gguf`,
    ];

    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);

    // Run async download stream
    this.executeStreamDownload(task, repo, hfFileNameCandidates, controller).catch((err) => {
      if (controller.signal.aborted || err.name === 'AbortError') {
        return;
      }
      console.error(`Download error for ${task.fileName}:`, err);
      task.status = 'failed';
      task.errorMessage = err.message || 'Download stream interrupted';
      task.speedMBs = 0;
    });

    return task;
  }

  cancelDownload(id: string): DownloadTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }

    task.status = 'cancelled';
    task.speedMBs = 0;

    // Clean up partial file
    const partPath = `${task.localPath}.part`;
    if (fs.existsSync(partPath)) {
      try {
        fs.unlinkSync(partPath);
      } catch {
        // ignore
      }
    }

    return task;
  }

  private async executeStreamDownload(
    task: DownloadTask,
    repo: string,
    candidates: string[],
    controller: AbortController
  ): Promise<void> {
    const partPath = `${task.localPath}.part`;
    let response: Response | null = null;
    let chosenUrl = '';

    // First try the candidates
    for (const cand of candidates) {
      if (controller.signal.aborted) return;
      const url = `https://huggingface.co/${repo}/resolve/main/${cand}`;
      try {
        const head = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal,
        });
        if (head.ok) {
          chosenUrl = url;
          const contentLength = head.headers.get('content-length');
          if (contentLength) {
            task.totalGB = Math.round((Number(contentLength) / 1e9) * 100) / 100;
          }
          break;
        }
      } catch {
        // Continue to next candidate
      }
    }

    // Fallback: If no candidate HEAD succeeded, query Hugging Face API for exact file list
    if (!chosenUrl && !controller.signal.aborted) {
      try {
        const apiRes = await fetch(`https://huggingface.co/api/models/${repo}`, {
          signal: controller.signal,
        });
        if (apiRes.ok) {
          const info = await apiRes.json();
          const siblings: { rfilename: string }[] = info.siblings || [];
          const qUpper = task.quantId.toUpperCase().replace(/_/g, '');
          const match = siblings.find((s) => {
            const clean = s.rfilename.toUpperCase().replace(/_/g, '');
            return clean.endsWith('.GGUF') && clean.includes(qUpper);
          }) || siblings.find((s) => s.rfilename.endsWith('.gguf'));

          if (match) {
            chosenUrl = `https://huggingface.co/${repo}/resolve/main/${match.rfilename}`;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!chosenUrl) {
      throw new Error(`Weight artifact not found on Hugging Face repository (${repo}).`);
    }

    // Begin stream
    response = await fetch(chosenUrl, {
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch artifact from ${chosenUrl}: HTTP ${response.status}`);
    }

    const totalBytes = Number(response.headers.get('content-length')) || task.totalGB * 1e9;
    task.totalGB = Math.round((totalBytes / 1e9) * 100) / 100;

    const fileStream = fs.createWriteStream(partPath);
    const reader = response.body.getReader();

    let downloadedBytes = 0;
    let lastTime = Date.now();
    let bytesSinceLastTick = 0;

    while (true) {
      if (controller.signal.aborted) {
        fileStream.close();
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        fileStream.write(Buffer.from(value));
        downloadedBytes += value.byteLength;
        bytesSinceLastTick += value.byteLength;

        const now = Date.now();
        const delta = now - lastTime;
        if (delta >= 500) {
          const speedBytesPerSec = (bytesSinceLastTick / delta) * 1000;
          task.speedMBs = Math.round((speedBytesPerSec / (1024 * 1024)) * 10) / 10;
          task.downloadedGB = Math.round((downloadedBytes / 1e9) * 100) / 100;
          task.progressPct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));

          bytesSinceLastTick = 0;
          lastTime = now;
        }
      }
    }

    fileStream.end();

    // Verify and rename
    if (fs.existsSync(partPath)) {
      fs.renameSync(partPath, task.localPath);
      task.status = 'completed';
      task.downloadedGB = task.totalGB;
      task.progressPct = 100;
      task.speedMBs = 0;
    }
  }
}
