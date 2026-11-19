import React, { useState } from 'react';
import {
  Package,
  Terminal,
  Cloud,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  Server,
  Layers,
  Monitor,
  Apple,
  Cpu,
  FileCode,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function DeploymentPage() {
  const { config, hardware } = useEngine();
  const { showSuccess } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const deployment = config?.deployment || {
    is_hosted: false,
    environment: 'development',
    provider: 'Local Machine',
    target_scope: 'local_workstation',
    badge_text: 'LOCAL WORKSTATION',
    description: 'Local developer workstation',
    hardware_notice: 'Hardware telemetry reflects your local physical machine.',
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    showSuccess('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const windowsScript = `@echo off
:: Large-Model-on-Light-Hardware Engine: Windows Launcher
call packaging\\windows.bat`;

  const linuxScript = `#!/usr/bin/env bash
# Large-Model-on-Light-Hardware Engine: Linux Setup & Run
chmod +x packaging/linux.sh
./packaging/linux.sh`;

  const macosScript = `#!/usr/bin/env bash
# Large-Model-on-Light-Hardware Engine: macOS Metal Launcher
chmod +x packaging/macos.sh
./packaging/macos.sh`;

  const dockerfileSnippet = `# Multi-stage lightweight inference container
FROM python:3.11-slim-bookworm AS backend

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl git build-essential procps \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose default HTTP port
EXPOSE 8000
ENV PORT=8000
ENV ALLOW_REMOTE_ACCESS=true

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`;

  const dockerRunSnippet = `# Build and launch engine in Docker
docker build -t lmlhe-engine:latest .
docker run -d -p 8000:8000 -v $(pwd)/storage:/app/storage --name lmlhe lmlhe-engine:latest`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Deployment, Packaging & Distribution Matrix
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated platform installers, standalone execution bundles, Docker containerization, and cloud deployment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={deployment.is_hosted ? 'warning' : 'outline'}
            className="font-mono text-xs uppercase"
          >
            {deployment.badge_text}
          </Badge>
        </div>
      </div>

      {/* Deployment Profile Notice Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" />
              Runtime Environment: {deployment.provider} ({deployment.environment.toUpperCase()})
            </div>
            <p className="text-muted-foreground">{deployment.hardware_notice}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-xs text-foreground">
                {window.location.protocol}//{window.location.host}
              </div>
              <div className="text-[10px] text-muted-foreground">Active Web Endpoint</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cross-Platform Packaging Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          Automated Cross-Platform Launchers
        </h3>
        <p className="text-xs text-muted-foreground">
          Self-contained launch scripts inspect system architecture, configure isolated Python virtualenvs, detect GPU compute (CUDA/Metal/Vulkan/DirectML), resolve runtime engines, and initialize the application.
        </p>

        <Tabs defaultValue="windows" className="pt-2">
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="windows" className="text-xs gap-1.5">
              <Monitor className="w-3.5 h-3.5" />
              Windows (x64)
            </TabsTrigger>
            <TabsTrigger value="linux" className="text-xs gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Linux (Ubuntu/Arch)
            </TabsTrigger>
            <TabsTrigger value="macos" className="text-xs gap-1.5">
              <Apple className="w-3.5 h-3.5" />
              macOS (Metal/M-Series)
            </TabsTrigger>
          </TabsList>

          {/* Windows Tab */}
          <TabsContent value="windows" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Windows Automated Packaging Script</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    packaging/windows.bat
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Automates venv creation, DirectML/CUDA detection, pip dependencies, llama-server resolution, and launches the browser UI.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                    {windowsScript}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(windowsScript, 'win')}
                    className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
                  >
                    {copiedKey === 'win' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'win' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Target Architecture</div>
                    <div className="text-muted-foreground text-[11px]">AMD64 / Intel x86_64, Windows 10/11</div>
                  </div>
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Python Runtime</div>
                    <div className="text-muted-foreground text-[11px]">Python 3.10+ (Automatic venv setup)</div>
                  </div>
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Acceleration APIs</div>
                    <div className="text-muted-foreground text-[11px]">NVIDIA CUDA, Vulkan, DirectML fallback</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Linux Tab */}
          <TabsContent value="linux" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Linux Setup & Service Script</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    packaging/linux.sh
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Shell script with apt/dnf/pacman dependency detection, systemd service installation, ROCm/CUDA detection.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                    {linuxScript}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(linuxScript, 'linux')}
                    className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
                  >
                    {copiedKey === 'linux' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'linux' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Distro Support</div>
                    <div className="text-muted-foreground text-[11px]">Debian, Ubuntu 22+, Fedora, Arch</div>
                  </div>
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Daemon Support</div>
                    <div className="text-muted-foreground text-[11px]">Optional systemd unit generation</div>
                  </div>
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Compute Runtimes</div>
                    <div className="text-muted-foreground text-[11px]">NVIDIA CUDA 12, AMD ROCm, CPU OpenBLAS</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* macOS Tab */}
          <TabsContent value="macos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">macOS Metal Acceleration Launcher</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    packaging/macos.sh
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Native Apple Silicon Metal offloading support (M1/M2/M3/M4) via Homebrew llama.cpp integration.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-border/40">
                    {macosScript}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(macosScript, 'mac')}
                    className="absolute top-2 right-2 h-7 gap-1 text-[11px]"
                  >
                    {copiedKey === 'mac' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'mac' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Apple Silicon</div>
                    <div className="text-muted-foreground text-[11px]">Unified Memory Metal framework</div>
                  </div>
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">Package Manager</div>
                    <div className="text-muted-foreground text-[11px]">Homebrew (brew install ollama / llama.cpp)</div>
                  </div>
                  <div className="p-2.5 rounded border border-border bg-card/40">
                    <div className="font-semibold text-foreground">OS Versions</div>
                    <div className="text-muted-foreground text-[11px]">macOS Monterey, Ventura, Sonoma, Sequoia</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Cloud & Containerization Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Docker Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary" />
              Docker Containerization
            </CardTitle>
            <CardDescription className="text-xs">
              Portable OCI container image for reproducible cloud deployments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="relative">
              <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto border border-border/40 max-h-56">
                {dockerfileSnippet}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(dockerfileSnippet, 'dockerfile')}
                className="absolute top-2 right-2 h-6 gap-1 text-[10px]"
              >
                {copiedKey === 'dockerfile' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'dockerfile' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="relative">
              <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto border border-border/40">
                {dockerRunSnippet}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(dockerRunSnippet, 'dockerrun')}
                className="absolute top-2 right-2 h-6 gap-1 text-[10px]"
              >
                {copiedKey === 'dockerrun' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'dockerrun' ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cloud Hosting: Render, Hugging Face, Fly.io */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" />
              Cloud PaaS & Hosted Deployment
            </CardTitle>
            <CardDescription className="text-xs">
              Configuration profile for hosted cloud instances (Render, HF Spaces, Fly.io).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-lg border border-border bg-card/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Render.com Web Service</span>
                <Badge variant="outline" className="text-[10px]">
                  Render Live
                </Badge>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Configured with dynamic port binding (<code className="text-primary font-mono">$PORT</code>), non-root execution, and React SPA static serving.
              </p>
              <div className="space-y-1 font-mono text-[11px] bg-slate-950 p-2.5 rounded text-slate-200">
                <div>Build: pip install -r requirements.txt && cd frontend && npm install && npm run build</div>
                <div>Start: uvicorn main:app --host 0.0.0.0 --port $PORT</div>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card/40 space-y-1.5">
              <span className="font-semibold text-foreground">Production Deployment URL</span>
              <div className="flex items-center justify-between font-mono text-[11px] text-primary">
                <a
                  href="https://lmlhe.onrender.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  https://lmlhe.onrender.com
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-muted-foreground text-[10px]">Render Web Service</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Environment Variables Reference Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Environment Variables & Configuration Flags
          </CardTitle>
          <CardDescription className="text-xs">
            Environment variables supported for 12-factor application orchestration and container deployments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-2.5 font-mono">Variable</th>
                  <th className="p-2.5">Default</th>
                  <th className="p-2.5">Scope</th>
                  <th className="p-2.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-[11px]">
                <tr>
                  <td className="p-2.5 font-bold text-foreground">PORT</td>
                  <td className="p-2.5 text-muted-foreground">8000</td>
                  <td className="p-2.5 text-muted-foreground">Cloud / Container</td>
                  <td className="p-2.5 font-sans text-muted-foreground">HTTP server listen port; overridden by cloud providers (e.g. Render).</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-foreground">API_KEY</td>
                  <td className="p-2.5 text-muted-foreground">None</td>
                  <td className="p-2.5 text-muted-foreground">Security</td>
                  <td className="p-2.5 font-sans text-muted-foreground">Master API secret for Bearer token and X-API-Key request authentication.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-foreground">ALLOW_REMOTE_ACCESS</td>
                  <td className="p-2.5 text-muted-foreground">true</td>
                  <td className="p-2.5 text-muted-foreground">Network</td>
                  <td className="p-2.5 font-sans text-muted-foreground">Permits non-localhost incoming requests; auto-enabled on cloud containers.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-foreground">REQUIRE_AUTH_FOR_LOCAL</td>
                  <td className="p-2.5 text-muted-foreground">false</td>
                  <td className="p-2.5 text-muted-foreground">Security</td>
                  <td className="p-2.5 font-sans text-muted-foreground">When true, requires API keys even for loopback 127.0.0.1 workstation requests.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-foreground">WEB_CONCURRENCY</td>
                  <td className="p-2.5 text-muted-foreground">1</td>
                  <td className="p-2.5 text-muted-foreground">Process</td>
                  <td className="p-2.5 font-sans text-muted-foreground">Uvicorn concurrency worker count (recommended 1 for local inference locks).</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-foreground">OLLAMA_HOST</td>
                  <td className="p-2.5 text-muted-foreground">http://127.0.0.1:11434</td>
                  <td className="p-2.5 text-muted-foreground">Runtime</td>
                  <td className="p-2.5 font-sans text-muted-foreground">Upstream daemon endpoint for Ollama model querying and generation.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
