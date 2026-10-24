import { lazy, type ReactNode, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import MobileNav from './components/MobileNav';
import OnboardingWizard from './components/OnboardingWizard';
import PushPrompt from './components/PushPrompt';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { RealtimeProvider } from './hooks/useRealtime';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const FeedPage = lazy(() => import('./pages/FeedPage'));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const TagPage = lazy(() => import('./pages/TagPage'));
const PostPage = lazy(() => import('./pages/PostPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const FollowListPage = lazy(() => import('./pages/FollowListPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const PublicChatPage = lazy(() => import('./pages/PublicChatPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const ForgotPasswordPage = lazy(() => import('./pages/AuthFlowPages').then((m) => ({ default: m.ForgotPasswordPage })));

function Loading() {
  return (
    <div className="loading-overlay">
      <div className="spinner" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const protectedPage = (el: ReactNode) => <ProtectedRoute>{el}</ProtectedRoute>;
const publicPage = (el: ReactNode) => <PublicRoute>{el}</PublicRoute>;

/* Rich presence Discord (appli de bureau uniquement) : on indique la page courante. */
function usePresence() {
  const { pathname } = useLocation();
  useEffect(() => {
    const presence = window.electronAPI?.updateDiscordPresence;
    if (!presence) return;
    presence(pathname === '/auth' ? 'login' : pathname.startsWith('/settings') ? 'settings' : 'home');
  }, [pathname]);
}

/* Assistant de bienvenue : montre le tutoriel aux nouveaux comptes (onboardingDone = false).
   Passé par « Passer » ou terminé => /auth/onboarded est appelé et le compte ne le revoit plus. */
function OnboardingGate() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading || !user || user.onboardingDone || pathname === '/auth' || pathname === '/forgot-password') return null;
  return <OnboardingWizard />;
}

function AppRoutes() {
  usePresence();
  return (
    <Routes>
      <Route path="/auth" element={publicPage(<LoginPage />)} />
      <Route path="/forgot-password" element={publicPage(<ForgotPasswordPage />)} />
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route path="/" element={protectedPage(<FeedPage />)} />
      <Route path="/explore" element={protectedPage(<ExplorePage />)} />
      <Route path="/bookmarks" element={protectedPage(<BookmarksPage />)} />
      <Route path="/tag/:tag" element={protectedPage(<TagPage />)} />
      <Route path="/post/:id" element={protectedPage(<PostPage />)} />
      <Route path="/notifications" element={protectedPage(<NotificationsPage />)} />
      <Route path="/chat" element={protectedPage(<PublicChatPage />)} />
      <Route path="/messages" element={protectedPage(<MessagesPage />)} />
      <Route path="/messages/:id" element={protectedPage(<ChatPage />)} />
      <Route path="/settings" element={protectedPage(<SettingsPage />)} />
      <Route path="/admin" element={protectedPage(<AdminPage />)} />
      <Route path="/:pseudo/followers" element={protectedPage(<FollowListPage kind="followers" />)} />
      <Route path="/:pseudo/following" element={protectedPage(<FollowListPage kind="following" />)} />
      <Route path="/:pseudo" element={protectedPage(<ProfilePage />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <RealtimeProvider>
            <Suspense fallback={<Loading />}>
              <AppRoutes />
              <OnboardingGate />
              <MobileNav />
              <PushPrompt />
            </Suspense>
          </RealtimeProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
