import React, { useState } from 'react';
import {
  Laptop,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AgentDownloadCard } from '@/components/agent/AgentDownloadCard';

export function LocalAgentBanner() {
  const { localAgent, checkLocalAgent } = useEngine();
  const { showSuccess, showError, showInfo } = useToast();

  const [isChecking, setIsChecking] = useState(false);

  // If already running directly from local backend with hardware detected, no banner needed unless disconnected
  if (localAgent.status === 'connected' && !localAgent.data?.quick_spec) {
    return null;
  }

  const handleSync = async () => {
    setIsChecking(true);
    showInfo(`Checking local agent connection...`);
    try {
      const ok = await checkLocalAgent(localAgent.url || 'http://127.0.0.1:8008');
      if (ok) {
        showSuccess('Successfully connected to local PC agent!');
      } else {
        showError('Local agent not found on 127.0.0.1:8008. Make sure LMLHE-Agent.exe is running.');
      }
    } catch (err: any) {
      showError(err.message || 'Connection attempt failed');
    } finally {
      setIsChecking(false);
    }
  };

  if (localAgent.status === 'connected') {
    const spec = localAgent.data?.quick_spec;
    const runtimes = localAgent.data?.runtimes_summary;
    const isOllamaRunning = Boolean(runtimes?.ollama_detected);

    return (
      <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <div>
            <div className="font-semibold text-foreground flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5">
                <Laptop className="w-4 h-4 text-emerald-400" />
                Connected to Local PC: {localAgent.data?.machine?.hostname || 'Physical Workstation'}
              </span>
              <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-500/30">
                PORT {localAgent.data?.port || 8008}
              </Badge>
              {isOllamaRunning ? (
                <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-cyan-500/10 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Ollama Daemon (127.0.0.1:11434)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                  Ollama (Offline)
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground block mt-0.5">
              {spec ? `${spec.cpu} • ${spec.ram_total_gb.toFixed(1)} GB RAM • ${spec.gpu}` : 'Hardware & models active'} ({localAgent.url || 'http://127.0.0.1:8008'})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="font-mono text-[10px]">
            LOCAL AGENT v{localAgent.data?.version || '2.0'}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSync}
            disabled={isChecking}
            className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={isChecking ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />
            Sync
          </Button>
        </div>
      </div>
    );
  }

  return <AgentDownloadCard />;
}
