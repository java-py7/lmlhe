import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from './utils';

export type ToastType = 'success' | 'danger' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 3500) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const showSuccess = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const showError = useCallback((msg: string) => toast(msg, 'danger'), [toast]);
  const showInfo = useCallback((msg: string) => toast(msg, 'info'), [toast]);
  const showWarning = useCallback((msg: string) => toast(msg, 'warning'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, showSuccess, showError, showInfo, showWarning }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
        {toasts.map((t) => {
          let icon = <Info className="w-4 h-4 text-blue-500 shrink-0" />;
          let borderClass = 'border-blue-500/20 bg-blue-500/5 text-blue-300 dark:text-blue-200';
          let badgeText = 'INFO';
          let badgeBg = 'bg-blue-500/20 text-blue-400';

          if (t.type === 'success') {
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
            borderClass = 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300 dark:text-emerald-200';
            badgeText = 'SUCCESS';
            badgeBg = 'bg-emerald-500/20 text-emerald-400';
          } else if (t.type === 'danger') {
            icon = <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
            borderClass = 'border-rose-500/20 bg-rose-500/5 text-rose-300 dark:text-rose-200';
            badgeText = 'ERROR';
            badgeBg = 'bg-rose-500/20 text-rose-400';
          } else if (t.type === 'warning') {
            icon = <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
            borderClass = 'border-amber-500/20 bg-amber-500/5 text-amber-300 dark:text-amber-200';
            badgeText = 'WARNING';
            badgeBg = 'bg-amber-500/20 text-amber-400';
          }

          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border backdrop-blur-md shadow-lg transition-all animate-in slide-in-from-bottom-2 duration-200 bg-card/95 text-card-foreground',
                borderClass
              )}
            >
              <div className="pt-0.5">{icon}</div>
              <div className="flex-1 text-sm font-medium leading-relaxed break-words">
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 uppercase', badgeBg)}>
                  {badgeText}
                </span>
                {t.message}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
