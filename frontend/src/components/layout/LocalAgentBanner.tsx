import React, { useState } from 'react';
import {
  Laptop,
  AlertCircle,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LocalAgentBanner() {
  const { localAgent, checkLocalAgent, setLocalAgentUrl } = useEngine();
  const { showSuccess, showError, showInfo } = useToast();

  const [inputUrl, setInputUrl] = useState(localAgent.url || 'http://127.0.0.1:8008');
  const [isChecking, setIsChecking] = useState(false);

  // If already running directly from local backend with hardware detected, no banner needed unless disconnected
  if (localAgent.status === 'connected' && !localAgent.data?.quick_spec) {
    return null;
  }

  const handleConnect = async () => {
    setIsChecking(true);
    showInfo(`Probing local agent at ${inputUrl}...`);
    try {
      const ok = await checkLocalAgent(inputUrl.trim());
      if (ok) {
        showSuccess('Successfully connected to local PC agent!');
      } else {
        showError('Local agent not found on 127.0.0.1. Please start start_local_agent.bat first.');
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
            onClick={handleConnect}
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

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4 space-y-3.5 text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                Local PC Agent Offline
                <Badge variant="outline" className="text-[10px] uppercase font-mono text-amber-400 border-amber-400/40">
                  OFFLINE
                </Badge>
              </div>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Connect the local agent to inspect your computer's physical hardware, discover installed Ollama models, and execute inference.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Launch Guidance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-card/60 border border-border space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              1. Start Local Agent on Your PC
            </span>
            <div className="font-mono text-[11px] p-2 rounded bg-slate-950 text-slate-200 overflow-x-auto select-all">
              start_local_agent.bat
            </div>
            <p className="text-[10px] text-muted-foreground">
              Or run <code className="text-foreground">python local_agent.py</code> in your project directory.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-card/60 border border-border space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              2. Connect to Local PC Agent
            </span>
            <div className="flex gap-2">
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
                onClick={handleConnect}
                disabled={isChecking}
                className="h-8 gap-1.5 text-xs shrink-0"
              >
                <RefreshCw className={isChecking ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
                {isChecking ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Probes port 8008 or 8000 on your loopback network.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
