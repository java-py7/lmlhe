import { ChildProcess, spawn } from 'node:child_process';
import type { ExecutionPlan, RuntimeConfigInput, RuntimeSession } from '../shared/types.ts';

export interface InferenceResult {
  promptTokens: number;
  completionTokens: number;
  ttftMs: number;
  tokensPerSec: number;
  totalLatencyMs: number;
  responseText: string;
}

export class RuntimeManager {
  private activeProcess: ChildProcess | null = null;
  private currentSession: RuntimeSession;
  private stressLoadActive: boolean = false;

  constructor() {
    this.currentSession = {
      id: 'session-idle',
      status: 'idle',
      startedAt: null,
      stoppedAt: null,
      executionMode: 'native',
      endpointUrl: 'http://127.0.0.1:8080/v1',
      plan: null,
      totalPromptsRun: 0,
      totalTokensGenerated: 0,
      lastTtftMs: null,
      lastTokPerSec: null,
      logs: [],
    };
  }

  getSession(): RuntimeSession {
    return this.currentSession;
  }

  isStressLoadActive(): boolean {
    return this.stressLoadActive;
  }

  setStressLoad(active: boolean): void {
    this.stressLoadActive = active;
    this.appendLog(
      active ? 'warn' : 'info',
      active
        ? 'Thermal stress test initiated (continuous context decoding).'
        : 'Thermal stress test concluded.'
    );
  }

  appendLog(level: 'info' | 'warn' | 'error', message: string): void {
    this.currentSession.logs.push({
      ts: new Date().toISOString(),
      level,
      message,
    });
    if (this.currentSession.logs.length > 100) {
      this.currentSession.logs.shift();
    }
  }

