import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { fetchStats } from './api/client';
import type { AggregateStats } from './api/types';

function Root() {
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(setError);
  }, []);

  if (error) return <div>Failed to load stats: {error.message}</div>;
  if (!stats) return <div>Loading…</div>;
  return <App stats={stats} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
