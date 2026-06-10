import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthConfigProvider, useAuthConfig } from "./auth-config";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ChatPage } from "./pages/ChatPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ReportPage } from "./pages/ReportPage";
import { getToken } from "./api";

function PrivateRoute({ children }: { children: ReactNode }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function SignupRoute() {
  const { registrationEnabled } = useAuthConfig();
  if (!registrationEnabled) {
    return <Navigate to="/login" replace />;
  }
  return <SignupPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupRoute />} />
      <Route
        path="/sessions"
        element={
          <PrivateRoute>
            <SessionsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/chat/:sessionId"
        element={
          <PrivateRoute>
            <ChatPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/report/:reportId"
        element={
          <PrivateRoute>
            <ReportPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/privacy"
        element={
          <PrivateRoute>
            <PrivacyPage />
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthConfigProvider>
      <AppRoutes />
    </AuthConfigProvider>
  );
}
