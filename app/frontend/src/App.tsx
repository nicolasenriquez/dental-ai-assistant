import { type ReactNode, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ChatArea } from './components/ChatArea';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AdminVideos } from './pages/AdminVideos';
import { EvolutionDetail } from './pages/EvolutionDetail';
import { Login } from './pages/Login';
import { NewEvolution } from './pages/NewEvolution';
import { NotFound } from './pages/NotFound';
import { PatientDetail } from './pages/PatientDetail';
import { Patients } from './pages/Patients';
import { Signup } from './pages/Signup';

// ── Auth guard ───────────────────────────────────────────────────
interface RequireAuthProps {
  children: ReactNode;
}

function RequireAuth({ children }: RequireAuthProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text-secondary)]">
        Loading…
      </div>
    );
  }
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

// ── Layout wrapper used by all routes ────────────────────────────
interface AppLayoutProps {
  conversationId?: string;
}

function AppLayout({ conversationId }: AppLayoutProps) {
  // Shared ref so ChatArea can trigger a sidebar conversation refresh
  const conversationsRef = useRef<(() => Promise<void>) | null>(null) as React.MutableRefObject<
    (() => Promise<void>) | null
  >;

  return (
    <AppShell
      activeConversationId={conversationId}
      showConversations
      conversationsRef={conversationsRef}
    >
      <ChatArea conversationId={conversationId} refreshConversationsRef={conversationsRef} />
    </AppShell>
  );
}

// ── Route components ─────────────────────────────────────────────
function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  return <AppLayout conversationId={conversationId} />;
}

// ── Root app ─────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Navigate to="/patients" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/patients"
              element={
                <RequireAuth>
                  <AppShell showConversations={false}>
                    <Patients />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/patients/:patientId"
              element={
                <RequireAuth>
                  <AppShell showConversations={false}>
                    <PatientDetail />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/patients/:patientId/evolutions/new"
              element={
                <RequireAuth>
                  <AppShell showConversations={false}>
                    <NewEvolution />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/patients/:patientId/evolutions/:evolutionId"
              element={
                <RequireAuth>
                  <AppShell showConversations={false}>
                    <EvolutionDetail />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/chat"
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            />
            <Route
              path="/c/:conversationId"
              element={
                <RequireAuth>
                  <ConversationPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminVideos />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
