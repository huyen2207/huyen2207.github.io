import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import { useUiStore } from '@/app/stores/uiStore';
import { AppShell } from './AppShell';
import { ErrorState, LoadingState } from './components/primitives';
import OnboardingPage from './pages/OnboardingPage';
import PlacementPage from './pages/PlacementPage';
import TodayPage from './pages/TodayPage';
import SessionPage from './pages/SessionPage';
import GrammarListPage from './pages/GrammarListPage';
import GrammarDetailPage from './pages/GrammarDetailPage';
import ComparePage from './pages/ComparePage';
import TrapLabPage from './pages/TrapLabPage';
import ReviewPage from './pages/ReviewPage';
import MistakesPage from './pages/MistakesPage';
import GrammarMapPage from './pages/GrammarMapPage';
import PracticePage from './pages/PracticePage';
import MockPage from './pages/MockPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import PhaseTransitionPage from './pages/PhaseTransitionPage';
import MorePage from './pages/MorePage';

export default function App() {
  const status = useAppStore((s) => s.status);
  const errorMessage = useAppStore((s) => s.errorMessage);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const hydrate = useUiStore((s) => s.hydrate);
  const location = useLocation();

  useEffect(() => {
    hydrate();
    void bootstrap();
  }, [bootstrap, hydrate]);

  if (status === 'IDLE' || status === 'LOADING') {
    return (
      <AppShell hideNav>
        <LoadingState />
      </AppShell>
    );
  }

  if (status === 'ERROR') {
    return (
      <AppShell hideNav>
        <ErrorState message={errorMessage ?? undefined} onRetry={() => void bootstrap()} />
      </AppShell>
    );
  }

  if (status === 'NEEDS_ONBOARDING' && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/today" replace />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/placement" element={<PlacementPage />} />
      <Route path="/today" element={<TodayPage />} />
      <Route path="/session" element={<SessionPage />} />
      <Route path="/grammar" element={<GrammarListPage />} />
      <Route path="/grammar/:id" element={<GrammarDetailPage />} />
      <Route path="/compare" element={<ComparePage />} />
      <Route path="/trap-lab" element={<TrapLabPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/mistakes" element={<MistakesPage />} />
      <Route path="/grammar-map" element={<GrammarMapPage />} />
      <Route path="/practice" element={<PracticePage />} />
      <Route path="/mock" element={<MockPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/transition" element={<PhaseTransitionPage />} />
      <Route path="/more" element={<MorePage />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
