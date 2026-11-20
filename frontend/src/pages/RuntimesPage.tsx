import React, { useState } from 'react';
import {
  Layers,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  FolderPlus,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Server,
  Folder,
  Radio,
  FileText,
  Copy,
  Check,
  BookOpen,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { ModelEntry } from '@/lib/types';
import { detectLocalOllamaDirect } from '@/lib/browserDetection';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function RuntimesPage() {
  const { showSuccess, showError, showInfo } = useToast();
  const {
    models,
    activeModelId,
    activeRuntime,
    runtimes,
    config,
    selectModel,
    switchRuntime,
    refreshModels,
    refreshRuntimes,
    refreshConfig,
    isOriginLocal,
    isHosted,
    isExactLocalEngine,
    clientRuntimes,
    refreshClientDetection,
  } = useEngine();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Loading states
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartingLlama, setIsStartingLlama] = useState(false);
  const [isStoppingLlama, setIsStoppingLlama] = useState(false);
  const [isTestingOllama, setIsTestingOllama] = useState(false);

  // Probe llama.cpp toggle and CORS help states
  const [probeLlamaCpp, setProbeLlamaCpp] = useState(() => {
    return typeof window !== 'undefined' && localStorage.getItem('probe_llama_cpp') === 'true';
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCorsHelp, setShowCorsHelp] = useState(false);

  // Modals
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedModelForDetails, setSelectedModelForDetails] = useState<ModelEntry | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newModelPath, setNewModelPath] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const [dirsModalOpen, setDirsModalOpen] = useState(false);
  const [newDirectoryPath, setNewDirectoryPath] = useState('');

  // Guide Modal
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [selectedGuideRuntime, setSelectedGuideRuntime] = useState<string | null>(null);
  const [guideData, setGuideData] = useState<any | null>(null);
  const [isLoadingGuide, setIsLoadingGuide] = useState(false);

  const handleOpenInstallGuide = async (runtimeId: string) => {
    setSelectedGuideRuntime(runtimeId);
    setGuideModalOpen(true);
    setIsLoadingGuide(true);
    try {
      const res = await api.getRuntimeInstallGuide(runtimeId);
      if (res && res.guide) {
        setGuideData(res.guide);
      }
    } catch {
      setGuideData(null);
    } finally {
      setIsLoadingGuide(false);
    }
  };

  // Process settings inputs
  const [llamaThreads, setLlamaThreads] = useState(config?.llama_cpp?.threads || 4);
  const [llamaNgl, setLlamaNgl] = useState(config?.llama_cpp?.gpu_layers !== undefined ? config.llama_cpp.gpu_layers : 0);
  const [llamaCtx, setLlamaCtx] = useState(config?.llama_cpp?.context_size || 2048);
  const [llamaPort, setLlamaPort] = useState(config?.llama_cpp?.port || 8080);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    showSuccess('Copied command to clipboard');
  };

  const handleToggleLlamaProbe = async () => {
    const next = !probeLlamaCpp;
    setProbeLlamaCpp(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('probe_llama_cpp', next ? 'true' : 'false');
    }
    await refreshClientDetection();
    showInfo(next ? 'Enabled llama.cpp localhost:8080 probe' : 'Disabled llama.cpp probe to prevent console error logs');
  };

  const handleTestOllamaConnection = async () => {
    setIsTestingOllama(true);
    showInfo('Testing connection to local Ollama daemon at 127.0.0.1:11434...');
    try {
      if (isHosted && !isExactLocalEngine) {
        await refreshClientDetection();
        const res = await detectLocalOllamaDirect();
        if (res.status === 'online') {
          showSuccess(`Ollama is online! Detected v${res.version || 'latest'} with ${res.models.length} local models.`);
        } else if (res.status === 'cors_blocked') {
          showError('Ollama is running but blocking this site. Run the CORS fix command below.');
          setShowCorsHelp(true);
        } else {
          showError('Ollama daemon is not running at 127.0.0.1:11434. Start Ollama on your PC.');
        }
      } else {
        await refreshRuntimes();
        if (runtimes?.ollama?.detected) {
          showSuccess(`Ollama daemon connected! Version ${runtimes.ollama.version || 'unknown'}`);
        } else {
          showError('Ollama service is unreachable. Ensure the Ollama daemon is running.');
        }
      }
    } catch (err: any) {
      showError(err.message || 'Connection test failed');
    } finally {
      setIsTestingOllama(false);
    }
  };

  // Filtered models
  const filteredModels = models.filter((m) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        m.name.toLowerCase().includes(q) ||
        m.architecture.toLowerCase().includes(q) ||
        m.quantization.toLowerCase().includes(q) ||
        m.path.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (runtimeFilter !== 'all') {
      if (!m.runtime_compatibility.some((c) => c.toLowerCase().includes(runtimeFilter))) {
        return false;
      }
    }
    if (formatFilter !== 'all') {
      if (!m.format.toLowerCase().includes(formatFilter.toLowerCase())) return false;
    }
    if (statusFilter === 'available' && !m.is_available) return false;
    if (statusFilter === 'offline' && m.is_available) return false;
    return true;
  });

  // Handlers
  const handleScan = async () => {
    setIsScanning(true);
    showInfo('Scanning configured directories and Ollama library...');
    try {
      if (!isOriginLocal) {
        await refreshClientDetection();
        showSuccess(`Direct scan completed: discovered ${clientRuntimes?.ollama?.models?.length || 0} local Ollama models`);
      } else {
        const res = await api.scanModels();
        showSuccess(`Scan completed: discovered ${res.count} models (${res.available_count} available)`);
        await refreshModels();
      }
    } catch (err: any) {
      showError(err.message || 'Model scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (!isOriginLocal) {
        await refreshClientDetection();
        showSuccess('Refreshed local runtimes and models via direct browser detection');
      } else {
        const res = await api.refreshModels();
        showSuccess(`Refreshed ${res.count} models (${res.available_count} available)`);
        await refreshModels();
        await refreshRuntimes();
      }
    } catch (err: any) {
      showError(err.message || 'Model refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (!window.confirm(`Remove model '${name}' from registry?\n\nNote: The actual file on disk will NOT be deleted.`)) {
      return;
    }
    try {
      await api.deleteModel(id);
      showInfo(`Removed '${name}' from registry (file preserved on disk)`);
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Failed to remove model');
    }
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelPath.trim()) return;
    try {
      await api.addModel(newModelPath.trim(), newModelName.trim() || undefined);
      showSuccess(`Model added successfully!`);
      setNewModelPath('');
      setNewModelName('');
      setAddModalOpen(false);
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Failed to add model');
    }
  };

  const handleAddDirectory = async () => {
    if (!newDirectoryPath.trim()) return;
    try {
      await api.addModelDirectory(newDirectoryPath.trim());
      showSuccess(`Directory added to monitoring paths`);
      setNewDirectoryPath('');
      await refreshConfig();
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Failed to add directory');
    }
  };

  const handleRemoveDirectory = async (dir: string) => {
    try {
      await api.removeModelDirectory(dir);
      showInfo(`Directory removed from monitoring`);
      await refreshConfig();
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Failed to remove directory');
    }
  };

  const handleStartLlama = async () => {
    setIsStartingLlama(true);
    showInfo('Starting llama.cpp server subprocess...');
    try {
      await api.startLlamaServer({
        threads: llamaThreads,
        gpu_layers: llamaNgl,
        context_size: llamaCtx,
        port: llamaPort,
      });
      showSuccess('llama-server successfully started!');
      await refreshRuntimes();
    } catch (err: any) {
      showError(err.message || 'Failed to start llama-server');
    } finally {
      setIsStartingLlama(false);
    }
  };

  const handleStopLlama = async () => {
    setIsStoppingLlama(true);
    try {
      await api.stopLlamaServer();
      showInfo('llama-server stopped');
      await refreshRuntimes();
    } catch (err: any) {
      showError(err.message || 'Failed to stop llama-server');
    } finally {
      setIsStoppingLlama(false);
    }
  };

  const llama = runtimes?.llama_cpp;
  const ollama = runtimes?.ollama;

  const isOllamaCorsBlocked = isHosted && !isExactLocalEngine && clientRuntimes?.ollama?.status === 'cors_blocked';
  const isOllamaOnline = (isHosted && !isExactLocalEngine)
    ? clientRuntimes?.ollama?.status === 'online'
    : !!ollama?.detected;

  // Unified multi-runtime list
  const defaultRuntimesList = [
    {
      runtime_id: 'llama.cpp server',
      display_name: 'llama.cpp Server / CLI',
      supported_formats: ['GGUF', 'Binary'],
      icon: '⚡',
      description: 'High-performance C++ LLM inference engine with multi-threaded CPU GEMM & GPU offloading',
    },
    {
      runtime_id: 'ollama',
      display_name: 'Ollama Service',
      supported_formats: ['Ollama Registry', 'GGUF'],
      icon: '🦙',
      description: 'Streamlined local AI runtime that manages model downloads and OpenAI-compatible APIs',
    },
    {
      runtime_id: 'transformers',
      display_name: 'Hugging Face Transformers / PyTorch',
      supported_formats: ['Safetensors', 'PyTorch (.bin)'],
      icon: '🤗',
      description: 'Standard Python deep learning ecosystem for running native PyTorch & Safetensors weights',
    },
    {
      runtime_id: 'onnxruntime',
      display_name: 'ONNX Runtime (DirectML / CPU)',
      supported_formats: ['ONNX (.onnx)'],
      icon: '⚡',
      description: 'Cross-platform accelerator with native DirectML support across Intel, AMD, and NVIDIA',
    },
    {
      runtime_id: 'mlx',
      display_name: 'Apple Silicon MLX Framework',
      supported_formats: ['MLX', 'Apple Safetensors'],
      icon: '🍎',
      description: 'Native Apple Silicon framework utilizing high-bandwidth unified memory on M-series chips',
    },
    {
      runtime_id: 'exllamav2',
      display_name: 'ExLlamaV2 (EXL2)',
      supported_formats: ['EXL2', 'GPTQ'],
      icon: '🚀',
      description: 'Ultra-fast quantized inference library designed exclusively for modern NVIDIA GPUs with CUDA',
    },
    {
      runtime_id: 'mlc_llm',
      display_name: 'MLC LLM Engine',
      supported_formats: ['MLC Compiled'],
      icon: '⚙️',
      description: 'Universal compilation-based runtime targeting Vulkan, Metal, and WebGPU on edge devices',
    },
    {
      runtime_id: 'vllm',
      display_name: 'vLLM Engine (PagedAttention)',
      supported_formats: ['Safetensors', 'PyTorch'],
      icon: '⚡',
      description: 'High-throughput LLM serving engine featuring PagedAttention and OpenAI-compatible server',
    },
  ];

  const allAdaptersMap = runtimes?.adapters || {};
  const displayRuntimes = defaultRuntimesList.map((base) => {
    const liveAdapter = allAdaptersMap[base.runtime_id] || (runtimes?.all_runtimes || []).find((r: any) => r.runtime_id === base.runtime_id);
    return {
      ...base,
      ...(liveAdapter || {}),
      display_name: liveAdapter?.display_name || base.display_name,
      supported_formats: liveAdapter?.supported_formats || base.supported_formats,
    };
  });

  const verifiedCount = displayRuntimes.filter((r) => {
    if (r.runtime_id === 'llama.cpp server') {
      return (isHosted && !isExactLocalEngine) ? clientRuntimes?.llama_cpp?.running : (r.available || r.installed);
    }
    if (r.runtime_id === 'ollama') {
      return isOllamaOnline;
    }
    return Boolean(r.available || r.installed);
  }).length;

  return (
    <div className="space-y-6">
      {/* Top Section: Model Registry Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Local Model Registry
              </CardTitle>
              <CardDescription>
                Models discovered across configured local directories and active Ollama daemon
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleScan} disabled={isScanning} className="gap-1.5 text-xs">
                <RefreshCw className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
                Scan All
              </Button>
              <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="gap-1.5 text-xs">
                <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
                Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDirsModalOpen(true)} className="gap-1.5 text-xs">
                <Folder className="w-3.5 h-3.5" />
                Directories
              </Button>
              <Button size="sm" onClick={() => setAddModalOpen(true)} className="gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />
                Register Model
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3">
            <div className="relative sm:col-span-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-md bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Select value={runtimeFilter} onChange={(e) => setRuntimeFilter(e.target.value)} className="h-8 text-xs">
              <option value="all">All Runtimes</option>
              <option value="llama">llama.cpp server</option>
              <option value="ollama">Ollama</option>
              <option value="transformers">Transformers / PyTorch</option>
              <option value="onnx">ONNX Runtime</option>
              <option value="mlx">Apple MLX</option>
              <option value="exl">ExLlamaV2</option>
              <option value="mlc">MLC LLM</option>
              <option value="vllm">vLLM Engine</option>
            </Select>
            <Select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="h-8 text-xs">
              <option value="all">All Formats</option>
              <option value="gguf">GGUF (.gguf)</option>
              <option value="safetensors">Safetensors (.safetensors)</option>
              <option value="ollama">Ollama Manifests</option>
              <option value="onnx">ONNX (.onnx)</option>
              <option value="pytorch">PyTorch (.pt, .bin)</option>
              <option value="mlx">Apple MLX</option>
              <option value="exl">ExLlamaV2 (EXL2)</option>
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs">
              <option value="all">All Statuses</option>
              <option value="available">Available Only</option>
              <option value="offline">Offline / Missing</option>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filteredModels.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
              <Info className="w-6 h-6 mx-auto text-muted-foreground" />
              <p className="font-medium text-foreground">
                No models found matching current filters.
              </p>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                Pull models in Ollama (e.g. <code>ollama pull llama3.2:1b</code>), or add local model directories, then click Scan All.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model Name</TableHead>
                  <TableHead>Format & Quant</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Architecture</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Runtimes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((m) => {
                  const isActive = m.id === activeModelId;

                  return (
                    <TableRow key={m.id} className={cn(isActive && 'bg-primary/5 font-medium')}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          {isActive && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" title="Active Model" />
                          )}
                          <span className="truncate max-w-[200px]" title={m.name}>{m.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {m.format} ({m.quantization})
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">{m.size_formatted}</TableCell>
                      <TableCell>{m.architecture}</TableCell>
                      <TableCell className="font-mono text-[11px]">{m.context_length ? m.context_length.toLocaleString() : '4,096'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.runtime_compatibility.map((rc) => (
                            <Badge key={rc} variant="outline" className="text-[9px] uppercase font-mono py-0">
                              {rc}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.is_available ? 'success' : 'destructive'} className="text-[10px]">
                          {m.is_available ? 'Available' : 'Missing'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant={isActive ? 'secondary' : 'default'}
                          disabled={isActive || !m.is_available}
                          onClick={() => selectModel(m.id)}
                          className="h-7 text-xs px-2.5"
                        >
                          {isActive ? 'Active' : 'Select'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedModelForDetails(m);
                            setDetailsModalOpen(true);
                          }}
                          className="h-7 text-xs px-2"
                          title="View metadata"
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteModel(m.id, m.name)}
                          className="h-7 text-xs px-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                          title="Remove entry from catalog"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dynamic Multi-Runtime Ecosystem Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              Verified AI Runtime Ecosystem
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Multi-ecosystem runtime detection across local binaries, virtual environments, and system daemons
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">
              {verifiedCount} / {displayRuntimes.length} VERIFIED
            </Badge>
            <Badge variant="secondary" className="text-[10px] font-mono uppercase">
              ACTIVE: {activeRuntime}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {displayRuntimes.map((rt) => {
            const isActive = activeRuntime.toLowerCase() === rt.runtime_id.toLowerCase();
            const isLlama = rt.runtime_id === 'llama.cpp server';
            const isOllamaRt = rt.runtime_id === 'ollama';

            // Status badge determination
            let badgeText = 'NOT INSTALLED';
            let badgeVariant: 'success' | 'destructive' | 'outline' | 'secondary' | 'warning' = 'outline';

            if (isLlama) {
              if (isHosted && !isExactLocalEngine) {
                if (clientRuntimes?.llama_cpp?.running) {
                  badgeText = 'ACTIVE & RUNNING';
                  badgeVariant = 'success';
                } else if (probeLlamaCpp) {
                  badgeText = 'NO SERVER ON :8080';
                  badgeVariant = 'outline';
                } else {
                  badgeText = 'PROBE DISABLED';
                  badgeVariant = 'outline';
                }
              } else {
                if (llama?.status?.healthy) {
                  badgeText = 'RUNNING & READY';
                  badgeVariant = 'success';
                } else if (llama?.status?.running) {
                  badgeText = 'STARTING';
                  badgeVariant = 'warning';
                } else if (rt.installed || (llama?.executable_path && llama.executable_path !== 'Not configured')) {
                  badgeText = 'INSTALLED & READY';
                  badgeVariant = 'secondary';
                } else {
                  badgeText = 'NOT INSTALLED';
                  badgeVariant = 'outline';
                }
              }
            } else if (isOllamaRt) {
              if (isOllamaOnline) {
                badgeText = `CONNECTED (v${isHosted && !isExactLocalEngine ? (clientRuntimes?.ollama?.version || '0.x') : (ollama?.version || '0.x')})`;
                badgeVariant = 'success';
              } else if (isOllamaCorsBlocked) {
                badgeText = 'CORS BLOCKED';
                badgeVariant = 'warning';
              } else {
                badgeText = 'SERVICE OFFLINE';
                badgeVariant = 'destructive';
              }
            } else {
              if (rt.installed || rt.available) {
                badgeText = rt.version && rt.version !== 'Unknown' && rt.version !== 'Unavailable'
                  ? `VERIFIED (v${rt.version})`
                  : 'VERIFIED & READY';
                badgeVariant = 'success';
              } else if (rt.runtime_id === 'mlx') {
                badgeText = 'MACOS EXCLUSIVE';
                badgeVariant = 'outline';
              } else if (rt.runtime_id === 'exllamav2') {
                badgeText = 'CUDA REQUIRED';
                badgeVariant = 'outline';
              } else {
                badgeText = 'NOT INSTALLED';
                badgeVariant = 'outline';
              }
            }

            return (
              <Card
                key={rt.runtime_id}
                className={cn(
                  'flex flex-col justify-between transition-all duration-200',
                  isActive && 'border-primary/50 shadow-sm bg-primary/[0.02]'
                )}
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id={`radio-rt-${rt.runtime_id}`}
                          name="runtime-active"
                          checked={isActive}
                          onChange={() => switchRuntime(rt.runtime_id)}
                          className="cursor-pointer accent-primary"
                        />
                        <label
                          htmlFor={`radio-rt-${rt.runtime_id}`}
                          className="text-xs font-semibold cursor-pointer text-foreground flex items-center gap-1.5"
                        >
                          <span>{rt.icon}</span>
                          <span className="truncate max-w-[130px]">{rt.display_name}</span>
                        </label>
                      </div>
                      <Badge variant={badgeVariant} className="text-[9px] font-mono shrink-0">
                        {badgeText}
                      </Badge>
                    </div>
                    <CardDescription className="text-[11px] line-clamp-2 mt-1">
                      {rt.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs pt-0">
                    {/* Key Details */}
                    <div className="space-y-1.5 p-2.5 rounded-lg border border-border bg-muted/20 text-[11px]">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Detection:</span>
                        <span className="font-mono text-foreground font-medium">
                          {rt.detection_method ? rt.detection_method.replace(/_/g, ' ') : 'environment_scan'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-muted-foreground shrink-0">Executable / Path:</span>
                        <span
                          className="font-mono text-foreground text-right truncate max-w-[140px]"
                          title={rt.executable_path || 'Not detected'}
                        >
                          {rt.executable_path || 'Not detected'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-muted-foreground shrink-0">Formats:</span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {rt.supported_formats.map((fmt: string) => (
                            <Badge key={fmt} variant="outline" className="text-[9px] py-0 px-1 font-mono">
                              {fmt}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Diagnostics message */}
                    {rt.message && (
                      <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                        {rt.message}
                      </p>
                    )}

                    {/* Special section for llama.cpp parameters if local engine */}
                    {isLlama && !isHosted && (
                      <div className="space-y-2 pt-1 border-t border-border">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[10px] text-muted-foreground block">Threads</label>
                            <input
                              type="number"
                              value={llamaThreads}
                              onChange={(e) => setLlamaThreads(parseInt(e.target.value, 10) || 4)}
                              className="w-full h-7 px-2 rounded border border-input bg-background font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block">GPU Layers</label>
                            <input
                              type="number"
                              value={llamaNgl}
                              onChange={(e) => setLlamaNgl(parseInt(e.target.value, 10) || 0)}
                              className="w-full h-7 px-2 rounded border border-input bg-background font-mono text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <Button
                            size="sm"
                            onClick={handleStartLlama}
                            disabled={isStartingLlama || llama?.status?.healthy}
                            className="h-7 text-[11px] gap-1 flex-1"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            Start
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleStopLlama}
                            disabled={isStoppingLlama || !llama?.status?.running}
                            className="h-7 text-[11px] gap-1 flex-1"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            Stop
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Special section for llama.cpp hosted probe */}
                    {isLlama && isHosted && !isExactLocalEngine && (
                      <div className="flex items-center justify-between p-2 rounded border border-border bg-background/50">
                        <span className="text-[11px] text-muted-foreground">Probe :8080:</span>
                        <Button
                          size="sm"
                          variant={probeLlamaCpp ? 'default' : 'outline'}
                          onClick={handleToggleLlamaProbe}
                          className="h-6 text-[10px] px-2"
                        >
                          {probeLlamaCpp ? 'Probing On' : 'Enable Probe'}
                        </Button>
                      </div>
                    )}

                    {/* Special section for Ollama actions */}
                    {isOllamaRt && (
                      <div className="space-y-2 pt-1 border-t border-border">
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleTestOllamaConnection}
                            disabled={isTestingOllama}
                            className="h-7 text-[11px] gap-1 flex-1"
                          >
                            <RefreshCw className={cn('w-3 h-3', isTestingOllama && 'animate-spin')} />
                            Test Connection
                          </Button>
                          {isHosted && !isExactLocalEngine && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowCorsHelp((prev) => !prev)}
                              className="h-7 text-[11px] px-2 text-muted-foreground"
                            >
                              CORS
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Card Footer with Setup Guide link */}
                <div className="p-3 pt-0 border-t border-border/50 mt-2 flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenInstallGuide(rt.runtime_id)}
                    className="h-6 text-[11px] gap-1 px-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <BookOpen className="w-3 h-3" />
                    Setup Guide
                  </Button>
                  <Button
                    size="sm"
                    variant={isActive ? 'secondary' : 'default'}
                    onClick={() => switchRuntime(rt.runtime_id)}
                    className="h-6 text-[11px] px-2.5"
                  >
                    {isActive ? 'Active' : 'Use Runtime'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Ollama CORS Help Accordion (if open or blocked) */}
        {(isOllamaCorsBlocked || showCorsHelp) && (
          <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-amber-300">
                  Ollama is running but blocking this website (CORS)
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Browsers enforce Cross-Origin Resource Sharing (CORS) when connecting to local <code className="text-foreground">127.0.0.1:11434</code>. Allow this origin with one of the commands below:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
              <div className="rounded-md border border-border bg-background/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-foreground">Windows Session</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs gap-1"
                    onClick={() => handleCopy('ps', `$env:OLLAMA_ORIGINS="${typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com'}"; ollama serve`)}
                  >
                    {copiedKey === 'ps' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <pre className="p-1.5 rounded bg-muted/80 font-mono text-[10px] text-primary overflow-x-auto select-all">
                  {`$env:OLLAMA_ORIGINS="${typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com'}"; ollama serve`}
                </pre>
              </div>

              <div className="rounded-md border border-border bg-background/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-foreground">Windows Permanent</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs gap-1"
                    onClick={() => handleCopy('setx', `setx OLLAMA_ORIGINS "${typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com'}"`)}
                  >
                    {copiedKey === 'setx' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <pre className="p-1.5 rounded bg-muted/80 font-mono text-[10px] text-primary overflow-x-auto select-all">
                  {`setx OLLAMA_ORIGINS "${typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com'}"`}
                </pre>
              </div>

              <div className="rounded-md border border-border bg-background/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-foreground">macOS / Linux</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs gap-1"
                    onClick={() => handleCopy('mac', `OLLAMA_ORIGINS="${typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com'}" ollama serve`)}
                  >
                    {copiedKey === 'mac' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <pre className="p-1.5 rounded bg-muted/80 font-mono text-[10px] text-primary overflow-x-auto select-all">
                  {`OLLAMA_ORIGINS="${typeof window !== 'undefined' ? window.location.origin : 'https://lmlhe.onrender.com'}" ollama serve`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Runtime Installation & Setup Guide Dialog */}
      <Dialog open={guideModalOpen} onOpenChange={setGuideModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Runtime Installation & Setup Guide
            </DialogTitle>
            <DialogDescription>
              {selectedGuideRuntime}
            </DialogDescription>
          </DialogHeader>

          {isLoadingGuide ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
              Loading setup instructions...
            </div>
          ) : guideData ? (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <span>{guideData.icon}</span>
                    <span>{guideData.display_name}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {guideData.runtime_id}
                  </Badge>
                </div>
                <p className="text-muted-foreground leading-relaxed">{guideData.description}</p>
                {guideData.recommended_for && (
                  <div className="text-[11px] text-foreground font-medium pt-1">
                    <span className="text-muted-foreground">Best suited for: </span>
                    {guideData.recommended_for}
                  </div>
                )}
              </div>

              {/* Install Instructions */}
              {guideData.install_instructions && guideData.install_instructions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-semibold text-foreground">Step-by-Step Instructions:</span>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                    {guideData.install_instructions.map((step: string, i: number) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* One-Click Commands */}
              {guideData.one_click_commands && (
                <div className="space-y-2 pt-2">
                  <span className="font-semibold text-foreground">Installation Commands by Platform:</span>
                  {Object.entries(guideData.one_click_commands).map(([plat, cmd]: [string, any]) => (
                    <div key={plat} className="rounded-lg border border-border bg-background p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-[11px]">{plat}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(`guide_${plat}`, String(cmd))}
                          className="h-6 px-2 text-xs gap-1"
                        >
                          {copiedKey === `guide_${plat}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === `guide_${plat}` ? 'Copied' : 'Copy'}</span>
                        </Button>
                      </div>
                      <pre className="p-2 rounded bg-muted/60 font-mono text-[11px] text-primary overflow-x-auto select-all">
                        {String(cmd)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Verification */}
              {guideData.verification_steps && (
                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
                  <span className="font-medium text-foreground">Verification:</span>
                  <p className="text-muted-foreground font-mono text-[11px]">{guideData.verification_steps}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Instructions unavailable for this runtime.
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setGuideModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Model Technical Details Dialog */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Model Architecture & Technical Parameters</DialogTitle>
            <DialogDescription>{selectedModelForDetails?.name}</DialogDescription>
          </DialogHeader>

          {selectedModelForDetails && (
            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div>
                  <span className="text-muted-foreground block">Format:</span>
                  <span className="font-mono font-medium">{selectedModelForDetails.format}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Quantization:</span>
                  <span className="font-mono font-medium">{selectedModelForDetails.quantization}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Weights File Size:</span>
                  <span className="font-mono font-medium">{selectedModelForDetails.size_formatted} ({selectedModelForDetails.size_bytes.toLocaleString()} bytes)</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Context Length:</span>
                  <span className="font-mono font-medium">{selectedModelForDetails.context_length ? selectedModelForDetails.context_length.toLocaleString() : '4,096'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Parameter Size:</span>
                  <span className="font-medium">{selectedModelForDetails.parameter_size}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Architecture:</span>
                  <span className="font-medium">{selectedModelForDetails.architecture}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block">Absolute Path on Disk:</span>
                <pre className="p-2.5 rounded bg-muted/60 font-mono text-[11px] overflow-x-auto text-primary">
                  {selectedModelForDetails.path}
                </pre>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block">Compatible Execution Engines:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedModelForDetails.runtime_compatibility.map((rc) => (
                    <Badge key={rc} variant="purple" className="text-[10px]">
                      {rc}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setDetailsModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Register Model Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleAddModel}>
            <DialogHeader>
              <DialogTitle>Register Local Model</DialogTitle>
              <DialogDescription>
                Add an existing GGUF model file or Ollama model tag to the local registry
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">File Path or Ollama Tag *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. models/qwen.gguf or C:\path\model.gguf"
                  value={newModelPath}
                  onChange={(e) => setNewModelPath(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-background border border-input text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Custom Display Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Qwen 2.5 7B Q4"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-background border border-input text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
              <Button type="submit">Register</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Monitored Directories Modal */}
      <Dialog open={dirsModalOpen} onOpenChange={setDirsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Monitored Model Directories</DialogTitle>
            <DialogDescription>
              Folders scanned automatically for supported model formats (.gguf, .safetensors, .onnx)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-2">
              {(config?.model_directories || []).map((dir) => (
                <div key={dir} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card">
                  <span className="font-mono text-foreground truncate max-w-[320px]" title={dir}>{dir}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveDirectory(dir)}
                    className="h-7 px-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <input
                type="text"
                placeholder="Directory path, e.g. D:\AI\Models"
                value={newDirectoryPath}
                onChange={(e) => setNewDirectoryPath(e.target.value)}
                className="flex-1 h-9 px-3 rounded-md bg-background border border-input text-xs font-mono"
              />
              <Button size="sm" onClick={handleAddDirectory} className="gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setDirsModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
