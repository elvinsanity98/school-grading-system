import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ToastProvider } from './components/ui';
import './index.css';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { isNative } from './lib/platform';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // one quiet retry for flaky school Wi-Fi, none for real answers like 403 or 404
      retry: (count, err) => (err instanceof ApiError && err.status !== 0 ? false : count < 1),
    },
  },
});

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5">
        <h1 className="text-xl font-semibold">Something broke on this screen</h1>
        <p className="text-sm text-muted">{this.state.error.message}</p>
        <button className="h-10 rounded-lg bg-brand px-4 font-medium text-on-brand" onClick={() => window.location.assign('/')}>
          Back to start
        </button>
      </div>
    );
  }
}

// The installed web app updates itself; the Android app updates through new builds instead.
if (!isNative()) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </Boundary>
  </StrictMode>,
);
