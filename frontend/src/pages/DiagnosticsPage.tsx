import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Terminal,
  Copy,
  Check,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { DiagnosticsSuite } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export function DiagnosticsPage() {
  const { showSuccess, showError, showInfo } = useToast();

  const [diagnostics, setDiagnostics] = useState<DiagnosticsSuite | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);

  // Log viewer
  const [logSource, setLogSource] = useState<'app' | 'llama'>('app');
  const [logLines, setLogLines] = useState(100);
  const [logText, setLogText] = useState('Loading logs...');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copied, setCopied] = useState(false);

  const runDiagnostics = async () => {
    setIsRunningDiag(true);
    showInfo('Executing system diagnostics suite...');
    try {
      const data = await api.getDiagnostics();
      setDiagnostics(data);
      showSuccess('Diagnostic checks completed');
    } catch (err: any) {
      showError(err.message || 'Diagnostics failed');
    } finally {
      setIsRunningDiag(false);
    }
  };

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await api.getLogs(logSource, logLines);
      setLogText(data.logs || 'No log output recorded yet.');
    } catch (err: any) {
      setLogText(`Failed to retrieve logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [logSource, logLines]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logText);
    setCopied(true);
    showSuccess('Logs copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const overall = diagnostics?.overall_status || 'healthy';

  return (
    <div className="space-y-6">
      {/* Diagnostics Suite Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                System Health & Subsystem Diagnostics
              </CardTitle>
              <CardDescription>
                Automated validation of CPU instruction sets, memory headroom, subprocesses and permissions
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={overall === 'healthy' ? 'success' : overall === 'warning' ? 'warning' : 'destructive'}
                className="text-[10px] uppercase font-mono px-3 py-1"
              >
                {overall === 'healthy' ? 'ALL CHECKS PASSED' : overall === 'warning' ? 'WARNINGS DETECTED' : 'DEGRADED'}
              </Badge>
              <Button
                size="sm"
                onClick={runDiagnostics}
                disabled={isRunningDiag}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isRunningDiag && 'animate-spin')} />
                Run Diagnostics
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {(diagnostics?.checks || []).map((check) => {
              const isPassed = check.status === 'passed';
              const isWarning = check.status === 'warning';

              return (
                <div
                  key={check.id}
                  className={cn(
                    'p-3.5 rounded-lg border text-xs space-y-1.5 transition-colors',
                    isPassed
                      ? 'border-border bg-card'
                      : isWarning
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-rose-500/30 bg-rose-500/5'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-2">
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      {check.name}
                    </span>
                    <Badge
                      variant={isPassed ? 'success' : isWarning ? 'warning' : 'destructive'}
                      className="text-[9px] uppercase font-mono"
                    >
                      {check.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground pl-6 text-[11px] leading-relaxed">{check.message}</p>
                  {check.remediation && (
                    <div className="pl-6 pt-1 text-[11px] text-amber-400/90 font-medium">
                      Advice: {check.remediation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Log Viewer Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                Live Subprocess & Application Logs
              </CardTitle>
              <CardDescription>Tail output from engine server and background execution processes</CardDescription>
            </div>

            <div className="flex items-center gap-2.5">
              <Select
                value={logSource}
                onChange={(e) => setLogSource(e.target.value as any)}
                className="h-8 text-xs w-44"
              >
                <option value="app">Application (main.log)</option>
                <option value="llama">llama.cpp server.log</option>
              </Select>

              <Select
                value={String(logLines)}
                onChange={(e) => setLogLines(parseInt(e.target.value, 10))}
                className="h-8 text-xs w-28"
              >
                <option value="50">50 lines</option>
                <option value="100">100 lines</option>
                <option value="200">200 lines</option>
              </Select>

              <Button
                size="sm"
                variant="outline"
                onClick={fetchLogs}
                disabled={isLoadingLogs}
                className="h-8 px-2.5"
                title="Refresh log output"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isLoadingLogs && 'animate-spin')} />
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLogs}
                className="h-8 px-2.5 gap-1 text-xs"
                title="Copy all logs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="relative rounded-lg border border-border bg-black/90 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-[480px] leading-relaxed select-text">
            <pre className="whitespace-pre-wrap break-all">{logText}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
