import React, { useState } from 'react';
import {
  Laptop,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Terminal,
  ExternalLink,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LocalAgentBanner() {
  const { isHosted, localAgent, checkLocalAgent, setLocalAgentUrl, serverDeployment, serverHardware } = useEngine();
  const { showSuccess, showError, showInfo } = useToast();

  const [inputUrl, setInputUrl] = useState(localAgent.url || 'http://127.0.0.1:8008');
  const [isChecking, setIsChecking] = useState(false);
  const [showServerDetails, setShowServerDetails] = useState(false);

  // Only show this banner when the frontend is running in hosted cloud mode (e.g. Render)
  if (!isHosted) {
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
        showError('Local agent not found on 127.0.0.1. Please start local_agent.py first.');
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
              {spec ? `${spec.cpu} • ${spec.ram_total_gb.toFixed(1)} GB RAM • ${spec.gpu}` : 'Bridging hardware & models'} ({localAgent.url})
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
                Local Hardware Agent Not Connected
                <Badge variant="outline" className="text-[10px] uppercase font-mono text-amber-400 border-amber-400/40">
                  Cloud Hosted (Render)
                </Badge>
              </div>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                The web dashboard is running on Render Cloud. To display your actual PC's hardware (Intel i5-4570, 16 GB RAM, NVIDIA GT 730) and discover local Ollama models, run the local agent.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Launch Guidance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-card/60 border border-border space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              1. Start Local Agent on Your Computer
            </span>
            <div className="font-mono text-[11px] p-2 rounded bg-slate-950 text-slate-200 overflow-x-auto select-all">
              start_local_agent.bat
            </div>
            <p className="text-[10px] text-muted-foreground">
              Or run <code className="text-foreground">python local_agent.py</code> in a terminal.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-card/60 border border-border space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              2. Bridge to Hosted Dashboard
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

        {/* Collapsible Hosted Server Specs (segregated) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowServerDetails(!showServerDetails)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition-colors"
          >
            <Cloud className="w-3.5 h-3.5 text-purple-400" />
            {showServerDetails ? 'Hide' : 'View'} Hosted Server Telemetry (Render Container Specs)
            {showServerDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showServerDetails && (
            <div className="mt-2.5 p-3 rounded-lg bg-muted/40 border border-border space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-1.5">
                <span className="font-semibold text-foreground">Render Cloud Backend Instance</span>
                <Badge variant="purple" className="text-[10px]">
                  CLOUD CONTAINER ONLY
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Notice: These values belong to the remote Render Linux container hosting this web application, not your local workstation.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Server CPU</span>
                  <span className="text-foreground">{serverHardware?.cpu?.name || 'AMD EPYC Container'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Server RAM</span>
                  <span className="text-foreground">{serverHardware?.ram?.total_gb ? `${serverHardware.ram.total_gb.toFixed(1)} GB` : '31.0 GB'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Server GPU</span>
                  <span className="text-foreground">None (Headless Cloud)</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Host OS</span>
                  <span className="text-foreground">{serverHardware?.os?.system || 'Linux'} Container</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
