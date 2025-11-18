import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initialising, setInitialising] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);

  const refresh = useCallback(async () => {
    setInitialising(true);
    try {
      const response = await fetch("/api/me", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const payload = await response.json();
      
      setUser(payload.user ?? null);
    } catch (error) {
      console.error("[auth] failed to refresh session", error);
      setUser(null);
    } finally {
      setInitialising(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    
    setAuthenticating(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Login failed.");
      }

      setUser(payload.user ?? null);
      return payload.user ?? null;
    } catch (error) {
    console.error("Login error:", error);
    throw error;
  }  
    finally {
      setAuthenticating(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthenticating(true);
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      setAuthenticating(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading: initialising,
      authenticating,
      login,
      logout,
      refresh,
    }),
    [user, initialising, authenticating, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
