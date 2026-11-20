import React, { useState } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Cpu,
  Layers,
  MessageSquare,
  Activity,
  BarChart3,
  ShieldAlert,
  Settings,
  Package,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Menu,
  Laptop,
  AlertCircle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useEngine } from '@/lib/context';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'AI Model Advisor', path: '/advisor', icon: Sparkles },
  { name: 'Hardware & Engine', path: '/hardware', icon: Cpu },
  { name: 'Runtimes & Models', path: '/runtimes', icon: Layers },
  { name: 'Inference Studio', path: '/inference', icon: MessageSquare },
  { name: 'Live Monitor', path: '/monitor', icon: Activity },
  { name: 'Benchmark Matrix', path: '/benchmarks', icon: BarChart3 },
  { name: 'Diagnostics', path: '/diagnostics', icon: ShieldAlert },
  { name: 'Project 3 API & Config', path: '/api-config', icon: Settings },
  { name: 'Deployment & Packaging', path: '/deployment', icon: Package },
];

export function AppLayout({ children }: { children?: React.ReactNode } = {}) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const {
    activeRuntime,
    activeModel,
    runtimes,
    hardware,
    metrics,
    isHosted,
    isOriginLocal,
    clientHardware,
    clientRuntimes,
    refreshClientDetection,
    isDetecting,
  } = useEngine();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Runtime readiness determination
  const isOllama = activeRuntime === 'ollama';
  const isLlamaRunning = Boolean(runtimes?.llama_cpp?.status?.running || runtimes?.adapters?.['llama.cpp server']?.available);
  const isOllamaOnline = Boolean(clientRuntimes?.ollama?.detected || runtimes?.ollama?.detected);
  const isRuntimeOnline = isOllama ? isOllamaOnline : isLlamaRunning;

  // CPU / RAM quick stats
  const cpuPercent = metrics?.cpu?.utilization_percent ?? hardware?.cpu?.utilization_percent ?? null;
  const ramPercent = metrics?.ram?.utilization_percent ?? hardware?.ram?.utilization_percent ?? null;

  const currentNav = navItems.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-card/60 backdrop-blur-md transition-all duration-300 select-none z-30',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-border">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-xs tracking-tight text-foreground truncate">
                  LM-LH ENGINE
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  Local AI Acceleration
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group relative',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon className={cn('w-4 h-4 shrink-0 transition-transform group-hover:scale-110', isActive && 'text-primary-foreground')} />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-border flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2 overflow-hidden text-[11px] text-muted-foreground">
              <Laptop className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                {clientHardware?.platform?.os || hardware?.os?.system || 'Local Workstation'}
              </span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mx-auto"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left">
        <div className="flex flex-col h-full bg-card text-foreground">
          <div className="flex items-center justify-between h-14 px-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-sm tracking-tight">LM-LH ENGINE</span>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-border bg-card/40 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm truncate">{currentNav?.name || 'Dashboard'}</span>
              <span className="hidden sm:inline text-xs text-muted-foreground">·</span>
              <span className="hidden sm:inline text-xs text-muted-foreground truncate">
                Light-Hardware Intelligence
              </span>
            </div>
          </div>

          {/* Quick Metrics & Runtime Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick CPU Utilization */}
            {cpuPercent !== null && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border text-xs">
                <span className="text-muted-foreground">CPU:</span>
                <span className="font-mono font-medium">{Math.round(cpuPercent)}%</span>
              </div>
            )}

            {/* Quick RAM Utilization */}
            {ramPercent !== null && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border text-xs">
                <span className="text-muted-foreground">RAM:</span>
                <span className="font-mono font-medium">{Math.round(ramPercent)}%</span>
              </div>
            )}

            {/* Selected Active Model Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border text-xs max-w-[200px]">
              <span className="text-[11px] text-muted-foreground">Model:</span>
              <span className="font-medium text-foreground truncate" title={activeModel?.name || 'None Selected'}>
                {activeModel?.name || 'None'}
              </span>
            </div>

            {/* Direct Local Ollama Detection Pill */}
            {clientRuntimes?.ollama?.detected ? (
              <button
                type="button"
                onClick={() => refreshClientDetection()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                title={`Local Ollama Active at localhost:11434 (${clientRuntimes.ollama.models.length} models). Click to re-scan.`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="font-mono text-[11px] font-medium hidden sm:inline">
                  Ollama :11434
                </span>
                <Badge variant="success" className="text-[9px] px-1 py-0 h-3.5">
                  {clientRuntimes.ollama.models.length}M
                </Badge>
              </button>
            ) : isDetecting ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Detecting Runtimes...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => refreshClientDetection()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                title="Direct local Ollama probe. Click to check localhost:11434."
              >
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                <span className="font-mono text-[11px] hidden sm:inline">Ollama</span>
                <span className="text-[10px] text-muted-foreground">Scan</span>
              </button>
            )}

            {/* Runtime Status Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border text-xs">
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  isRuntimeOnline
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                )}
              />
              <span className="font-mono text-[11px] font-medium text-foreground capitalize">
                {activeRuntime}
              </span>
            </div>

            {/* Detection Mode Badge */}
            <Badge
              variant="outline"
              className="hidden xl:inline-flex text-[10px] uppercase font-bold"
            >
              {isOriginLocal ? 'LOCAL ENGINE' : 'DIRECT DETECTION'}
            </Badge>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
            </button>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background/50 space-y-5">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
