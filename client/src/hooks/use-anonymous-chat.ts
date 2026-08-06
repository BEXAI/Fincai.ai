import { useState, useCallback, useEffect, useRef } from "react";
import { API_BASE_URL } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

const ANONYMOUS_MESSAGES_KEY = "anonymousMessages";
const ANONYMOUS_MESSAGE_COUNT_KEY = "anonymousMessageCount";
const ANONYMOUS_MODAL_DISMISSED_KEY = "anonymousModalDismissed";

export interface AnonymousChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming";
  timestamp: number;
}

interface SSEEvent {
  type: "conversation_id" | "content" | "done";
  id?: string;
  text?: string;
}

interface UseAnonymousChatReturn {
  messages: AnonymousChatMessage[];
  streamingMessage: string;
  sendMessage: (content: string) => Promise<void>;
  isStreaming: boolean;
  messageCount: number;
  shouldShowSignupModal: boolean;
  dismissSignupModal: () => void;
  clearMessages: () => void;
}

export function useAnonymousChat(): UseAnonymousChatReturn {
  const [messages, setMessages] = useState<AnonymousChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [shouldShowSignupModal, setShouldShowSignupModal] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem(ANONYMOUS_MESSAGES_KEY);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }
      
      const savedCount = sessionStorage.getItem(ANONYMOUS_MESSAGE_COUNT_KEY);
      if (savedCount) {
        setMessageCount(parseInt(savedCount, 10));
      }

      const savedDismissCount = sessionStorage.getItem(ANONYMOUS_MODAL_DISMISSED_KEY);
      if (savedDismissCount) {
        setDismissCount(parseInt(savedDismissCount, 10));
      }
    } catch (error) {
      console.error("Error loading anonymous chat data:", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ANONYMOUS_MESSAGES_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error("Error saving anonymous messages:", error);
    }
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem(ANONYMOUS_MESSAGE_COUNT_KEY, messageCount.toString());
    
    if (messageCount === 3 && dismissCount === 0) {
      setShouldShowSignupModal(true);
    } else if (dismissCount > 0 && messageCount > 3) {
      const messagesSinceDismiss = messageCount - 3 - (dismissCount - 1) * 5;
      if (messagesSinceDismiss > 0 && messagesSinceDismiss % 5 === 0) {
        setShouldShowSignupModal(true);
      }
    }
  }, [messageCount, dismissCount]);

  const dismissSignupModal = useCallback(() => {
    setShouldShowSignupModal(false);
    setDismissCount((prev) => {
      const newCount = prev + 1;
      sessionStorage.setItem(ANONYMOUS_MODAL_DISMISSED_KEY, newCount.toString());
      return newCount;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessage("");
    setMessageCount(0);
    localStorage.removeItem(ANONYMOUS_MESSAGES_KEY);
    sessionStorage.removeItem(ANONYMOUS_MESSAGE_COUNT_KEY);
    sessionStorage.removeItem(ANONYMOUS_MODAL_DISMISSED_KEY);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming || !content.trim()) return;

    const userMessage: AnonymousChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: content.trim(),
      status: "complete",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessageCount((prev) => prev + 1);
    setIsStreaming(true);
    setStreamingMessage("");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: content.trim(),
          anonymous: true,
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
                case "content":
                  if (event.text) {
                    accumulatedText += event.text;
                    setStreamingMessage(accumulatedText);
                  }
                  break;
                case "done":
                  const assistantMessage: AnonymousChatMessage = {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: accumulatedText,
                    status: "complete",
                    timestamp: Date.now(),
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
        
        const errorMessage: AnonymousChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: errorContent,
          status: "complete",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setStreamingMessage("");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [isStreaming]);

  return {
    messages,
    streamingMessage,
    sendMessage,
    isStreaming,
    messageCount,
    shouldShowSignupModal,
    dismissSignupModal,
    clearMessages,
  };
}

export function getAnonymousMessages(): AnonymousChatMessage[] {
  try {
    const savedMessages = localStorage.getItem(ANONYMOUS_MESSAGES_KEY);
    if (savedMessages) {
      return JSON.parse(savedMessages);
    }
  } catch (error) {
    console.error("Error loading anonymous messages:", error);
  }
  return [];
}

export function clearAnonymousData(): void {
  localStorage.removeItem(ANONYMOUS_MESSAGES_KEY);
  sessionStorage.removeItem(ANONYMOUS_MESSAGE_COUNT_KEY);
  sessionStorage.removeItem(ANONYMOUS_MODAL_DISMISSED_KEY);
}
