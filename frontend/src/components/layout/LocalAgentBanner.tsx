import React, { useState } from 'react';
import {
  Laptop,
  RefreshCw,
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
        showError('Local agent not found on 127.0.0.1. Launch LMLHE-Agent.exe on your computer.');
      }
    } catch (err: any) {
      showError(err.message || 'Connection attempt failed');
    } finally {
      setIsChecking(false);
    }
  };

  if (localAgent.status === 'connected') {
    const spec = localAgent.data?.quick_spec;
    return (
      <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <div>
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Laptop className="w-4 h-4 text-emerald-400" />
              Connected to Local PC: {localAgent.data?.machine?.hostname || 'Physical Workstation'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {spec ? `${spec.cpu} • ${spec.ram_total_gb.toFixed(1)} GB RAM • ${spec.gpu}` : 'Hardware & models active'} ({localAgent.url})
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
