import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { removeStored } from './lib/storage';
import '@fontsource-variable/oxanium';
import './styles/globals.css';

// Earlier builds kept an admin key in this browser. Nothing reads it now: drop it.
removeStored('archangel.adminSecret');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    // A change is sent when it is made, or fails there and then. Left to the
    // default, one made offline waits unseen and sends itself on reconnect.
    mutations: { networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
