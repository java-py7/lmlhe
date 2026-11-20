import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/lib/toast';
import { EngineProvider } from '@/lib/context';
import { AppLayout } from '@/components/layout/AppLayout';

import { DashboardPage } from '@/pages/DashboardPage';
import { AdvisorPage } from '@/pages/AdvisorPage';
import { HardwarePage } from '@/pages/HardwarePage';
import { RuntimesPage } from '@/pages/RuntimesPage';
import { InferencePage } from '@/pages/InferencePage';
import { MonitorPage } from '@/pages/MonitorPage';

export function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <ToastProvider>
        <EngineProvider>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/advisor" element={<AdvisorPage />} />
                <Route path="/hardware" element={<HardwarePage />} />
                <Route path="/runtimes" element={<RuntimesPage />} />
                <Route path="/inference" element={<InferencePage />} />
                <Route path="/monitor" element={<MonitorPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </EngineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
