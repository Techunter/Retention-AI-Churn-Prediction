import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("retention_ai_token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("retention_ai_user");
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("retention_ai_token")));

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await authApi.me();
        if (active) {
          setUser(res.data);
          localStorage.setItem("retention_ai_user", JSON.stringify(res.data));
        }
      } catch {
        if (active) {
          localStorage.removeItem("retention_ai_token");
          localStorage.removeItem("retention_ai_user");
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    verifySession();
    return () => {
      active = false;
    };
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    const { access_token, user: userData } = res.data;
    localStorage.setItem("retention_ai_token", access_token);
    localStorage.setItem("retention_ai_user", JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("retention_ai_token");
    localStorage.removeItem("retention_ai_user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
