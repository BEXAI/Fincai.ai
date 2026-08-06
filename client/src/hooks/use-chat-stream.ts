import { useState, useCallback, useRef, useEffect } from "react";
import { API_BASE_URL } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { isPromoCaptureMode } from "@/lib/promo-capture";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export type ChatMode = "trade" | "plan";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming";
}

interface SSEEvent {
  type: "conversation_id" | "content" | "done";
  id?: string;
  text?: string;
}

// A short, realistic demo exchange used only in promo-capture mode so the /promo
// chat slide screenshot shows the real conversation UI. Educational framing only.
const DEMO_CONVERSATION: ChatMessage[] = [
  {
    id: "demo-user-1",
    role: "user",
    content: "Is SPY overextended right now?",
    status: "complete",
  },
  {
    id: "demo-assistant-1",
    role: "assistant",
    content:
      "Reasoning: I pulled SPY's live quote and recent bars. RSI(14) is 71 — above the conventional 70 overbought line — and price sits about 2.1% over its 20-day mean, a stretched reading.\n\nContext: Volume is roughly average, so there's no clear distribution signal yet. In similar setups price often pauses or mean-reverts, though momentum can persist longer than expected.\n\nThis is educational context, not financial advice. Want the technical levels or how the multi-agent desk reads it?",
    status: "complete",
  },
  {
    id: "demo-user-2",
    role: "user",
    content: "Show me the technical levels.",
    status: "complete",
  },
  {
    id: "demo-assistant-2",
    role: "assistant",
    content:
      "SPY technical snapshot:\n• Pivot: 737.90 — price is trading just above it.\n• Resistance (R1): 743.90 · Support (S1): 733.10\n• ATR(14): ~4.8 points, so a normal daily range fits inside those levels.\n• Bollinger: price is riding the upper band (2σ), consistent with the stretched RSI.\n\nNet: near-term extended into resistance with room back toward the pivot. Educational only — not a recommendation.",
    status: "complete",
  },
];

interface UseChatStreamOptions {
  conversationId?: string;
  mode?: ChatMode;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  streamingMessage: string;
  sendMessage: (content: string) => Promise<void>;
  isStreaming: boolean;
  isWaitingForFirstToken: boolean;
  conversationId: string | null;
  clearMessages: () => void;
  isLoadingHistory: boolean;
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingForFirstToken, setIsWaitingForFirstToken] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(options.conversationId || null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadedConversationRef = useRef<string | null>(null);

  useEffect(() => {
    const loadConversation = async () => {
      if (options.conversationId && options.conversationId !== loadedConversationRef.current) {
        setIsLoadingHistory(true);
        setConversationId(options.conversationId);
        loadedConversationRef.current = options.conversationId;
        
        try {
          const response = await fetch(`${API_BASE_URL}/api/conversations/${options.conversationId}`, {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.messages && Array.isArray(data.messages)) {
              const loadedMessages: ChatMessage[] = data.messages.map((msg: any) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant",
                content: msg.content,
                status: "complete" as const,
              }));
              setMessages(loadedMessages);
            }
          } else {
            console.error("Failed to load conversation:", response.status);
            setMessages([]);
          }
        } catch (error) {
          console.error("Error loading conversation:", error);
          setMessages([]);
        } finally {
          setIsLoadingHistory(false);
        }
      } else if (!options.conversationId) {
        // Promo-capture mode: seed a canned demo conversation so the /promo chat
        // slide screenshot shows the real conversation UI (in-memory only).
        setMessages(isPromoCaptureMode() ? DEMO_CONVERSATION : []);
        setConversationId(null);
        loadedConversationRef.current = null;
      }
    };

    loadConversation();
  }, [options.conversationId]);

  // Abort any in-flight stream when the consumer unmounts so the reader loop
  // doesn't keep running (and calling setState) on an unmounted component.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessage("");
    setConversationId(null);
    loadedConversationRef.current = null;
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming || !content.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: content.trim(),
      status: "complete",
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setIsWaitingForFirstToken(true);
    setStreamingMessage("");

    abortControllerRef.current = new AbortController();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers,
        credentials: 'include',
        body: JSON.stringify({
          content: content.trim(),
          conversationId,
          mode: options.mode || "trade",
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let accumulatedText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            
            try {
              const event: SSEEvent = JSON.parse(jsonStr);
              
              switch (event.type) {
                case "conversation_id":
                  if (event.id) {
                    setConversationId(event.id);
                    loadedConversationRef.current = event.id;
                  }
                  break;
                case "content":
                  if (event.text) {
                    setIsWaitingForFirstToken(false);
                    accumulatedText += event.text;
                    setStreamingMessage(accumulatedText);
                  }
                  break;
                case "done":
                  const assistantMessage: ChatMessage = {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: accumulatedText,
                    status: "complete",
                  };
                  setMessages((prev) => [...prev, assistantMessage]);
                  setStreamingMessage("");
                  break;
              }
            } catch {
              console.warn("Failed to parse SSE event:", jsonStr);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("Stream aborted");
      } else {
        console.error("Chat stream error:", error);
        
        // Determine error type for better user feedback
        const isNetworkError = error instanceof TypeError && 
          (error.message.includes("fetch") || error.message.includes("network"));
        const isTimeout = error instanceof Error && error.message.includes("timeout");
        
        let errorContent = "Sorry, there was an error processing your request. Please try again.";
        let toastTitle = "Connection Error";
        
        if (isNetworkError) {
          errorContent = "Unable to connect to the AI assistant. Please check your connection and try again.";
          toastTitle = "Connection Lost";
        } else if (isTimeout) {
          errorContent = "The request timed out. The AI may be busy - please try again in a moment.";
          toastTitle = "Request Timeout";
        }
        
        // Show toast notification for visibility
        toast({
          title: toastTitle,
          description: "Please check your connection and try again.",
          variant: "destructive",
        });
        
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: errorContent,
          status: "complete",
        };
        setMessages((prev) => [...prev, errorMessage]);
        setStreamingMessage("");
      }
    } finally {
      setIsStreaming(false);
      setIsWaitingForFirstToken(false);
      abortControllerRef.current = null;
    }
  }, [isStreaming, conversationId, options.mode]);

  return {
    messages,
    streamingMessage,
    sendMessage,
    isStreaming,
    isWaitingForFirstToken,
    conversationId,
    clearMessages,
    isLoadingHistory,
  };
}
