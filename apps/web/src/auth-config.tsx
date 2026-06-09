import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AuthConfig = {
  registrationEnabled: boolean;
};

const AuthConfigContext = createContext<AuthConfig | null>(null);

export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load auth config");
        return res.json() as Promise<AuthConfig>;
      })
      .then(setConfig)
      .catch(() => setConfig({ registrationEnabled: true }));
  }, []);

  if (!config) {
    return null;
  }

  return <AuthConfigContext.Provider value={config}>{children}</AuthConfigContext.Provider>;
}

export function useAuthConfig(): AuthConfig {
  const config = useContext(AuthConfigContext);
  if (!config) {
    throw new Error("useAuthConfig must be used within AuthConfigProvider");
  }
  return config;
}
