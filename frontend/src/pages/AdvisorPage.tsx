import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Sliders,
  Search,
  RefreshCw,
  Cpu,
  Database,
  CheckCircle2,
  AlertTriangle,
  Download,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Layers,
  Zap,
  Scale,
  X,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import {
  AdvisorHardwareSummary,
  AdvisorRecommendationItem,
  SetupProgress,
} from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Defensive mapping to ensure every recommendation field is cleanly defined
function mapAdvisorRecommendation(raw: any): AdvisorRecommendationItem {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `model-${Math.random().toString(36).substring(2, 9)}`,
      name: 'Unnamed Model',
      publisher: 'Unknown',
      architecture: '—',
      parameter_size: '—',
      format: 'GGUF',
      quantization: '—',
      size_bytes: 0,
      size_formatted: '—',
      fit_score: null,
      tier: 'EXPERIMENTAL',
      safety_level: 'SAFE',
      recommended_runtime: 'llama.cpp server',
      ram_required_gb: null,
      ram_required_formatted: '—',
      estimated_tok_per_sec: null,
      estimated_performance: '—',
      context_length: 4096,
      license: '—',
      download_url: '',
      reasoning: '—',
    };
  }

  const id = raw.model_id || raw.id || `model-${Math.random().toString(36).substring(2, 9)}`;
  const selQuant = raw.selected_quantization || {};
  const memBreakdown = raw.memory_breakdown || {};

  // RAM required calculation from total_working_ram_bytes or ram_required_gb
  let ramGb: number | null = null;
  if (typeof raw.ram_required_gb === 'number' && !isNaN(raw.ram_required_gb)) {
    ramGb = raw.ram_required_gb;
  } else if (typeof memBreakdown.total_working_ram_bytes === 'number' && memBreakdown.total_working_ram_bytes > 0) {
    ramGb = memBreakdown.total_working_ram_bytes / (1024 ** 3);
  }

  const ramRequiredFormatted =
    memBreakdown.total_working_ram_formatted || (ramGb !== null ? `${ramGb.toFixed(2)} GB` : '—');

  // File size
  const sizeBytes =
    typeof raw.size_bytes === 'number'
      ? raw.size_bytes
      : typeof selQuant.size_bytes === 'number'
      ? selQuant.size_bytes
      : memBreakdown.weights_bytes || 0;

  const sizeFormatted =
    raw.size_formatted || selQuant.size_formatted || memBreakdown.weights_formatted || '—';

  // Format
  let format = raw.format || '';
  if (!format) {
    if (selQuant.filename?.toLowerCase().endsWith('.gguf') || raw.available_quantizations) {
      format = 'GGUF';
    } else if (raw.recommended_runtime === 'ollama') {
      format = 'Ollama';
    } else {
      format = 'GGUF';
    }
  }

  const quantName = raw.quantization || selQuant.name || '—';
  const tier = raw.recommendation_tier || raw.tier || 'EXPERIMENTAL';

  // Safety level derivation
  let safetyLevel: 'SAFE' | 'MARGINAL' | 'RISKY' = 'SAFE';
  if (raw.safety_level === 'SAFE' || raw.safety_level === 'MARGINAL' || raw.safety_level === 'RISKY') {
    safetyLevel = raw.safety_level;
  } else {
    const tierUpper = String(tier).toUpperCase();
    if (tierUpper.includes('NOT_RECOMMENDED') || tierUpper.includes('RISK') || tierUpper.includes('UNSAFE')) {
      safetyLevel = 'RISKY';
    } else if (tierUpper.includes('EXPERIMENTAL') || tierUpper.includes('MARGINAL') || tierUpper.includes('CONSTRAINED')) {
      safetyLevel = 'MARGINAL';
    } else {
      safetyLevel = 'SAFE';
    }
  }

  // Estimated tokens per second
  let estimatedTps: number | null = null;
  if (typeof raw.estimated_tok_per_sec === 'number' && !isNaN(raw.estimated_tok_per_sec)) {
    estimatedTps = raw.estimated_tok_per_sec;
  }

  const estimatedPerformance =
    raw.estimated_performance || (estimatedTps !== null ? `~${estimatedTps.toFixed(1)} t/s` : '—');

  // Fit score (derived if missing based on tier)
  let fitScore = typeof raw.fit_score === 'number' && !isNaN(raw.fit_score) ? raw.fit_score : null;
  if (fitScore === null) {
    const tierUpper = String(tier).toUpperCase();
    if (tierUpper.includes('RECOMMENDED') && !tierUpper.includes('NOT')) {
      fitScore = 95;
    } else if (tierUpper.includes('GOOD_ALTERNATIVE')) {
      fitScore = 80;
    } else if (tierUpper.includes('EXPERIMENTAL')) {
      fitScore = 65;
    } else {
      fitScore = 40;
    }
  }

  const reasoning = raw.tier_reason || raw.reasoning || raw.description || '—';
  const downloadUrl = raw.download_url || selQuant.download_url || '';

  return {
    id,
    model_id: id,
    name: raw.name || 'Unnamed Model',
    publisher: raw.publisher || 'Unknown',
    architecture: raw.architecture || '—',
    parameter_size: raw.parameter_size || (typeof raw.parameter_count_b === 'number' ? `${raw.parameter_count_b}B` : '—'),
    parameter_count_b: typeof raw.parameter_count_b === 'number' ? raw.parameter_count_b : null,
    format,
    quantization: quantName,
    size_bytes: sizeBytes,
    size_formatted: sizeFormatted,
    fit_score: fitScore,
    tier,
    safety_level: safetyLevel,
    recommended_runtime: raw.recommended_runtime || 'llama.cpp server',
    ram_required_gb: ramGb,
    ram_required_formatted: ramRequiredFormatted,
    estimated_tok_per_sec: estimatedTps,
    estimated_performance: estimatedPerformance,
    context_length: typeof raw.context_length === 'number' ? raw.context_length : 4096,
    license: raw.license || '—',
    download_url: downloadUrl,
    reasoning,
    raw,
  };
}

