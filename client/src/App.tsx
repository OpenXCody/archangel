import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import MapView from './pages/MapView';
import Tree from './pages/Tree';
import Explore from './pages/Explore';
import Import from './pages/Import';
import BulkImport from './pages/BulkImport';
import EntityDetail from './pages/EntityDetail';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
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
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
