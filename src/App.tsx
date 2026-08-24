import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';

const BondsPage = lazy(() => import('./pages/BondsPage'));
const OptionsPage = lazy(() => import('./pages/OptionsPage'));
const FxPage = lazy(() => import('./pages/FxPage'));

function PageFallback() {
  return <div className="py-24 text-center text-sm text-ink-400">Loading…</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route
            path="bonds"
            element={
              <Suspense fallback={<PageFallback />}>
                <BondsPage />
              </Suspense>
            }
          />
          <Route
            path="options"
            element={
              <Suspense fallback={<PageFallback />}>
                <OptionsPage />
              </Suspense>
            }
          />
          <Route
            path="fx"
            element={
              <Suspense fallback={<PageFallback />}>
                <FxPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
