import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './components/layout/Layout';
import ErrorBoundary, { PageBoundary } from './components/ErrorBoundary';
import AdminKeyGate from './components/import/AdminKeyGate';

// Lazy load pages for code splitting
const MapView = lazy(() => import('./pages/MapView'));
const Explore = lazy(() => import('./pages/Explore'));
const Import = lazy(() => import('./pages/Import'));
const BulkImport = lazy(() => import('./pages/BulkImport'));
const EntityDetail = lazy(() => import('./pages/EntityDetail'));
const SignIn = lazy(() => import('./pages/SignIn'));
const Me = lazy(() => import('./pages/Me'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const Employer = lazy(() => import('./pages/Employer'));
const Admin = lazy(() => import('./pages/Admin'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 text-info animate-spin" />
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
              <Route path="/map" element={<PageBoundary><MapView /></PageBoundary>} />
              {/* The Tree page is gone; old links land on the map. */}
              <Route path="/tree" element={<Navigate to="/map" replace />} />
              <Route path="/explore" element={<PageBoundary><Explore /></PageBoundary>} />
              <Route path="/import" element={<PageBoundary><AdminKeyGate><Import /></AdminKeyGate></PageBoundary>} />
              <Route path="/import/bulk" element={<PageBoundary><AdminKeyGate><BulkImport /></AdminKeyGate></PageBoundary>} />
              <Route path="/entities/:type/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/companies/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/factories/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/occupations/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/skills/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/refs/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/schools/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/programs/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/sign-in" element={<PageBoundary><SignIn /></PageBoundary>} />
              <Route path="/me" element={<PageBoundary><Me /></PageBoundary>} />
              <Route path="/jobs" element={<PageBoundary><Jobs /></PageBoundary>} />
              <Route path="/jobs/:id" element={<PageBoundary><JobDetail /></PageBoundary>} />
              <Route path="/employer" element={<PageBoundary><Employer /></PageBoundary>} />
              <Route path="/admin" element={<PageBoundary><Admin /></PageBoundary>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
