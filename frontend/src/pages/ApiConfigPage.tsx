import React, { useState, useEffect } from 'react';
import {
  Code,
  Key,
  Shield,
  Sliders,
  FolderOpen,
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  Cpu,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { EngineConfig } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

export function ApiConfigPage() {
  const { config, models, runtimes, refreshConfig, refreshModels } = useEngine();
  const { showSuccess, showError, showInfo } = useToast();

  const [formData, setFormData] = useState<EngineConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [clientKey, setClientKey] = useState(api.getApiKey() || '');
  const [showClientKey, setShowClientKey] = useState(false);

  const [newDirInput, setNewDirInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; warnings: string[]; errors: string[] } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Sync formData from loaded config
  useEffect(() => {
    if (config) {
      setFormData(JSON.parse(JSON.stringify(config)));
    }
  }, [config]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    showSuccess('Code copied to clipboard');
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const handleSaveClientKey = () => {
    api.setApiKey(clientKey.trim());
    showSuccess(clientKey.trim() ? 'Client API key saved for session' : 'Client API key cleared');
  };

  const handleSaveConfig = async () => {
    if (!formData) return;
    setIsSaving(true);
    setValidationResult(null);
    try {
      // If user typed a new master API key into the form, assign it
      const payload: any = { ...formData };
      if (apiKeyInput.trim()) {
        payload.security = {
          ...payload.security,
          api_key: apiKeyInput.trim(),
        };
      }
      const res = await api.saveConfig(payload);
      showSuccess('Configuration successfully saved to disk');
      setApiKeyInput('');
      await refreshConfig();
    } catch (err: any) {
      showError(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateConfig = async () => {
    if (!formData) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await api.validateConfig(formData);
      setValidationResult(res);
      if (res.valid && (!res.errors || res.errors.length === 0)) {
        showSuccess('Configuration is valid and ready for inference');
      } else {
        showError('Configuration validation found potential issues');
      }
    } catch (err: any) {
      showError(err.message || 'Validation request failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddDirectory = async () => {
    const dir = newDirInput.trim();
    if (!dir) return;
    try {
      await api.addDirectory(dir);
      showSuccess(`Directory registered: ${dir}`);
      setNewDirInput('');
      await refreshConfig();
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Failed to add model directory');
    }
  };

  const handleRemoveDirectory = async (dir: string) => {
    try {
      await api.removeDirectory(dir);
      showSuccess(`Directory removed: ${dir}`);
      await refreshConfig();
      await refreshModels();
    } catch (err: any) {
      showError(err.message || 'Failed to remove directory');
    }
  };

  // Base URL calculation
  const origin = window.location.origin;
  const activeModelId = config?.active_model_id || 'llama3.2:1b';

  // Integration Snippets
  const curlSnippet = `curl -X POST "${origin}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  ${clientKey ? `-H "Authorization: Bearer ${clientKey}" \\\n  ` : ''}-d '{
    "model": "${activeModelId}",
    "messages": [
      {"role": "system", "content": "You are a concise, helpful assistant."},
      {"role": "user", "content": "Explain quantization in two sentences."}
    ],
    "temperature": 0.7,
    "max_tokens": 128
  }'`;

  const pythonSnippet = `from openai import OpenAI

# Connect to Large-Model-on-Light-Hardware Engine
client = OpenAI(
    base_url="${origin}/v1",
    api_key="${clientKey || 'none'}",  # Optional if running locally
)

response = client.chat.completions.create(
    model="${activeModelId}",
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "Explain quantization in two sentences."}
    ],
    temperature=0.7,
    max_tokens=128,
)

print(response.choices[0].message.content)`;

  const jsSnippet = `// Node.js or Browser fetch request
const response = await fetch("${origin}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ${clientKey ? `"Authorization": "Bearer ${clientKey}",` : ''}
  },
  body: JSON.stringify({
    model: "${activeModelId}",
    messages: [
      { role: "system", content: "You are a concise assistant." },
      { role: "user", content: "Explain quantization in two sentences." }
    ],
    temperature: 0.7,
    max_tokens: 128
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);`;

  const nativeSnippet = `curl -X POST "${origin}/api/v1/inference/generate" \\
  -H "Content-Type: application/json" \\
  ${clientKey ? `-H "X-API-Key: ${clientKey}" \\\n  ` : ''}-d '{
    "prompt": "Explain quantization in two sentences.",
    "model": "${activeModelId}",
    "max_tokens": 128,
    "temperature": 0.7
  }'`;

  if (!formData) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Loading configuration settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            Project 3 API & Configuration Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            OpenAI-compatible endpoints, access control credentials, directory discovery and hardware runtime profiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleValidateConfig}
            disabled={isValidating}
            className="gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" />
            {isValidating ? 'Validating...' : 'Validate Config'}
          </Button>
          <Button
            size="sm"
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Validation Banner if available */}
      {validationResult && (
        <div
          className={`p-4 rounded-lg border text-xs space-y-2 ${
            validationResult.valid && (!validationResult.errors || validationResult.errors.length === 0)
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {validationResult.valid ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {validationResult.valid ? 'Configuration Validated Successfully' : 'Configuration Issues Detected'}
          </div>
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-amber-400">
              {validationResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {validationResult.errors && validationResult.errors.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-rose-400">
              {validationResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Project 3 OpenAI Integration Hub */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                Project 3: OpenAI-Compatible REST Endpoints
              </CardTitle>
              <CardDescription>
                Zero-code drop-in replacement for OpenAI SDKs, LangChain, LlamaIndex, LiteLLM, and autonomous agents.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              /v1/chat/completions
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client Key Injector */}
          <div className="p-3.5 rounded-lg border border-border bg-card/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Key className="w-3.5 h-3.5 text-primary" />
                Frontend / Client API Key (Session-Stored)
              </span>
              <span className="text-[11px] text-muted-foreground">
                {api.getApiKey() ? 'Authenticated' : 'No key set'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Provide this key if your server has authentication enabled (`api_key` set or remote caller). It will be injected automatically into all dashboard API calls and sample code snippets.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showClientKey ? 'text' : 'password'}
                  value={clientKey}
                  onChange={(e) => setClientKey(e.target.value)}
                  placeholder="Enter API key for authentication..."
                  className="w-full h-8 px-3 pr-8 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowClientKey(!showClientKey)}
                  className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                >
                  {showClientKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button size="sm" onClick={handleSaveClientKey} className="h-8 text-xs">
                Apply Key
              </Button>
            </div>
          </div>

          {/* Interactive Snippets */}
          <Tabs defaultValue="python">
            <TabsList>
              <TabsTrigger value="python">Python (OpenAI SDK)</TabsTrigger>
              <TabsTrigger value="curl">cURL (REST)</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript / Node</TabsTrigger>
              <TabsTrigger value="native">Native Engine API</TabsTrigger>
            </TabsList>

            <TabsContent value="python" className="relative mt-2">
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                {pythonSnippet}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(pythonSnippet, 'python')}
                className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
              >
                {copiedSnippet === 'python' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedSnippet === 'python' ? 'Copied' : 'Copy'}
              </Button>
            </TabsContent>

            <TabsContent value="curl" className="relative mt-2">
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                {curlSnippet}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(curlSnippet, 'curl')}
                className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
              >
                {copiedSnippet === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedSnippet === 'curl' ? 'Copied' : 'Copy'}
              </Button>
            </TabsContent>

            <TabsContent value="javascript" className="relative mt-2">
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                {jsSnippet}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(jsSnippet, 'js')}
                className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
              >
                {copiedSnippet === 'js' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedSnippet === 'js' ? 'Copied' : 'Copy'}
              </Button>
            </TabsContent>

            <TabsContent value="native" className="relative mt-2">
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                {nativeSnippet}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(nativeSnippet, 'native')}
                className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
              >
                {copiedSnippet === 'native' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedSnippet === 'native' ? 'Copied' : 'Copy'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Core Engine Settings Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Runtime & llama.cpp Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              Inference Runtime Profiles
            </CardTitle>
            <CardDescription>
              Execution parameters for local llama.cpp server and Ollama backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {/* Active Runtime */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">Active Runtime Engine</label>
              <select
                value={formData.active_runtime}
                onChange={(e) => setFormData({ ...formData, active_runtime: e.target.value })}
                className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="llama.cpp">llama.cpp server</option>
                <option value="ollama">Ollama engine</option>
              </select>
            </div>

            {/* Active Model */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">Default Active Model</label>
              <select
                value={formData.active_model_id || ''}
                onChange={(e) => setFormData({ ...formData, active_model_id: e.target.value })}
                className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">None Selected</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.format} - {m.quantization})
                  </option>
                ))}
              </select>
            </div>

            {/* llama.cpp Executable Path */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="font-medium text-foreground">llama-server Executable Path</label>
              <input
                type="text"
                value={formData.llama_cpp.executable_path || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    llama_cpp: { ...formData.llama_cpp, executable_path: e.target.value },
                  })
                }
                placeholder="e.g. C:\path\to\llama-server.exe or /usr/local/bin/llama-server"
                className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Host & Port */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">llama.cpp Host</label>
                <input
                  type="text"
                  value={formData.llama_cpp.host}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, host: e.target.value },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">llama.cpp Port</label>
                <input
                  type="number"
                  value={formData.llama_cpp.port}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, port: parseInt(e.target.value) || 8080 },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Threads & GPU Layers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">CPU Threads (-t)</label>
                <input
                  type="number"
                  value={formData.llama_cpp.threads}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, threads: parseInt(e.target.value) || 4 },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">GPU Offload Layers (-ngl)</label>
                <input
                  type="number"
                  value={formData.llama_cpp.gpu_layers}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, gpu_layers: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Context Size & Batch */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Context Window (-c)</label>
                <input
                  type="number"
                  value={formData.llama_cpp.context_size}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, context_size: parseInt(e.target.value) || 2048 },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Batch Size (-b)</label>
                <input
                  type="number"
                  value={formData.llama_cpp.batch_size}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, batch_size: parseInt(e.target.value) || 512 },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* MMAP & Flash Attention switches */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex items-center justify-between p-2.5 rounded border border-border">
                <span className="font-medium text-foreground">Memory Map (mmap)</span>
                <Switch
                  checked={formData.llama_cpp.use_mmap}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, use_mmap: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded border border-border">
                <span className="font-medium text-foreground">Flash Attention (-fa)</span>
                <Switch
                  checked={formData.llama_cpp.flash_attn}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      llama_cpp: { ...formData.llama_cpp, flash_attn: checked },
                    })
                  }
                />
              </div>
            </div>

            {/* Ollama Base URL */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="font-medium text-foreground">Ollama Service URL</label>
              <input
                type="text"
                value={formData.ollama.base_url}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ollama: { ...formData.ollama, base_url: e.target.value },
                  })
                }
                placeholder="http://127.0.0.1:11434"
                className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </CardContent>
        </Card>

        {/* Security & Monitored Directories */}
        <div className="space-y-6">
          {/* Security & Access Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Network & Security Controls
              </CardTitle>
              <CardDescription>
                Server listener binding, remote access authorization and master API keys.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Listen Host</label>
                  <input
                    type="text"
                    value={formData.security.listen_host}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, listen_host: e.target.value },
                      })
                    }
                    className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Listen Port</label>
                  <input
                    type="number"
                    value={formData.security.listen_port}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, listen_port: parseInt(e.target.value) || 8000 },
                      })
                    }
                    className="w-full h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Switches */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between p-2.5 rounded border border-border">
                  <div>
                    <div className="font-medium text-foreground">Allow Remote Network Access</div>
                    <div className="text-[11px] text-muted-foreground">Permit access from non-localhost IPs</div>
                  </div>
                  <Switch
                    checked={formData.security.allow_remote_access}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, allow_remote_access: checked },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded border border-border">
                  <div>
                    <div className="font-medium text-foreground">Require Auth for Local Workstation</div>
                    <div className="text-[11px] text-muted-foreground">Enforce API key even for localhost calls</div>
                  </div>
                  <Switch
                    checked={formData.security.require_auth_for_local}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, require_auth_for_local: checked },
                      })
                    }
                  />
                </div>
              </div>

              {/* Set New Master Key */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-foreground">Master API Key</label>
                  <span className="text-[11px] text-muted-foreground">
                    {formData.security.api_key_configured ? 'Currently Configured' : 'None Set (Open Access)'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Enter new master API key to overwrite..."
                    className="w-full h-8 px-3 pr-8 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Leave blank to retain current key. To remove protection, clear value and save.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Monitored Directories */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" />
                Monitored GGUF Directories
              </CardTitle>
              <CardDescription>
                Filesystem directories scanned automatically on startup and refresh.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="space-y-2">
                {formData.model_directories.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between p-2 rounded bg-muted/40 border border-border font-mono text-xs"
                  >
                    <span className="truncate max-w-[280px]" title={dir}>
                      {dir}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveDirectory(dir)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add Directory Input */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <input
                  type="text"
                  value={newDirInput}
                  onChange={(e) => setNewDirInput(e.target.value)}
                  placeholder="e.g. D:\AI\Models or /mnt/data/models"
                  className="flex-1 h-8 px-2.5 rounded-md bg-background border border-input text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddDirectory();
                  }}
                />
                <Button size="sm" onClick={handleAddDirectory} className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  Add Path
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
