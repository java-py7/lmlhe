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
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { ModelEntry } from '@/lib/types';
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
    localAgent,
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

  // Modals
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedModelForDetails, setSelectedModelForDetails] = useState<ModelEntry | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newModelPath, setNewModelPath] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const [dirsModalOpen, setDirsModalOpen] = useState(false);
  const [newDirectoryPath, setNewDirectoryPath] = useState('');

  // Process settings inputs
  const [llamaThreads, setLlamaThreads] = useState(config?.llama_cpp?.threads || 4);
  const [llamaNgl, setLlamaNgl] = useState(config?.llama_cpp?.gpu_layers !== undefined ? config.llama_cpp.gpu_layers : 0);
  const [llamaCtx, setLlamaCtx] = useState(config?.llama_cpp?.context_size || 2048);
  const [llamaPort, setLlamaPort] = useState(config?.llama_cpp?.port || 8080);

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
      if (localAgent.status === 'connected') {
        const res = await api.localAgent.getModels();
        showSuccess(`Scan completed: discovered ${res.models?.length || 0} local models via Local Agent`);
      } else {
        const res = await api.scanModels();
        showSuccess(`Scan completed: discovered ${res.count} models (${res.available_count} available)`);
      }
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Model scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (localAgent.status === 'connected') {
        await refreshModels();
        await refreshRuntimes();
        showSuccess('Refreshed local models and runtimes via Local Agent');
      } else {
        const res = await api.refreshModels();
        showSuccess(`Refreshed ${res.count} models (${res.available_count} available)`);
        await refreshModels();
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
            </Select>
            <Select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="h-8 text-xs">
              <option value="all">All Formats</option>
              <option value="gguf">GGUF</option>
              <option value="ollama">Ollama</option>
              <option value="safetensors">Safetensors</option>
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
                {localAgent.status !== 'connected'
                  ? 'Local Agent Offline'
                  : 'No models found matching current filters.'}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                {localAgent.status !== 'connected'
                  ? 'To discover your local Ollama models and GGUFs on this PC, run start_local_agent.bat on your computer.'
                  : 'Add model directories or install models in Ollama, then click Scan All.'}
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

      {/* Runtime Manager Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* llama.cpp server */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="radio-llama"
                  name="runtime-active"
                  checked={activeRuntime === 'llama.cpp server'}
                  onChange={() => switchRuntime('llama.cpp server')}
                  className="cursor-pointer accent-primary"
                />
                <label htmlFor="radio-llama" className="text-sm font-semibold cursor-pointer">
                  llama.cpp server mode
                </label>
              </div>
              <Badge variant={llama?.status?.healthy ? 'success' : llama?.status?.running ? 'warning' : 'outline'} className="text-[10px] font-mono">
                {llama?.status?.healthy ? 'RUNNING & READY' : llama?.status?.running ? 'STARTING' : 'STOPPED'}
              </Badge>
            </div>
            <CardDescription>Standalone high-performance C++ LLM inference engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Binary Executable:</span>
                <span className="font-mono text-foreground truncate max-w-[240px]" title={llama?.executable_path}>
                  {llama?.executable_path || 'Not detected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Process State:</span>
                <span className="font-mono text-foreground">
                  {llama?.status?.running ? `PID ${llama.status.pid} on port ${llama.status.port}` : 'Not running'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resident Memory (RSS):</span>
                <span className="font-mono text-foreground">{llama?.status?.memory_rss_formatted || '0 B'}</span>
              </div>
            </div>

            {/* Launch parameters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Threads (-t)</label>
                <input
                  type="number"
                  value={llamaThreads}
                  onChange={(e) => setLlamaThreads(parseInt(e.target.value, 10) || 4)}
                  className="w-full h-8 px-2 rounded border border-input bg-background font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">GPU Layers (-ngl)</label>
                <input
                  type="number"
                  value={llamaNgl}
                  onChange={(e) => setLlamaNgl(parseInt(e.target.value, 10) || 0)}
                  className="w-full h-8 px-2 rounded border border-input bg-background font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Context (-c)</label>
                <input
                  type="number"
                  value={llamaCtx}
                  onChange={(e) => setLlamaCtx(parseInt(e.target.value, 10) || 2048)}
                  className="w-full h-8 px-2 rounded border border-input bg-background font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Port</label>
                <input
                  type="number"
                  value={llamaPort}
                  onChange={(e) => setLlamaPort(parseInt(e.target.value, 10) || 8080)}
                  className="w-full h-8 px-2 rounded border border-input bg-background font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleStartLlama}
                disabled={isStartingLlama || llama?.status?.healthy}
                className="gap-1.5 text-xs flex-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Server Process
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleStopLlama}
                disabled={isStoppingLlama || !llama?.status?.running}
                className="gap-1.5 text-xs flex-1"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop Server
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Ollama runtime */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="radio-ollama"
                  name="runtime-active"
                  checked={activeRuntime === 'ollama'}
                  onChange={() => switchRuntime('ollama')}
                  className="cursor-pointer accent-primary"
                />
                <label htmlFor="radio-ollama" className="text-sm font-semibold cursor-pointer">
                  Ollama Service Integration
                </label>
              </div>
              <Badge variant={ollama?.detected ? 'success' : 'destructive'} className="text-[10px] font-mono">
                {ollama?.detected ? `CONNECTED (v${ollama.version})` : 'SERVICE OFFLINE'}
              </Badge>
            </div>
            <CardDescription>Managed local Ollama daemon integration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service API Endpoint:</span>
                <span className="font-mono text-foreground">{ollama?.base_url || 'http://127.0.0.1:11434'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daemon Version:</span>
                <span className="font-mono text-foreground">{ollama?.version || 'Unavailable'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Running Models in Memory:</span>
                <span className="font-mono text-primary truncate max-w-[240px]">
                  {(ollama?.running_models || []).map((m) => m.name).join(', ') || 'None in memory'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
              Ollama operates as a background system daemon with automatic GPU VRAM allocation. When an Ollama model is selected, the application routes inference directly through Ollama's local HTTP API without spawning separate subprocesses.
            </p>

            <div className="pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  showInfo('Checking Ollama daemon responsiveness...');
                  await refreshRuntimes();
                  if (runtimes?.ollama?.detected) {
                    showSuccess('Ollama daemon is connected and healthy!');
                  } else {
                    showError('Ollama service is unreachable. Ensure the Ollama daemon is running.');
                  }
                }}
                className="w-full text-xs gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Test Ollama Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
