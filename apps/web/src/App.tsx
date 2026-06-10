import { RouterProvider } from "react-router-dom";
import { AuthConfigProvider } from "./auth-config";
import { router } from "./router";

export default function App() {
  return (
    <AuthConfigProvider>
      <RouterProvider router={router} />
    </AuthConfigProvider>
  );
}
