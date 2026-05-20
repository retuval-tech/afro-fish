import { useState } from "react";
import { useLocation } from "wouter";

export function usePlayerAuth() {
  const [sessionToken, setSessionTokenState] = useState<string | null>(
    () => localStorage.getItem("sessionToken")
  );
  const [, setLocation] = useLocation();

  const setSessionToken = (token: string | null) => {
    if (token) {
      localStorage.setItem("sessionToken", token);
    } else {
      localStorage.removeItem("sessionToken");
    }
    setSessionTokenState(token);
  };

  const logout = () => {
    setSessionToken(null);
    setLocation("/");
  };

  return { sessionToken, setSessionToken, logout };
}

export function useAdminAuth() {
  const [adminKey, setAdminKeyState] = useState<string | null>(
    () => localStorage.getItem("adminKey")
  );
  const [, setLocation] = useLocation();

  const setAdminKey = (key: string | null) => {
    if (key) {
      localStorage.setItem("adminKey", key);
    } else {
      localStorage.removeItem("adminKey");
    }
    setAdminKeyState(key);
  };

  const logout = () => {
    setAdminKey(null);
    setLocation("/admin");
  };

  return { adminKey, setAdminKey, logout };
}
