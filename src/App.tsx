import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';

const HomePage = lazy(() => import('./pages/HomePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const InstitutionPage = lazy(() => import('./pages/InstitutionPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const MarketMapPage = lazy(() => import('./pages/MarketMapPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const QAPage = lazy(() => import('./pages/QAPage'));
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'));
const FailuresPage = lazy(() => import('./pages/FailuresPage'));
const EntitiesPage = lazy(() => import('./pages/EntitiesPage'));
const EntityPage = lazy(() => import('./pages/EntityPage'));
const BrimPage = lazy(() => import('./pages/BrimPage'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/institution/:certNumber" element={<InstitutionPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/market" element={<MarketMapPage />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/qa" element={<QAPage />} />
                <Route path="/sources" element={<DataSourcesPage />} />
                <Route path="/entities" element={<EntitiesPage />} />
                <Route path="/entities/:entityId" element={<EntityPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/screen" element={<ScreenerPage />} />
                <Route path="/failures" element={<FailuresPage />} />
                <Route path="/brim" element={<BrimPage />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
