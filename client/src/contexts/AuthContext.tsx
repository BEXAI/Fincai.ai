import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, API_BASE_URL } from "@/lib/queryClient";
import { getAnonymousMessages, clearAnonymousData } from "@/hooks/use-anonymous-chat";

const TOKEN_REFRESH_INTERVAL_MS = 12 * 60 * 1000;
const CSRF_HEADER_NAME = "X-CSRF-Token";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  migrateAnonymousMessages: () => Promise<void>;
  getCsrfToken: () => Promise<string>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  justRegistered: boolean;
  clearJustRegistered: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState(false);
  const { toast } = useToast();

  const clearJustRegistered = useCallback(() => setJustRegistered(false), []);
  
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const isRetryingRef = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const getCsrfToken = useCallback(async (): Promise<string> => {
    if (csrfToken) {
      return csrfToken;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/csrf`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    } catch (error) {
      console.error("Failed to fetch CSRF token:", error);
    }
    
    throw new Error("Failed to get CSRF token");
  }, [csrfToken]);

  const refreshTokens = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) {
      return false;
    }

    isRefreshingRef.current = true;

    try {
      const token = await getCsrfToken();
      
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: token,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        return true;
      } else {
        setUser(null);
        clearRefreshTimer();
        return false;
      }
    } catch (error) {
      console.error("Token refresh error:", error);
      setUser(null);
      clearRefreshTimer();
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [getCsrfToken, clearRefreshTimer]);

  const setupRefreshTimer = useCallback(() => {
    clearRefreshTimer();
    
    refreshTimerRef.current = setInterval(() => {
      refreshTokens();
    }, TOKEN_REFRESH_INTERVAL_MS);
  }, [clearRefreshTimer, refreshTokens]);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const makeRequest = async (token: string): Promise<Response> => {
      const headers = new Headers(options.headers || {});
      headers.set(CSRF_HEADER_NAME, token);
      
      return fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers,
        credentials: "include",
      });
    };

    try {
      const token = await getCsrfToken();
      let response = await makeRequest(token);

      if (response.status === 401 && !isRetryingRef.current && user) {
        isRetryingRef.current = true;

        try {
          const refreshSuccess = await refreshTokens();
          
          if (refreshSuccess) {
            const newToken = await getCsrfToken();
            response = await makeRequest(newToken);
          }
        } finally {
          isRetryingRef.current = false;
        }
      }

      return response;
    } catch (error) {
      throw error;
    }
  }, [getCsrfToken, refreshTokens, user]);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setupRefreshTimer();
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [setupRefreshTimer]);

  useEffect(() => {
    fetchUser();
    
    return () => {
      clearRefreshTimer();
    };
  }, [fetchUser, clearRefreshTimer]);

  // Prime the CSRF cookie once on load so anonymous users can make state-changing
  // requests (e.g. starting a paper strategy run) without a 403.
  useEffect(() => {
    getCsrfToken().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const migrateAnonymousMessages = useCallback(async () => {
    const anonymousMessages = getAnonymousMessages();
    
    if (anonymousMessages.length === 0) {
      return;
    }

    try {
      const token = await getCsrfToken();
      const response = await fetch(`${API_BASE_URL}/api/conversations/migrate-anonymous`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: token,
        },
        body: JSON.stringify({ messages: anonymousMessages }),
        credentials: "include",
      });

      if (response.ok) {
        clearAnonymousData();
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        toast({
          title: "Chat history saved!",
          description: "Your anonymous messages have been saved to your account.",
        });
      }
    } catch (error) {
      console.error("Failed to migrate anonymous messages:", error);
    }
  }, [toast, getCsrfToken]);

  const login = useCallback(async (email: string, password: string) => {
    const token = await getCsrfToken();
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: token,
      },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Login failed");
    }

    const data = await response.json();
    setUser(data.user);
    setupRefreshTimer();
    queryClient.invalidateQueries();
    
    toast({
      title: "Welcome back!",
      description: `Signed in as ${data.user.email}`,
    });

    await migrateAnonymousMessages();
  }, [toast, migrateAnonymousMessages, getCsrfToken, setupRefreshTimer]);

  const register = useCallback(async (
    email: string, 
    password: string, 
    firstName?: string, 
    lastName?: string
  ) => {
    const token = await getCsrfToken();
    
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: token,
      },
      body: JSON.stringify({ email, password, firstName, lastName }),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Registration failed");
    }

    const data = await response.json();
    setUser(data.user);
    setJustRegistered(true);
    setupRefreshTimer();
    queryClient.invalidateQueries();
    
    toast({
      title: "Account created!",
      description: "Welcome to the trading platform.",
    });

    await migrateAnonymousMessages();
  }, [toast, migrateAnonymousMessages, getCsrfToken, setupRefreshTimer]);

  const logout = useCallback(async () => {
    clearRefreshTimer();
    
    try {
      const token = await getCsrfToken();
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          [CSRF_HEADER_NAME]: token,
        },
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setCsrfToken(null);
      queryClient.clear();
      
      toast({
        title: "Signed out",
        description: "You have been logged out successfully.",
      });
    }
  }, [toast, getCsrfToken, clearRefreshTimer]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        register,
        migrateAnonymousMessages,
        getCsrfToken,
        authFetch,
        justRegistered,
        clearJustRegistered,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
