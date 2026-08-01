import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import fixture from './api/__fixtures__/aggregate-stats.json';
import type { AggregateStats } from './api/types';

const stats = fixture as AggregateStats;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App stats={stats} />
  </StrictMode>,
);
