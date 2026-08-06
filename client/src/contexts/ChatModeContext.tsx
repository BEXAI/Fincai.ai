import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type ChatMode = "trade" | "plan";

interface ChatModeContextValue {
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
  toggleMode: () => void;
  isTradeMode: boolean;
  isPlanMode: boolean;
}

const ChatModeContext = createContext<ChatModeContextValue | null>(null);

const STORAGE_KEY = "fincai-chat-mode";

interface ChatModeProviderProps {
  children: ReactNode;
  defaultMode?: ChatMode;
}

export function ChatModeProvider({ children, defaultMode = "trade" }: ChatModeProviderProps) {
  const [mode, setModeState] = useState<ChatMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "trade" || stored === "plan") return stored;
    return defaultMode;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((newMode: ChatMode) => {
    setModeState(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => prev === "trade" ? "plan" : "trade");
  }, []);

  const value: ChatModeContextValue = {
    mode,
    setMode,
    toggleMode,
    isTradeMode: mode === "trade",
    isPlanMode: mode === "plan",
  };

  return (
    <ChatModeContext.Provider value={value}>
      {children}
    </ChatModeContext.Provider>
  );
}

export function useChatMode(): ChatModeContextValue {
  const context = useContext(ChatModeContext);
  if (!context) {
    throw new Error("useChatMode must be used within a ChatModeProvider");
  }
  return context;
}

export function useChatModeOptional(): ChatModeContextValue | null {
  return useContext(ChatModeContext);
}
