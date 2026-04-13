import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { CommandBarProvider } from './components/command-bar/CommandBarProvider';
import { CommandBar } from './components/command-bar/CommandBar';

const HomePage = lazy(() => import('./pages/HomePage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
// InstitutionPage kept for reference — route now uses InstitutionStoryPage
// const InstitutionPage = lazy(() => import('./pages/InstitutionPage'));
const InstitutionStoryPage = lazy(() => import('./pages/InstitutionStoryPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const QAPage = lazy(() => import('./pages/QAPage'));
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const FailuresPage = lazy(() => import('./pages/FailuresPage'));
const EntitiesPage = lazy(() => import('./pages/EntitiesPage'));
const EntityPage = lazy(() => import('./pages/EntityPage'));
const BrimPage = lazy(() => import('./pages/BrimPage'));

const RelationshipGraphPage = lazy(() => import('./pages/RelationshipGraphPage'));

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
        <CommandBarProvider>
          <CommandBar />
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/explore" element={<ExplorePage />} />
                  {/* Legacy routes — redirect to unified Explore */}
                  <Route path="/search" element={<Navigate to="/explore" replace />} />
                  <Route path="/screener" element={<Navigate to="/explore" replace />} />
                  <Route path="/screen" element={<Navigate to="/explore" replace />} />
                  <Route path="/institution/:certNumber" element={<InstitutionStoryPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/market" element={<Navigate to="/analytics" replace />} />
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="/qa" element={<QAPage />} />
                  <Route path="/sources" element={<DataSourcesPage />} />
                  <Route path="/entities" element={<EntitiesPage />} />
                  <Route path="/entities/:entityId" element={<EntityPage />} />
                  <Route path="/watchlist" element={<WatchlistPage />} />
                  <Route path="/failures" element={<FailuresPage />} />
                  <Route path="/brim" element={<BrimPage />} />
                  <Route path="/geo" element={<Navigate to="/explore?view=map" replace />} />
                  <Route path="/graph" element={<RelationshipGraphPage />} />
                </Routes>
              </Suspense>
            </main>
            <Footer />
          </div>
        </CommandBarProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