export function AdvisorPage() {
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useToast();
  const { refreshModels } = useEngine();

  // Filters & Parameters
  const [workload, setWorkload] = useState('general');
  const [preference, setPreference] = useState('balanced');
  const [catalogSource, setCatalogSource] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');

  // Data states
  const [hwSummary, setHwSummary] = useState<AdvisorHardwareSummary | null>(null);
  const [recommendations, setRecommendations] = useState<AdvisorRecommendationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Compare modal state
  const [compareList, setCompareList] = useState<AdvisorRecommendationItem[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  // Auto-setup modal state
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [targetModelForSetup, setTargetModelForSetup] = useState<AdvisorRecommendationItem | null>(null);
  const [setupTaskId, setSetupTaskId] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState<SetupProgress | null>(null);

  // Runtime guide modal state
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guideData, setGuideData] = useState<any | null>(null);
  const [selectedGuideRuntime, setSelectedGuideRuntime] = useState('llama.cpp server');

  // Safe formatting helpers for technical values
  const renderRam = (item: AdvisorRecommendationItem | null | undefined): string => {
    if (!item) return '—';
    if (typeof item.ram_required_gb === 'number' && !isNaN(item.ram_required_gb)) {
      return `${item.ram_required_gb.toFixed(2)} GB`;
    }
    return item.ram_required_formatted || '—';
  };

  const renderThroughput = (item: AdvisorRecommendationItem | null | undefined): string => {
    if (!item) return '—';
    if (typeof item.estimated_tok_per_sec === 'number' && !isNaN(item.estimated_tok_per_sec)) {
      return `~${item.estimated_tok_per_sec.toFixed(1)} t/s`;
    }
    return item.estimated_performance || '—';
  };

  // Load hardware summary on mount
  useEffect(() => {
    api.getAdvisorHardwareSummary()
      .then(setHwSummary)
      .catch((e) => console.warn('Advisor hardware summary error:', e.message));
  }, []);

  // Fetch recommendations
  const fetchRecommendations = async (force: boolean = false) => {
    setIsLoading(true);
    try {
      const data = await api.getAdvisorRecommendations({
        workload,
        preference,
        catalog_source: catalogSource,
        search_query: searchQuery,
        force_refresh: force,
      });
      const rawList = Array.isArray(data?.recommendations) ? data.recommendations : [];
      const mapped = rawList.map(mapAdvisorRecommendation);
      setRecommendations(mapped);
    } catch (err: any) {
      showError(err.message || 'Failed to load recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [workload, preference, catalogSource]);

  // Filter recommendations by tier & search
  const filteredRecs = recommendations.filter((r) => {
    if (tierFilter !== 'ALL') {
      const t = (r.tier || '').toUpperCase();
      const f = tierFilter.toUpperCase();
      const matches =
        t === f ||
        (f === 'TIER 1' && t === 'RECOMMENDED') ||
        (f === 'TIER 2' && t === 'GOOD_ALTERNATIVE') ||
        (f === 'TIER 3' && t === 'EXPERIMENTAL') ||
        (f === 'TIER 4' && t === 'NOT_RECOMMENDED') ||
        t.includes(f);
      if (!matches) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.publisher || '').toLowerCase().includes(q) ||
        (r.architecture || '').toLowerCase().includes(q) ||
        (r.quantization || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Comparison toggle
  const toggleCompare = (item: AdvisorRecommendationItem) => {
    if (compareList.some((c) => c.id === item.id)) {
      setCompareList((prev) => prev.filter((c) => c.id !== item.id));
    } else {
      if (compareList.length >= 4) {
        showError('You can compare a maximum of 4 models simultaneously');
        return;
      }
      setCompareList((prev) => [...prev, item]);
    }
  };

  // Open auto-setup modal
  const openSetupModal = (item: AdvisorRecommendationItem) => {
    setTargetModelForSetup(item);
    setSetupProgress(null);
    setSetupTaskId(null);
    setSetupModalOpen(true);
  };

  // Start auto-setup pipeline
  const startSetup = async () => {
    if (!targetModelForSetup) return;
    try {
      showInfo(`Initializing automated setup for ${targetModelForSetup.name}...`);
      const res = await api.startAdvisorSetup({
        model_id: targetModelForSetup.id,
        filename: targetModelForSetup.name,
        quantization: targetModelForSetup.quantization,
        runtime: targetModelForSetup.recommended_runtime,
        download_url: targetModelForSetup.download_url,
        expected_size_bytes: targetModelForSetup.size_bytes,
        license_confirmed: true,
      });
      setSetupTaskId(res.task_id);
    } catch (err: any) {
      showError(err.message || 'Setup initiation failed');
    }
  };

  // Poll setup progress
  useEffect(() => {
    if (!setupTaskId) return;
    const interval = setInterval(async () => {
      try {
        const prog = await api.getAdvisorSetupProgress(setupTaskId);
        setSetupProgress(prog);
        if (prog.status === 'completed') {
          clearInterval(interval);
          showSuccess(`Model ${targetModelForSetup?.name} configured successfully!`);
          await refreshModels();
        } else if (prog.status === 'failed' || prog.status === 'cancelled') {
          clearInterval(interval);
        }
      } catch {
        // silent polling catch
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [setupTaskId, targetModelForSetup, refreshModels, showSuccess]);

  // Open Runtime Guide Modal
  const openGuideModal = async (runtimeId: string) => {
    setSelectedGuideRuntime(runtimeId);
    try {
      const res = await api.getRuntimeInstallGuide(runtimeId);
      setGuideData(res.guide);
      setGuideModalOpen(true);
    } catch (err: any) {
      showError(err.message || 'Failed to load installation guide');
    }
  };

  return (
    <div className="space-y-6">
      {/* Advisor Header & Hardware Capacity Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle>AI Model Advisor & Auto-Setup Engine</CardTitle>
            </div>
            <CardDescription>
              Determines optimal local AI models based on your exact physical hardware profile and optimization targets
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Workload */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target Workload</label>
              <Select value={workload} onChange={(e) => setWorkload(e.target.value)}>
                <option value="general">General Assistant & Reasoning</option>
                <option value="coding">Software Engineering & Coding</option>
                <option value="math">Mathematics & Logic</option>
                <option value="chat">Fast Chat & Summarization</option>
              </Select>
            </div>
            {/* Preference */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Optimization Preference</label>
              <Select value={preference} onChange={(e) => setPreference(e.target.value)}>
                <option value="balanced">Balanced Throughput & Quality</option>
                <option value="speed">Speed-First (High Tokens/sec)</option>
                <option value="memory">Memory-Constrained (Low RAM)</option>
                <option value="quality">Maximum Output Quality</option>
              </Select>
            </div>
            {/* Catalog */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Catalog Source</label>
              <Select value={catalogSource} onChange={(e) => setCatalogSource(e.target.value)}>
                <option value="all">All Catalogs (HuggingFace + Ollama)</option>
                <option value="huggingface">Hugging Face Hub (GGUF)</option>
                <option value="ollama">Ollama Library</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Hardware Snapshot Card */}
        <Card className="bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Hardware Capacity Summary</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {hwSummary?.os || 'Detected'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available System RAM</span>
              <span className="font-semibold text-foreground">
                {hwSummary?.ram?.available_formatted || '—'} free ({hwSummary?.ram?.used_percent !== undefined ? `${hwSummary.ram.used_percent}%` : '—'} used)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Compute Topologies</span>
              <span className="font-semibold text-foreground">
                {hwSummary?.cpu?.physical_cores ? `${hwSummary.cpu.physical_cores} Physical Cores` : '—'} ({hwSummary?.cpu?.logical_threads ? `${hwSummary.cpu.logical_threads} Threads` : '—'})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GPU Hardware Acceleration</span>
              <span className="font-semibold text-foreground">
                {hwSummary?.gpu?.detected
                  ? (hwSummary.gpu.dedicated_vram_formatted || hwSummary.gpu.name || 'Detected')
                  : 'CPU-Only (Thread Pooling)'}
              </span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground">Active Runtime:</span>
              <Badge variant="success" className="text-[10px] font-mono">
                {hwSummary?.active_runtime || 'llama.cpp'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {['ALL', 'TIER 1', 'TIER 2', 'TIER 3', 'TIER 4'].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0',
                tierFilter === t
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter recommendations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchRecommendations(true)}
            disabled={isLoading}
            className="gap-1.5"
            title="Force refresh catalog cache"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          {compareList.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsCompareOpen(true)}
              className="gap-1.5"
            >
              <Scale className="w-3.5 h-3.5" />
              Compare ({compareList.length})
            </Button>
          )}
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
          Analyzing system memory margins and calculating optimal quantization fits...
        </div>
      ) : filteredRecs.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h4 className="text-sm font-semibold">No models matched this filter criteria</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Try adjusting your workload preference, switching catalog sources to All, or clearing search filters.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredRecs.map((m) => {
            const isCompared = compareList.some((c) => c.id === m.id);

            return (
              <Card key={m.id} className="flex flex-col justify-between hover:border-primary/50 transition-all">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold leading-snug">{m.name}</CardTitle>
                      <CardDescription className="text-[11px] pt-0.5">
                        {m.publisher} • {m.architecture} ({m.parameter_size})
                      </CardDescription>
                    </div>
                    {typeof m.fit_score === 'number' ? (
                      <Badge
                        variant={m.fit_score >= 90 ? 'success' : m.fit_score >= 75 ? 'warning' : 'outline'}
                        className="text-[10px] font-mono shrink-0"
                      >
                        FIT {m.fit_score}%
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                        {m.tier ? m.tier.replace(/_/g, ' ') : 'N/A'}
                      </Badge>
                    )}
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline" className="text-[10px] font-mono">{m.format || '—'}</Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">{m.quantization || '—'}</Badge>
                    <Badge
                      variant={m.safety_level === 'SAFE' ? 'success' : m.safety_level === 'MARGINAL' ? 'warning' : 'destructive'}
                      className="text-[10px]"
                    >
                      {m.safety_level || 'SAFE'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] capitalize font-mono">
                      {m.recommended_runtime || 'llama.cpp'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  {/* Technical Matrix */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-[11px]">
                    <div>
                      <span className="text-muted-foreground block">Required RAM</span>
                      <strong className="text-foreground">{renderRam(m)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">File Size</span>
                      <strong className="text-foreground">{m.size_formatted || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Est. Throughput</span>
                      <strong className="text-emerald-400 font-mono">{renderThroughput(m)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Context Length</span>
                      <strong className="text-foreground font-mono">
                        {m.context_length ? m.context_length.toLocaleString() : '—'}
                      </strong>
                    </div>
                  </div>

                  {/* Reasoning box */}
                  <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                    {m.reasoning}
                  </p>
                </CardContent>

                {/* Card Action Footer */}
                <div className="p-5 pt-0 flex items-center justify-between gap-2 border-t border-border mt-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => openSetupModal(m)}
                      className="gap-1.5 text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Setup & Run
                    </Button>
                    <Button
                      size="sm"
                      variant={isCompared ? 'default' : 'outline'}
                      onClick={() => toggleCompare(m)}
                      className="text-xs"
                    >
                      {isCompared ? 'Comparing' : 'Compare'}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openGuideModal(m.recommended_runtime)}
                    className="text-xs px-2 text-muted-foreground hover:text-foreground"
                    title="View setup guide for runtime"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Model Comparison Dialog */}
      <Dialog open={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Hardware-Weighted Model Comparison</DialogTitle>
            <DialogDescription>
              Comparing technical parameters and memory safety margins side-by-side
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto py-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-2.5 font-medium text-muted-foreground w-40">Metric</th>
                  {compareList.map((m) => (
                    <th key={m.id} className="p-2.5 font-semibold text-foreground">
                      {m.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-2.5 text-muted-foreground">Parameter Size</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5 font-medium">{m.parameter_size || '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Format & Quant</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5 font-mono">{m.format || '—'} ({m.quantization || '—'})</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Weights File Size</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5">{m.size_formatted || '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Working RAM Required</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5 font-semibold">{renderRam(m)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Estimated Speed</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5 font-mono text-emerald-400">{renderThroughput(m)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Context Window</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5 font-mono">
                      {m.context_length ? m.context_length.toLocaleString() : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Safety Level</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5">
                      <Badge variant={m.safety_level === 'SAFE' ? 'success' : 'warning'} className="text-[10px]">
                        {m.safety_level || 'SAFE'}
                      </Badge>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 text-muted-foreground">Action</td>
                  {compareList.map((m) => (
                    <td key={m.id} className="p-2.5">
                      <Button size="sm" onClick={() => { setIsCompareOpen(false); openSetupModal(m); }} className="text-xs h-7">
                        Setup
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareList([])}>Clear All</Button>
            <Button onClick={() => setIsCompareOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guided Auto-Setup Modal */}
      <Dialog open={setupModalOpen} onOpenChange={setSetupModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Automated Engine Setup Pipeline</DialogTitle>
            <DialogDescription>
              Configuring model parameters and runtime integration for {targetModelForSetup?.name || 'Model'}
            </DialogDescription>
          </DialogHeader>

          {targetModelForSetup && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model Target:</span>
                  <span className="font-semibold text-foreground">{targetModelForSetup.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engine Runtime:</span>
                  <span className="font-mono text-primary capitalize">{targetModelForSetup.recommended_runtime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Allocated Working RAM:</span>
                  <span className="font-mono">{renderRam(targetModelForSetup)}</span>
                </div>
              </div>

              {/* Setup state progression */}
              {!setupTaskId ? (
                <div className="space-y-3 pt-2">
                  <div className="text-xs text-muted-foreground">
                    This pipeline will verify memory safety margins, prepare runtime configurations, and register the model into your local catalog.
                  </div>
                  <Button onClick={startSetup} className="w-full gap-2">
                    <Download className="w-4 h-4" />
                    Confirm & Start Pipeline
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>{setupProgress?.current_step || 'Initializing...'}</span>
                      <span className="font-mono text-muted-foreground">{setupProgress?.progress_percent || 0}%</span>
                    </div>
                    <Progress value={setupProgress?.progress_percent || 0} />
                  </div>

                  {setupProgress?.status === 'completed' && (
                    <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Setup successfully completed!
                      </span>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSetupModalOpen(false);
                          navigate('/inference');
                        }}
                        className="text-xs h-7"
                      >
                        Open Studio
                      </Button>
                    </div>
                  )}

                  {setupProgress?.status === 'failed' && (
                    <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Setup failed: {setupProgress.error || 'Pipeline encountered an error'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Runtime Install Guide Modal */}
      <Dialog open={guideModalOpen} onOpenChange={setGuideModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Runtime Setup Guide: {guideData?.title || selectedGuideRuntime}</DialogTitle>
            <DialogDescription>
              Step-by-step instructions for installing and connecting this inference runtime
            </DialogDescription>
          </DialogHeader>

          {guideData && (
            <div className="space-y-4 py-2 text-xs overflow-y-auto max-h-[60vh]">
              {/* Status banner */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <span className="font-medium">Connection Status:</span>
                <Badge variant={guideData.is_connected ? 'success' : 'outline'}>
                  {guideData.is_connected ? 'CONNECTED & READY' : 'NOT DETECTED'}
                </Badge>
              </div>

              {/* Prerequisites */}
              <div className="space-y-1.5">
                <span className="font-semibold text-foreground">Prerequisites:</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
                  {(guideData.prerequisites || []).map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>

              {/* Step by step */}
              <div className="space-y-3 pt-2">
                <span className="font-semibold text-foreground">Installation Steps:</span>
                {(guideData.steps || []).map((step: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg border border-border bg-card space-y-1.5">
                    <div className="font-medium text-foreground">{i + 1}. {step.title}</div>
                    <p className="text-muted-foreground">{step.instruction}</p>
                    {step.command && (
                      <pre className="p-2 rounded bg-muted/60 font-mono text-[11px] overflow-x-auto text-primary">
                        {step.command}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={async () => {
                showInfo('Testing runtime connection...');
                const res = await api.getRuntimeInstallGuide(selectedGuideRuntime);
                setGuideData(res.guide);
                if (res.guide?.is_connected) {
                  showSuccess('Runtime connection verified!');
                } else {
                  showError('Runtime daemon is not reachable yet.');
                }
              }}
            >
              Test Connection
            </Button>
            <Button onClick={() => setGuideModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
