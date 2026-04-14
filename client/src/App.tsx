import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import MapView from './pages/MapView';
import Tree from './pages/Tree';
import Explore from './pages/Explore';
import Import from './pages/Import';
import BulkImport from './pages/BulkImport';
import EntityDetail from './pages/EntityDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route element={<Layout />}>
          <Route path="/map" element={<MapView />} />
          <Route path="/tree" element={<Tree />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/import" element={<Import />} />
          <Route path="/import/bulk" element={<BulkImport />} />
          <Route path="/entities/:type/:id" element={<EntityDetail />} />
          <Route path="/companies/:id" element={<EntityDetail />} />
          <Route path="/factories/:id" element={<EntityDetail />} />
          <Route path="/occupations/:id" element={<EntityDetail />} />
          <Route path="/skills/:id" element={<EntityDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
