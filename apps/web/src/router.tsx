import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { getToken } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ChatPage } from "./pages/ChatPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ReportPage } from "./pages/ReportPage";
import { useAuthConfig } from "./auth-config";

function RequireAuth({ children }: { children: ReactNode }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function SignupGate() {
  const { registrationEnabled } = useAuthConfig();
  if (!registrationEnabled) {
    return <Navigate to="/login" replace />;
  }
  return <SignupPage />;
}

function HomeRedirect() {
  return getToken() ? <Navigate to="/sessions" replace /> : <Navigate to="/login" replace />;
}

function ReportRoute() {
  const { reportId } = useParams<{ reportId: string }>();
  if (!reportId) return <Navigate to="/sessions" replace />;
  return <ReportPage key={reportId} />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupGate /> },
  {
    path: "/sessions",
    element: (
      <RequireAuth>
        <SessionsPage />
      </RequireAuth>
    )
  },
  {
    path: "/chat/:sessionId",
    element: (
      <RequireAuth>
        <ChatPage />
      </RequireAuth>
    )
  },
  {
    path: "/report/:reportId",
    element: (
      <RequireAuth>
        <ReportRoute />
      </RequireAuth>
    )
  },
  {
    path: "/privacy",
    element: (
      <RequireAuth>
        <PrivacyPage />
      </RequireAuth>
    )
  },
  { path: "/", element: <HomeRedirect /> },
  { path: "*", element: <Navigate to="/" replace /> }
]);