  async launch(plan: ExecutionPlan, config: RuntimeConfigInput): Promise<RuntimeSession> {
    // If a session was running, stop it first
    if (this.currentSession.status === 'running') {
      await this.stop();
    }

    const runtimeId = plan.runtime.id;
    let endpointUrl = `http://127.0.0.1:${plan.runtime.defaultPort}`;

    this.currentSession = {
      id: `run-${Date.now()}`,
      status: 'running',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      executionMode: 'native',
      endpointUrl,
      plan,
      totalPromptsRun: 0,
      totalTokensGenerated: 0,
      lastTtftMs: plan.estimatedTtftMs,
      lastTokPerSec: plan.estimatedTokPerSec,
      logs: [],
    };

    this.appendLog('info', `Initializing ${plan.runtime.name} for ${plan.model.name} (${plan.quant.id}).`);
    this.appendLog(
      'info',
      `Target hardware allocation: ${plan.gpuLayersAllocated}/${plan.totalLayers} layers on GPU (${plan.vramRequiredGB} GB VRAM), ${plan.cpuLayersAllocated} layers on CPU (${plan.ramRequiredGB} GB RAM).`
    );

    // Verify engine connectivity
    if (runtimeId === 'ollama') {
      endpointUrl = 'http://127.0.0.1:11434';
      this.currentSession.endpointUrl = endpointUrl;
      try {
        const res = await fetch(`${endpointUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const tags = await res.json();
          const modelsList = (tags.models || []).map((m: any) => m.name).join(', ');
          this.appendLog('info', `Connected to local Ollama daemon on port 11434. Models: ${modelsList || 'none'}`);
        } else {
          this.appendLog('warn', `Ollama returned HTTP ${res.status}. Attempting automatic connection.`);
        }
      } catch (err: any) {
        this.appendLog('warn', `Ollama service check: ${err.message || 'Connecting to endpoint'}.`);
      }
    } else if (runtimeId === 'llama.cpp') {
      endpointUrl = `http://127.0.0.1:${plan.runtime.defaultPort}`;
      this.currentSession.endpointUrl = endpointUrl;
      try {
        const res = await fetch(`${endpointUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          this.appendLog('info', `Connected to active llama-server on port ${plan.runtime.defaultPort}.`);
        } else {
          this.appendLog('info', `Ready to connect to llama-server on port ${plan.runtime.defaultPort}.`);
        }
      } catch {
        this.appendLog('info', `Runtime initialized on port ${plan.runtime.defaultPort}. Run llama-server to receive requests.`);
      }
    } else {
      this.appendLog('info', `${plan.runtime.name} configured for ${plan.config.offloadStrategy} strategy on ${endpointUrl}.`);
    }

    return this.currentSession;
  }

  async stop(): Promise<RuntimeSession> {
    this.stressLoadActive = false;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.activeProcess = null;
    }

    if (this.currentSession.status === 'running') {
      this.appendLog('info', `Gracefully stopped ${this.currentSession.plan?.runtime.name || 'runtime'} and released memory.`);
      this.currentSession.status = 'stopped';
      this.currentSession.stoppedAt = new Date().toISOString();
    }

    return this.currentSession;
  }

  async runInference(prompt: string): Promise<InferenceResult> {
    if (this.currentSession.status !== 'running' || !this.currentSession.plan) {
      throw new Error('No runtime is currently running. Please launch a runtime configuration first.');
    }

    const plan = this.currentSession.plan;
    const runtimeId = plan.runtime.id;
    const startTime = performance.now();

    // Map catalog model ID to Ollama model tag where appropriate
    const getOllamaModelTag = (id: string): string => {
      if (id.includes('1b')) return 'llama3.2:1b';
      if (id.includes('3b')) return 'llama3.2:3b';
      if (id.includes('8b')) return 'llama3.1:8b';
      if (id.includes('qwen-2.5-7b')) return 'qwen2.5:7b';
      if (id.includes('qwen-2.5-32b')) return 'qwen2.5:32b';
      if (id.includes('deepseek-r1-14b')) return 'deepseek-r1:14b';
      if (id.includes('deepseek-r1-32b')) return 'deepseek-r1:32b';
      return 'llama3.2:1b';
    };

    // 1. If Ollama is target or available
    if (runtimeId === 'ollama' || runtimeId === 'llama.cpp') {
      const ollamaUrl = 'http://127.0.0.1:11434/api/generate';
      const modelTag = getOllamaModelTag(plan.model.id);

      try {
        const res = await fetch(ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelTag,
            prompt,
            stream: false,
            options: {
              num_ctx: Math.min(plan.config.contextSize, 8192),
              num_thread: plan.config.cpuThreads,
            },
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (res.ok) {
          const data = await res.json();
          const totalDurationMs = Math.round((data.total_duration || 0) / 1e6) || Math.round(performance.now() - startTime);
          const promptDurationMs = Math.round((data.prompt_eval_duration || 0) / 1e6);
          const ttftMs = promptDurationMs > 0 ? promptDurationMs : Math.round(totalDurationMs * 0.2);

          const promptTokens = data.prompt_eval_count || Math.max(10, Math.round(prompt.length / 3.8));
          const completionTokens = data.eval_count || Math.max(1, Math.round((data.response || '').length / 4));

          const evalDurationSec = (data.eval_duration || 0) / 1e9;
          const tokensPerSec =
            evalDurationSec > 0
              ? Number((completionTokens / evalDurationSec).toFixed(1))
              : Number((completionTokens / (Math.max(0.1, totalDurationMs - ttftMs) / 1000)).toFixed(1));

          this.currentSession.totalPromptsRun += 1;
          this.currentSession.totalTokensGenerated += completionTokens;
          this.currentSession.lastTtftMs = ttftMs;
          this.currentSession.lastTokPerSec = tokensPerSec;

          this.appendLog(
            'info',
            `Prompt #${this.currentSession.totalPromptsRun} via ${plan.runtime.name}: ${promptTokens} prompt tok -> ${completionTokens} gen tok | TTFT ${ttftMs}ms | ${tokensPerSec} tok/s`
          );

          return {
            promptTokens,
            completionTokens,
            ttftMs,
            tokensPerSec,
            totalLatencyMs: totalDurationMs,
            responseText: data.response || 'No text output produced.',
          };
        }
      } catch (err: any) {
        // Fall through to llama.cpp / OpenAI endpoint or local error handling
        console.warn('Ollama generate call error:', err.message);
      }

      // Try llama.cpp OpenAI-compatible endpoint
      try {
        const llamaUrl = `http://127.0.0.1:${plan.runtime.defaultPort}/v1/chat/completions`;
        const res = await fetch(llamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 256,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (res.ok) {
          const data = await res.json();
          const totalDurationMs = Math.round(performance.now() - startTime);
          const ttftMs = Math.round(totalDurationMs * 0.25);
          const completionTokens = data.usage?.completion_tokens || 48;
          const promptTokens = data.usage?.prompt_tokens || Math.round(prompt.length / 3.8);
          const tokensPerSec = Number((completionTokens / ((totalDurationMs - ttftMs) / 1000)).toFixed(1));
          const responseText = data.choices?.[0]?.message?.content || 'Completed.';

          this.currentSession.totalPromptsRun += 1;
          this.currentSession.totalTokensGenerated += completionTokens;
          this.currentSession.lastTtftMs = ttftMs;
          this.currentSession.lastTokPerSec = tokensPerSec;

          return {
            promptTokens,
            completionTokens,
            ttftMs,
            tokensPerSec,
            totalLatencyMs: totalDurationMs,
            responseText,
          };
        }
      } catch {
        // Fall through
      }
    }

    // If local runtime server is not listening, return a clear, honest error message
    throw new Error(
      `Active runtime (${plan.runtime.name}) is not reachable on ${this.currentSession.endpointUrl}. Ensure the engine daemon (e.g. Ollama or llama-server) is running.`
    );
  }
}
