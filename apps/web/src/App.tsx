import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthConfigProvider, useAuthConfig } from "./auth-config";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ChatPage } from "./pages/ChatPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ReportPage } from "./pages/ReportPage";
import { getToken } from "./api";

function RequireAuth({ children }: { children: ReactNode }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function SignupRoute() {
  const { registrationEnabled } = useAuthConfig();
  if (!registrationEnabled) {
    return <Navigate to="/login" replace />;
  }
  return <SignupPage />;
}

function ReportRoute() {
  const { reportId } = useParams<{ reportId: string }>();
  if (!reportId) return <Navigate to="/sessions" replace />;
  return <ReportPage key={reportId} />;
}

function HomeRedirect() {
  return getToken() ? <Navigate to="/sessions" replace /> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const location = useLocation();

  return (
    <div key={location.pathname}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupRoute />} />
      <Route
        path="/sessions"
        element={
          <RequireAuth>
            <SessionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/chat/:sessionId"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route
        path="/report/:reportId"
        element={
          <RequireAuth>
            <ReportRoute />
          </RequireAuth>
        }
      />
      <Route
        path="/privacy"
        element={
          <RequireAuth>
            <PrivacyPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthConfigProvider>
      <AppRoutes />
    </AuthConfigProvider>
  );
}
