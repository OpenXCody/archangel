import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './components/layout/Layout';
import ErrorBoundary, { PageBoundary } from './components/ErrorBoundary';

// Lazy load pages for code splitting
const MapView = lazy(() => import('./pages/MapView'));
const Explore = lazy(() => import('./pages/Explore'));
const EntityDetail = lazy(() => import('./pages/EntityDetail'));
const SignIn = lazy(() => import('./pages/SignIn'));
const Me = lazy(() => import('./pages/Me'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const Industry = lazy(() => import('./pages/Industry'));
const Employer = lazy(() => import('./pages/Employer'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 text-fg-muted animate-spin" />
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
              {/* The import pages are gone; records are added from Admin Tools. */}
              <Route path="/import/*" element={<Navigate to="/admin?tab=data" replace />} />
              <Route path="/companies/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/factories/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/occupations/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              <Route path="/skills/:id" element={<PageBoundary><EntityDetail /></PageBoundary>} />
              {/* The industries are a tab of Explore, at their own address. */}
              <Route path="/industries" element={<PageBoundary><Explore /></PageBoundary>} />
              <Route path="/industries/:slug" element={<PageBoundary><Industry /></PageBoundary>} />
              <Route path="/sign-in" element={<PageBoundary><SignIn /></PageBoundary>} />
              <Route path="/me" element={<PageBoundary><Me /></PageBoundary>} />
              <Route path="/jobs" element={<PageBoundary><Jobs /></PageBoundary>} />
              <Route path="/jobs/:id" element={<PageBoundary><JobDetail /></PageBoundary>} />
              <Route path="/employer" element={<PageBoundary><Employer /></PageBoundary>} />
              <Route path="/settings" element={<PageBoundary><Settings /></PageBoundary>} />
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
