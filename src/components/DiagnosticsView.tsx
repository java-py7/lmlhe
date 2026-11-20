import { AlertTriangle, CheckCircle2, Download, RefreshCw, XCircle } from 'lucide-react';
import type { DiagnosticReport, RuntimeSession } from '../../shared/types.ts';

interface DiagnosticsViewProps {
  report: DiagnosticReport | null;
  session: RuntimeSession;
  isRunning: boolean;
  onRunDiagnostics: () => void;
}

export function DiagnosticsView({
  report,
  session,
  isRunning,
  onRunDiagnostics,
}: DiagnosticsViewProps) {
  const handleExportJson = () => {
    if (!report) return;
    const bundle = {
      report,
      activeSession: {
        status: session.status,
        endpointUrl: session.endpointUrl,
        executionMode: session.executionMode,
        logs: session.logs,
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localscale-diagnostics-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const passCount = report?.checks.filter((c) => c.status === 'pass').length ?? 0;
  const warnCount = report?.checks.filter((c) => c.status === 'warn').length ?? 0;
  const failCount = report?.checks.filter((c) => c.status === 'fail').length ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Local Hardware &amp; Runtime Diagnostics
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Automated pre-flight verification auditing local computer hardware probing, VRAM/Unified Memory fit, KV-cache limits, disk capacity, and thermal envelope.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Report JSON</span>
          </button>
          <button
            type="button"
            onClick={onRunDiagnostics}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-500 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-sky-400 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRunning ? 'Running Diagnostics…' : 'Run Diagnostics Suite'}</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      {report && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Hardware Profile Audited ·{' '}
              <span className="font-mono tabular-nums">
                {new Date(report.generatedAt).toLocaleString()}
              </span>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {report.hardwareSummary}
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono tabular-nums shrink-0">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {passCount} Passed
            </span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              {warnCount} Warnings
            </span>
            <span className="text-red-700 dark:text-red-400 font-semibold">
              {failCount} Failed
            </span>
          </div>
        </div>
      )}

      {/* Diagnostics Checklist Table */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-3">Category &amp; Check</th>
                <th className="py-2.5 px-3">Measured Value</th>
                <th className="py-2.5 px-3">Target Threshold</th>
                <th className="py-2.5 px-4">Findings &amp; Remediation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {(report?.checks ?? []).map((check) => (
                <tr key={check.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {check.status === 'pass' ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Pass</span>
                      </span>
                    ) : check.status === 'warn' ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Warning</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Fail</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{check.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{check.category}</div>
                  </td>
                  <td className="py-3.5 px-3 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {check.measuredValue}
                  </td>
                  <td className="py-3.5 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {check.threshold}
                  </td>
                  <td className="py-3.5 px-4 max-w-md space-y-1">
                    <div className="text-slate-700 dark:text-slate-300 leading-relaxed">{check.detail}</div>
                    {check.remediation && (
                      <div className="text-[11px] text-blue-700 dark:text-sky-400">
                        Recommended action: {check.remediation}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!report && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                    Running initial local hardware diagnostics…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diagnostic Event Log */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Session &amp; HAL Event Log
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {session.logs.length} entries
          </span>
        </div>
        <div className="bg-slate-950 text-slate-200 rounded-md p-3.5 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1.5">
          {session.logs.length === 0 ? (
            <div className="text-slate-500">No runtime session logs recorded yet.</div>
          ) : (
            session.logs.map((entry, idx) => (
              <div key={`${entry.ts}-${idx}`} className="flex gap-2.5 leading-relaxed">
                <span className="text-slate-500 shrink-0 tabular-nums">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <span
                  className={
                    entry.level === 'error'
                      ? 'text-red-400'
                      : entry.level === 'warn'
                        ? 'text-amber-400'
                        : 'text-slate-200'
                  }
                >
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
