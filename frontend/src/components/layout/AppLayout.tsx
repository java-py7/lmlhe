import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  Menu,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Server,
  Laptop,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useEngine } from '@/lib/context';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { LocalAgentBanner } from '@/components/layout/LocalAgentBanner';
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
    localAgent,
    checkLocalAgent,
  } = useEngine();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Runtime health state
  const isOllama = activeRuntime === 'ollama';
  const isRuntimeOnline = isOllama
    ? Boolean(runtimes?.ollama?.detected)
    : Boolean(runtimes?.llama_cpp?.status?.healthy);

  const currentNav = navItems.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-card/60 backdrop-blur-md transition-all duration-300 relative z-30 select-none',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Brand header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 text-primary font-bold text-xs shadow-sm">
                LM
              </div>
              <div className="flex flex-col truncate">
                <span className="font-semibold text-xs tracking-tight truncate">Large-Model-Light-HW</span>
                <span className="text-[10px] text-muted-foreground font-mono truncate">Engine Runtime v2.0</span>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto text-primary font-bold text-xs">
              LM
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  isCollapsed && 'justify-center px-0'
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
                {localAgent.status === 'connected'
                  ? localAgent.data?.machine?.hostname || 'Local Workstation'
                  : 'Local PC'}
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
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 text-primary font-bold text-xs">
            LM
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs tracking-tight">Large-Model-Light-HW</span>
            <span className="text-[10px] text-muted-foreground font-mono">Engine Runtime v2.0</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-border bg-card/40 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-foreground tracking-tight">
                {currentNav?.name || 'Dashboard'}
              </h1>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                Project 2 • Local AI Inference & Hardware Intelligence
              </span>
            </div>
          </div>

          {/* Right navbar elements */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick telemetry */}
            {metrics && (
              <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-muted/50 border border-border text-[11px] font-mono">
                <span>CPU: <strong className="text-blue-400">{Math.round(metrics.cpu?.utilization_percent || 0)}%</strong></span>
                <span className="text-border">|</span>
                <span>RAM: <strong className="text-indigo-400">{Math.round(metrics.ram?.utilization_percent || 0)}%</strong></span>
              </div>
            )}

            {/* Active Model Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border text-xs max-w-[180px] truncate">
              <span className="text-[11px] text-muted-foreground">Model:</span>
              <span className="font-medium text-foreground truncate" title={activeModel?.name || 'None Selected'}>
                {activeModel?.name || 'None'}
              </span>
            </div>

            {/* Local Agent Status Pill */}
            {localAgent.status === 'connected' ? (
              <button
                type="button"
                onClick={() => checkLocalAgent()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                title={`Local PC Agent Connected at ${localAgent.url}. Click to sync.`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="font-mono text-[11px] font-medium hidden sm:inline">
                  {localAgent.data?.machine?.hostname || 'Local PC'}
                </span>
                <Badge variant="success" className="text-[9px] px-1 py-0 h-3.5">
                  PC ON
                </Badge>
              </button>
            ) : localAgent.status === 'checking' ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Probing Local PC...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => checkLocalAgent()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 hover:bg-rose-500/20 transition-colors"
                title="Local PC Agent Offline. Click to probe localhost:8008 or localhost:8000."
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="font-mono text-[11px] hidden sm:inline">Local PC Agent</span>
                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">
                  OFFLINE
                </Badge>
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

            {/* Workstation Badge */}
            <Badge
              variant="outline"
              className="hidden xl:inline-flex text-[10px] uppercase font-bold"
            >
              {localAgent.status === 'connected' ? 'LOCAL WORKSTATION' : 'LOCAL ENGINE'}
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
          <LocalAgentBanner />
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
