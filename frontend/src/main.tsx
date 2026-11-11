import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { createQueryClient } from './lib/query/query-client.ts';
import { AppRoutes } from './routes/AppRoutes.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing from index.html');

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  </StrictMode>,
);
