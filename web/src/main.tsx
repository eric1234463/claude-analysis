import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle } from 'lucide-react';
import './index.css';
import { App } from './App';
import { fetchStats } from './api/client';
import type { AggregateStats } from './api/types';
import { Skeleton } from '@/components/ui/skeleton';

function LoadingDashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading usage statistics
      </span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function Root() {
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(setError);
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Failed to load stats</p>
            <p className="mt-1 text-muted-foreground">{error.message}</p>
            <p className="mt-2 text-muted-foreground">
              Check that the API server is running, then reload this page.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (!stats) return <LoadingDashboard />;
  return <App stats={stats} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
