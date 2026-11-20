import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { ValidationStatus } from '../../shared/types.ts';

interface ValidationLabelProps {
  status: ValidationStatus;
  compact?: boolean;
}

export function ValidationLabel({ status, compact = false }: ValidationLabelProps) {
  if (status === 'team-validated') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{compact ? 'Team Validated' : 'Team Validated'}</span>
      </span>
    );
  }
  if (status === 'experimental') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{compact ? 'Experimental' : 'Experimentally Possible'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap shrink-0">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? 'Exceeds Hardware' : 'Exceeds Local Hardware'}</span>
    </span>
  );
}
