import { useEffect, useState, useCallback, useRef } from "react";
import type { MarketQuote } from "@shared/schema";

function getWebSocketUrl(): string {
  const wsUrlFromEnv = import.meta.env.VITE_WS_URL;
  
  if (wsUrlFromEnv) {
    return wsUrlFromEnv;
  }
  
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/market`;
}

interface UseMarketWebSocketOptions {
  onQuote?: (quote: MarketQuote) => void;
  reconnectInterval?: number;
}

export function useMarketWebSocket(options: UseMarketWebSocketOptions = {}) {
  const { onQuote, reconnectInterval = 3000 } = options;
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWebSocketUrl();
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "quote" && message.data) {
          setQuote(message.data);
          onQuote?.(message.data);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      
      // Attempt to reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectInterval);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [onQuote, reconnectInterval]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { quote, isConnected };
}
