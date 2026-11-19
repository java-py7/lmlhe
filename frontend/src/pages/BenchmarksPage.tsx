import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Play,
  Trash2,
  RefreshCw,
  Sliders,
  History,
  Zap,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BenchmarkRecord } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function BenchmarksPage() {
  const { showSuccess, showError, showInfo } = useToast();
  const { models, activeModelId, config } = useEngine();

  // Tab
  const [activeTab, setActiveTab] = useState('baseline');

  // Benchmark data
  const [historicalData, setHistoricalData] = useState<any | null>(null);
  const [customBenchmarks, setCustomBenchmarks] = useState<BenchmarkRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Custom runner form state
  const [targetModelId, setTargetModelId] = useState(activeModelId || '');
  const [contextLength, setContextLength] = useState(2048);
  const [maxTokens, setMaxTokens] = useState(128);
  const [threads, setThreads] = useState(config?.llama_cpp?.threads || 4);
  const [gpuLayers, setGpuLayers] = useState(config?.llama_cpp?.gpu_layers !== undefined ? config.llama_cpp.gpu_layers : 0);
  const [warmupRuns, setWarmupRuns] = useState(1);
  const [prompt, setPrompt] = useState('Explain the difference between CPU cache and main memory in detail.');
  const [notes, setNotes] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (activeModelId && !targetModelId) {
      setTargetModelId(activeModelId);
    }
  }, [activeModelId, targetModelId]);

  const loadBenchmarks = async () => {
    setIsLoading(true);
    try {
      const data = await api.getBenchmarks();
      setHistoricalData(data.historical || null);
      setCustomBenchmarks(data.custom || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load benchmarks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBenchmarks();
  }, []);

  const handleRunBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetModelId) {
      showError('Please select a model to benchmark');
      return;
    }

    setIsRunning(true);
    showInfo('Executing benchmark run. This will evaluate generation throughput and prompt evaluation speed...');
    try {
      const res = await api.runBenchmark({
        model_id: targetModelId,
        context_length: contextLength,
        max_tokens: maxTokens,
        threads,
        gpu_layers: gpuLayers,
        warmup_runs: warmupRuns,
        prompt: prompt.trim(),
        notes: notes.trim() || undefined,
      });
      showSuccess(`Benchmark completed: ${res.benchmark?.tokens_per_second?.toFixed(1) || 0} tokens/sec!`);
      await loadBenchmarks();
      setActiveTab('custom');
    } catch (err: any) {
      showError(err.message || 'Benchmark execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDeleteBenchmark = async (id: string) => {
    if (!window.confirm('Delete this benchmark run record?')) return;
    try {
      await api.deleteBenchmark(id);
      showInfo('Benchmark record deleted');
      await loadBenchmarks();
    } catch (err: any) {
      showError(err.message || 'Failed to delete record');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Runner Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Inference Performance Benchmark Runner
              </CardTitle>
              <CardDescription>
                Empirically measure TTFT, generation throughput, prompt eval speed and resident memory
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadBenchmarks}
              disabled={isLoading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
              Refresh Records
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleRunBenchmark} className="space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/20 border border-border">
              {/* Model */}
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Target Model *</label>
                <Select
                  value={targetModelId}
                  onChange={(e) => setTargetModelId(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.format} - {m.size_formatted})
                    </option>
                  ))}
                </Select>
              </div>

              {/* Context */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span>Context Size</span>
                  <span className="font-mono text-primary font-semibold">{contextLength}</span>
                </div>
                <Slider
                  min={512}
                  max={8192}
                  step={512}
                  value={contextLength}
                  onValueChange={setContextLength}
                />
              </div>

              {/* Max Tokens */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span>Generated Tokens</span>
                  <span className="font-mono text-primary font-semibold">{maxTokens}</span>
                </div>
                <Slider
                  min={32}
                  max={512}
                  step={32}
                  value={maxTokens}
                  onValueChange={setMaxTokens}
                />
              </div>

              {/* Threads & Offload */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Threads (-t)</label>
                  <input
                    type="number"
                    value={threads}
                    onChange={(e) => setThreads(parseInt(e.target.value, 10) || 4)}
                    className="w-full h-8 px-2 rounded border border-input bg-background font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">GPU Layers</label>
                  <input
                    type="number"
                    value={gpuLayers}
                    onChange={(e) => setGpuLayers(parseInt(e.target.value, 10) || 0)}
                    className="w-full h-8 px-2 rounded border border-input bg-background font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Prompt & Notes row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="font-medium text-foreground">Standardized Test Prompt</label>
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-input bg-background text-xs resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Run Notes / Tag</label>
                <input
                  type="text"
                  placeholder="e.g. CPU GEMM baseline with 4 threads"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs"
                />
                <div className="pt-2">
                  <Button type="submit" disabled={isRunning} className="w-full gap-2 text-xs h-9">
                    <Play className={cn('w-3.5 h-3.5 fill-current', isRunning && 'animate-spin')} />
                    {isRunning ? 'Running Benchmark...' : 'Execute Benchmark'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabs: Baseline Matrix vs Custom Benchmarks */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="baseline" className="gap-1.5">
            <History className="w-3.5 h-3.5" />
            Historical Baseline Matrix (B01-B08)
          </TabsTrigger>
          <TabsTrigger value="custom" className="gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Custom Benchmark Runs ({customBenchmarks.length})
          </TabsTrigger>
        </TabsList>

        {/* Baseline Matrix */}
        <TabsContent value="baseline">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Standardized Historical Test Matrix</CardTitle>
              <CardDescription>
                Controlled research benchmarks validating CPU threading, memory mapping, and VRAM offload efficiency
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historicalData?.test_matrix ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Runtime</TableHead>
                      <TableHead>Params (t / ngl / ctx)</TableHead>
                      <TableHead>Gen Speed</TableHead>
                      <TableHead>Prompt Eval</TableHead>
                      <TableHead>RAM (RSS)</TableHead>
                      <TableHead>Efficiency</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historicalData.test_matrix.map((row: any) => (
                      <TableRow key={row.ID}>
                        <TableCell className="font-mono font-bold text-primary">{row.ID}</TableCell>
                        <TableCell className="font-medium text-foreground">{row.Model}</TableCell>
                        <TableCell className="font-mono text-[11px] capitalize">{row.Runtime}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{row['Execution Parameters']}</TableCell>
                        <TableCell className="font-mono text-emerald-400 font-semibold">{row['Tokens/Sec']}</TableCell>
                        <TableCell className="font-mono text-[11px]">{row['Prompt Eval Speed']}</TableCell>
                        <TableCell className="font-mono text-[11px]">{row['Memory RSS (GB)']}</TableCell>
                        <TableCell className="font-mono text-[11px] text-indigo-400 font-semibold">{row['Efficiency Score']}</TableCell>
                        <TableCell>
                          <Badge variant="success" className="text-[9px] uppercase">
                            {row.Status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No historical matrix records loaded.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Custom Benchmarks */}
        <TabsContent value="custom">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Custom Measured Runs</CardTitle>
              <CardDescription>Empirical benchmark measurements executed on this system</CardDescription>
            </CardHeader>
            <CardContent>
              {customBenchmarks.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
                  <BarChart3 className="w-6 h-6 mx-auto text-muted-foreground" />
                  <p>No custom benchmarks recorded yet. Run a benchmark above to measure actual throughput.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Runtime</TableHead>
                      <TableHead>Threads / NGL</TableHead>
                      <TableHead>Generation Speed</TableHead>
                      <TableHead>Prompt Speed</TableHead>
                      <TableHead>TTFT</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customBenchmarks.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {new Date(b.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{b.model_name}</TableCell>
                        <TableCell className="font-mono text-[11px] capitalize">{b.runtime}</TableCell>
                        <TableCell className="font-mono text-[11px]">
                          {b.threads}T / {b.gpu_layers}L (ctx {b.context_length})
                        </TableCell>
                        <TableCell className="font-mono text-emerald-400 font-bold">
                          {b.tokens_per_second?.toFixed(2)} t/s
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          {b.prompt_eval_tokens_per_second ? `${b.prompt_eval_tokens_per_second.toFixed(1)} t/s` : 'N/A'}
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          {b.time_to_first_token_sec ? `${(b.time_to_first_token_sec * 1000).toFixed(0)} ms` : '--'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs truncate max-w-[150px]" title={b.notes}>
                          {b.notes || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteBenchmark(b.id)}
                            className="h-7 px-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
