import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider, Loading } from '@/components/ui';
import { useProfile, useSettings } from './data';
import { Background } from './background';
import { BottomNav, SideNav } from './Navigation';

import AuthPage from '@/features/auth/AuthPage';
import Onboarding from '@/features/onboarding/Onboarding';
import HomePage from '@/features/home/HomePage';

const ExplorePage = lazy(() => import('@/features/explore/ExplorePage'));
const WorkoutsPage = lazy(() => import('@/features/workouts/WorkoutsPage'));
const TemplateEditor = lazy(() => import('@/features/workouts/TemplateEditor'));
const ProgramEditor = lazy(() => import('@/features/workouts/ProgramEditor'));
const GeneratePage = lazy(() => import('@/features/workouts/GeneratePage'));
const LiveWorkout = lazy(() => import('@/features/workouts/LiveWorkout'));
const SessionDetail = lazy(() => import('@/features/workouts/SessionDetail'));
const HistoryPage = lazy(() => import('@/features/progress/HistoryPage'));
const ProgressPage = lazy(() => import('@/features/progress/ProgressPage'));
const ExerciseLibrary = lazy(() => import('@/features/exercises/ExerciseLibrary'));
const ExerciseDetail = lazy(() => import('@/features/exercises/ExerciseDetail'));
const NutritionPage = lazy(() => import('@/features/nutrition/NutritionPage'));
const AddFood = lazy(() => import('@/features/nutrition/AddFood'));
const RecipesPage = lazy(() => import('@/features/nutrition/RecipesPage'));
const MealPlanPage = lazy(() => import('@/features/nutrition/MealPlanPage'));
const ShoppingList = lazy(() => import('@/features/nutrition/ShoppingList'));
const TargetsPage = lazy(() => import('@/features/nutrition/TargetsPage'));
const MyFoodsPage = lazy(() => import('@/features/nutrition/MyFoodsPage'));
const ScannerPage = lazy(() => import('@/features/nutrition/ScannerPage'));
const ProductPage = lazy(() => import('@/features/nutrition/ProductPage'));
const ScannedProducts = lazy(() => import('@/features/nutrition/ScannedProducts'));
const EnergyPage = lazy(() => import('@/features/energy/EnergyPage'));
const BodyPage = lazy(() => import('@/features/body/BodyPage'));
const CardioPage = lazy(() => import('@/features/cardio/CardioPage'));
const WellnessPage = lazy(() => import('@/features/wellness/WellnessPage'));
const CoachPage = lazy(() => import('@/features/coach/CoachPage'));
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage'));
const NotificationsPage = lazy(() => import('@/features/goals/NotificationsPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const EditProfile = lazy(() => import('@/features/profile/EditProfile'));
const EquipmentPage = lazy(() => import('@/features/profile/EquipmentPage'));
const SettingsPage = lazy(() => import('@/features/profile/SettingsPage'));
const PrivacyPage = lazy(() => import('@/features/profile/PrivacyPage'));

function ThemeSync() {
  const s = useSettings();
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta?.setAttribute('content', dark ? '#07080a' : '#f3f4f1');
  }, [s.theme]);
  return null;
}

function Shell() {
  const loc = useLocation();
  const immersive = loc.pathname.startsWith('/workout/live') || loc.pathname === '/nutrition/scan';
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="app-shell">
      {!immersive && <SideNav />}
      <main className={immersive ? '' : 'main'} style={immersive ? { flex: 1, minWidth: 0 } : undefined}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/workouts" element={<WorkoutsPage />} />
            <Route path="/workouts/generate" element={<GeneratePage />} />
            <Route path="/workouts/template/:id" element={<TemplateEditor />} />
            <Route path="/workouts/program/:id" element={<ProgramEditor />} />
            <Route path="/workout/live" element={<LiveWorkout />} />
            <Route path="/session/:id" element={<SessionDetail />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/exercises" element={<ExerciseLibrary />} />
            <Route path="/exercises/:id" element={<ExerciseDetail />} />
            <Route path="/nutrition" element={<NutritionPage />} />
            <Route path="/nutrition/add" element={<AddFood />} />
            <Route path="/nutrition/recipes" element={<RecipesPage />} />
            <Route path="/nutrition/plan" element={<MealPlanPage />} />
            <Route path="/nutrition/shopping" element={<ShoppingList />} />
            <Route path="/nutrition/targets" element={<TargetsPage />} />
            <Route path="/nutrition/foods" element={<MyFoodsPage />} />
            <Route path="/nutrition/scan" element={<ScannerPage />} />
            <Route path="/nutrition/product/:code" element={<ProductPage />} />
            <Route path="/nutrition/scanned" element={<ScannedProducts />} />
            <Route path="/energy" element={<EnergyPage />} />
            <Route path="/body" element={<BodyPage />} />
            <Route path="/cardio" element={<CardioPage />} />
            <Route path="/wellness" element={<WellnessPage />} />
            <Route path="/coach" element={<CoachPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/edit" element={<EditProfile />} />
            <Route path="/profile/equipment" element={<EquipmentPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!immersive && <BottomNav />}
      <Background />
    </div>
  );
}

function Gate() {
  const { state } = useAuth();
  const profile = useProfile();
  if (state.status === 'loading') return <Loading label="Avvio di Forma…" />;
  if (state.status === 'signedOut') return <AuthPage />;
  if (!profile?.onboardedAt || !profile?.equipmentSetAt) return <><ThemeSync /><Onboarding /></>;
  return <><ThemeSync /><Shell /></>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Gate />
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
