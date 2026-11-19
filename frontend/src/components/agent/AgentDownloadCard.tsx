import React, { useState, useEffect } from 'react';
import {
  Download,
  Laptop,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderArchive,
  PlayCircle,
  Radio,
  ChevronDown,
  ChevronUp,
  Settings2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { AgentInstallersResponse, AgentInstallerItem } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AgentDownloadCardProps {
  compact?: boolean;
  className?: string;
}

export function AgentDownloadCard({ compact = false, className = '' }: AgentDownloadCardProps) {
  const { localAgent, checkLocalAgent, setLocalAgentUrl } = useEngine();
  const { showSuccess, showError, showInfo } = useToast();

  const [installers, setInstallers] = useState<AgentInstallersResponse['installers'] | null>(null);
  const [selectedOS, setSelectedOS] = useState<'windows' | 'linux' | 'macos'>('windows');
  const [isChecking, setIsChecking] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const initialUrl =
    localAgent.url && !localAgent.url.includes(':8000') ? localAgent.url : 'http://127.0.0.1:8008';
  const [inputUrl, setInputUrl] = useState(initialUrl);

  // Detect user OS on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      if (ua.includes('win')) {
        setSelectedOS('windows');
      } else if (ua.includes('mac')) {
        setSelectedOS('macos');
      } else if (ua.includes('linux')) {
        setSelectedOS('linux');
      }
    }
  }, []);

  // Fetch installer metadata from backend
  useEffect(() => {
    let isMounted = true;
    api
      .getAgentInstallers()
      .then((res) => {
        if (isMounted && res && res.installers) {
          setInstallers(res.installers);
        }
      })
      .catch(() => {
        // Fallback defaults if endpoint unreachable
        if (isMounted) {
          setInstallers({
            windows: {
              os: 'Windows',
              name: 'Windows 10 / 11 (64-bit)',
              available: true,
              filename: 'LMLHE-Local-Agent-Windows-x64.zip',
              download_url: '/api/v1/agent/download/windows',
              direct_url: '/downloads/LMLHE-Local-Agent-Windows-x64.zip',
              size_formatted: '41.2 MB',
              format: 'Standalone Portable (.zip)',
              badge: 'DOWNLOAD READY',
              auto_start: true,
              instructions: [
                'Download the standalone Windows agent archive',
                'Extract the ZIP folder to your preferred location',
                "Double-click 'LMLHE-Agent.exe' (or 'Start-Agent.bat')",
                'The dashboard connects automatically — no terminal needed',
              ],
            },
            linux: {
              os: 'Linux',
              name: 'Linux (x86_64, aarch64)',
              available: false,
              status: 'coming_soon',
              format: '.deb / .tar.gz',
              badge: 'COMING SOON',
              message: 'Linux standalone installer package is coming soon.',
            },
            macos: {
              os: 'macOS',
              name: 'macOS (Apple Silicon & Intel)',
              available: false,
              status: 'coming_soon',
              format: '.dmg / .pkg',
              badge: 'COMING SOON',
              message: 'macOS standalone installer package is coming soon.',
            },
          });
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleManualConnect = async () => {
    setIsChecking(true);
    showInfo(`Probing local agent at ${inputUrl}...`);
    try {
      const ok = await checkLocalAgent(inputUrl.trim());
      if (ok) {
        showSuccess('Successfully connected to Local PC Agent!');
      } else {
        showError(
          'Could not reach Local Agent at this address. Make sure LMLHE-Agent.exe has been launched on your computer.'
        );
      }
    } catch (err: any) {
      showError(err.message || 'Connection attempt failed');
    } finally {
      setIsChecking(false);
    }
  };

  const currentPkg: AgentInstallerItem = installers?.[selectedOS] || {
    os: selectedOS === 'windows' ? 'Windows' : selectedOS === 'linux' ? 'Linux' : 'macOS',
    name:
      selectedOS === 'windows'
        ? 'Windows 10 / 11 (64-bit)'
        : selectedOS === 'linux'
        ? 'Linux (x86_64)'
        : 'macOS (Apple Silicon & Intel)',
    available: selectedOS === 'windows',
    download_url: selectedOS === 'windows' ? '/api/v1/agent/download/windows' : undefined,
    size_formatted: selectedOS === 'windows' ? '41.2 MB' : undefined,
    format: selectedOS === 'windows' ? 'Standalone Portable (.zip)' : undefined,
    badge: selectedOS === 'windows' ? 'DOWNLOAD READY' : 'COMING SOON',
  };

  return (
    <Card className={`border-amber-500/30 bg-amber-500/5 overflow-hidden ${className}`}>
      <CardContent className={compact ? 'p-4 space-y-3' : 'p-5 space-y-4'}>
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                Connect Your Computer with Local PC Agent
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-mono text-amber-400 border-amber-400/40"
                >
                  LOCAL AGENT OFFLINE
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">
                Download the standalone agent to inspect your physical CPU, RAM, discrete GPU, and local Ollama models.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleManualConnect}
            disabled={isChecking}
            className="h-8 gap-1.5 text-xs font-medium shrink-0 bg-background/80 hover:bg-background"
          >
            <RefreshCw className={isChecking ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5 text-primary'} />
            {isChecking ? 'Checking...' : 'Check Connection'}
          </Button>
        </div>

        {/* Operating System Selector Tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Select OS:</span>
          {(['windows', 'linux', 'macos'] as const).map((osKey) => {
            const isSelected = selectedOS === osKey;
            const isAvail = osKey === 'windows';
            return (
              <button
                key={osKey}
                type="button"
                onClick={() => setSelectedOS(osKey)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card/70 text-muted-foreground border-border hover:text-foreground hover:bg-card'
                }`}
              >
                <span>
                  {osKey === 'windows' ? 'Windows' : osKey === 'linux' ? 'Linux' : 'macOS'}
                </span>
                {isAvail ? (
                  <span
                    className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                      isSelected
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    READY
                  </span>
                ) : (
                  <span
                    className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                      isSelected
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    SOON
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Main Content Area based on OS */}
        {selectedOS === 'windows' ? (
          <div className="space-y-4">
            {/* Download Action Banner */}
            <div className="p-4 rounded-xl bg-card border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground text-sm">
                    {currentPkg.name || 'Windows 10 / 11 (64-bit)'}
                  </span>
                  <Badge variant="success" className="text-[10px] font-mono">
                    STANDALONE PORTABLE
                  </Badge>
                  {currentPkg.size_formatted && (
                    <span className="text-xs text-muted-foreground font-mono">
                      • {currentPkg.size_formatted}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Complete standalone application with pre-packaged runtime. No Python, terminal, or GitHub setup needed.
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> No installation or admin rights required
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Auto-starts background service on launch
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full md:w-auto">
                <a
                  href={currentPkg.download_url || '/api/v1/agent/download/windows'}
                  download="LMLHE-Local-Agent-Windows-x64.zip"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Agent for Windows
                </a>
              </div>
            </div>

            {/* 3 Clear Non-Technical Steps */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-card/60 border border-border space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                    1
                  </div>
                  <FolderArchive className="w-4 h-4 text-primary" />
                  <span>Download & Extract</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Download the ZIP package and extract it to any convenient folder on your PC.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-card/60 border border-border space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                    2
                  </div>
                  <PlayCircle className="w-4 h-4 text-primary" />
                  <span>Double-Click Agent</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Double-click <strong className="text-foreground">LMLHE-Agent.exe</strong> (or Start-Agent.bat). It runs quietly in the background.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-card/60 border border-border space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                    3
                  </div>
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span>Automatic Connection</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  This dashboard will automatically detect your PC's hardware and installed local models within seconds.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Linux / macOS Coming Soon State (Requirement 9: Honest UX, no fake download buttons) */
          <div className="p-5 rounded-xl bg-card border border-border text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground">
              <Laptop className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                <span>
                  {selectedOS === 'linux' ? 'Linux' : 'macOS'} Standalone Agent
                </span>
                <Badge variant="outline" className="text-[10px] font-mono uppercase text-muted-foreground">
                  Coming Soon
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {selectedOS === 'linux'
                  ? 'Native .deb and .tar.gz standalone packages for Ubuntu, Debian, Fedora, and Arch are currently in preparation.'
                  : 'Native macOS universal (.dmg / .pkg) standalone packages for Apple Silicon (M1/M2/M3/M4) and Intel are in preparation.'}
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground bg-muted/40 p-3 rounded-lg max-w-lg mx-auto">
              If you are accessing this application from a Windows PC, switch to the <strong>Windows</strong> tab above to download the ready-to-run package.
            </div>
          </div>
        )}

        {/* Collapsible Advanced Settings for custom port/host */}
        <div className="border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Advanced Connection Settings</span>
            {showAdvanced ? (
              <ChevronUp className="w-3 h-3 ml-0.5" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-0.5" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-2.5 p-3 rounded-lg bg-card/60 border border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                Agent URL:
              </span>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  setLocalAgentUrl(e.target.value);
                }}
                placeholder="http://127.0.0.1:8008"
                className="flex-1 h-8 px-2.5 rounded bg-background border border-input text-[11px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button
                size="sm"
                onClick={handleManualConnect}
                disabled={isChecking}
                className="h-8 gap-1.5 text-xs shrink-0"
              >
                <RefreshCw className={isChecking ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />
                {isChecking ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
