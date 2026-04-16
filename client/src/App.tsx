import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load pages for code splitting
const MapView = lazy(() => import('./pages/MapView'));
const Tree = lazy(() => import('./pages/Tree'));
const Explore = lazy(() => import('./pages/Explore'));
const Import = lazy(() => import('./pages/Import'));
const BulkImport = lazy(() => import('./pages/BulkImport'));
const EntityDetail = lazy(() => import('./pages/EntityDetail'));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route element={<Layout />}>
              <Route path="/map" element={<ErrorBoundary><MapView /></ErrorBoundary>} />
              <Route path="/tree" element={<ErrorBoundary><Tree /></ErrorBoundary>} />
              <Route path="/explore" element={<ErrorBoundary><Explore /></ErrorBoundary>} />
              <Route path="/import" element={<ErrorBoundary><Import /></ErrorBoundary>} />
              <Route path="/import/bulk" element={<ErrorBoundary><BulkImport /></ErrorBoundary>} />
              <Route path="/entities/:type/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/companies/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/factories/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/occupations/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/skills/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/refs/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/schools/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
              <Route path="/programs/:id" element={<ErrorBoundary><EntityDetail /></ErrorBoundary>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
