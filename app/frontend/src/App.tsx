import { MotionConfig } from 'motion/react';
import { type ReactNode, useRef } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useLocation,
  useMatch,
} from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ChatArea } from './components/ChatArea';
import { ChatRuntimeProvider } from './components/ChatRuntimeProvider';
import { ToastProvider } from './components/ToastProvider';
import {
  AuthProvider,
  isAuthenticatedStatus,
  isUnauthenticatedStatus,
  useAuth,
} from './hooks/useAuth';
import { useChatRuntime } from './hooks/useChatRuntime';
import { AdminVideos } from './pages/AdminVideos';
import { ClinicalAssistant } from './pages/ClinicalAssistant';
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

  if (isAuthenticatedStatus(status)) {
    return <>{children}</>;
  }
  if (isUnauthenticatedStatus(status) || status === 'error') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text-secondary)]">
      Loading…
    </div>
  );
}

// ── Layout wrapper used by all routes ────────────────────────────
function AppLayout() {
  const conversationId = useMatch('/c/:conversationId')?.params.conversationId;
  // Shared ref so ChatArea can trigger a sidebar conversation refresh
  const conversationsRef = useRef<(() => Promise<void>) | null>(null) as React.MutableRefObject<
    (() => Promise<void>) | null
  >;
  const { runtimeByConversationId, startStream, abortStream, clearRuntime } = useChatRuntime();
  const { refresh: refreshAuth } = useAuth();

  return (
    <AppShell
      activeConversationId={conversationId}
      showConversations
      conversationsRef={conversationsRef}
      runtimeByConversationId={runtimeByConversationId}
    >
      <ChatArea
        conversationId={conversationId}
        refreshConversationsRef={conversationsRef}
        runtime={conversationId ? runtimeByConversationId[conversationId] : undefined}
        startStream={startStream}
        abortStream={abortStream}
        clearRuntime={clearRuntime}
        refreshAuth={refreshAuth}
      />
    </AppShell>
  );
}

// ── Route components ─────────────────────────────────────────────
function AppProviders() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </AuthProvider>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppProviders />}>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        element={
          <RequireAuth>
            <ChatRuntimeProvider>
              <Outlet />
            </ChatRuntimeProvider>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route
          path="/patients"
          element={
            <AppShell showConversations={false}>
              <Patients />
            </AppShell>
          }
        />
        <Route
          path="/patients/:patientId"
          element={
            <AppShell showConversations={false}>
              <PatientDetail />
            </AppShell>
          }
        />
        <Route
          path="/patients/:patientId/evolutions/new"
          element={
            <AppShell showConversations={false}>
              <NewEvolution />
            </AppShell>
          }
        />
        <Route
          path="/patients/:patientId/evolutions/:evolutionId"
          element={
            <AppShell showConversations={false}>
              <PatientDetail />
            </AppShell>
          }
        />
        <Route element={<AppLayout />}>
          <Route path="/chat" />
          <Route path="/c/:conversationId" />
        </Route>
        <Route path="/assistant" element={<ClinicalAssistant />} />
        <Route path="/a/:threadId" element={<ClinicalAssistant />} />
        <Route path="/admin" element={<AdminVideos />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>,
  ),
);

// ── Root app ─────────────────────────────────────────────────────
function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}

export default App;
