import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ChatPage } from "./pages/ChatPage";
import { getToken } from "./api";

function PrivateRoute({ children }: { children: ReactNode }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/chat/:sessionId"
        element={
          <PrivateRoute>
            <ChatPage />
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
