import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStream, type ChatMessage } from "@/hooks/use-chat-stream";
import { useChatMode } from "@/contexts/ChatModeContext";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { QuickActionChips } from "./QuickActionChips";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ChevronDown, ChevronUp, UserPlus, TrendingUp, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { isPromoCaptureMode } from "@/lib/promo-capture";

type ChatOverlayMode = "minimized" | "expanded" | "fullscreen";

interface TransparentChatOverlayProps {
  conversationId?: string;
  className?: string;
  onModeChange?: (mode: ChatOverlayMode) => void;
  bottomOffset?: number;
  isAnonymous?: boolean;
  onNavigateToAuth?: (mode: 'login' | 'register') => void;
}

const QUICK_ACTIONS = [
  { label: "Buy SPY", action: "Buy 10 shares of SPY" },
  { label: "Check portfolio", action: "Show me my portfolio" },
  { label: "What's trending?", action: "What stocks are trending today?" },
  { label: "Analyze AAPL", action: "Analyze AAPL stock for me" },
  { label: "Options help", action: "Explain options trading basics" },
];

function EmbeddedModeToggle() {
  const { mode, setMode, isPlanMode } = useChatMode();
  
  return (
    <div className="flex items-center gap-1.5 sm:gap-2" data-testid="embedded-mode-toggle">
      <button
        onClick={() => setMode("plan")}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all min-h-[44px] sm:min-h-[28px]",
          isPlanMode
            ? "bg-purple-500/30 text-white border border-purple-400/40"
            : "glass-key text-white/60 hover:text-white"
        )}
        data-testid="button-mode-plan-embedded"
        aria-pressed={isPlanMode}
      >
        <Lightbulb className="h-3 w-3" />
        <span>Plan</span>
      </button>
      <button
        onClick={() => setMode("trade")}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all min-h-[44px] sm:min-h-[28px]",
          !isPlanMode
            ? "bg-emerald-500/30 text-white border border-emerald-400/40"
            : "glass-key text-white/60 hover:text-white"
        )}
        data-testid="button-mode-trade-embedded"
        aria-pressed={!isPlanMode}
      >
        <TrendingUp className="h-3 w-3" />
        <span>Trade</span>
      </button>
    </div>
  );
}

export function TransparentChatOverlay({
  conversationId,
  className,
  onModeChange,
  bottomOffset = 83,
  isAnonymous = false,
  onNavigateToAuth,
}: TransparentChatOverlayProps) {
  const { mode: chatMode, isPlanMode, setMode: setChatMode } = useChatMode();
  const [mode, setMode] = useState<ChatOverlayMode>("minimized");
  const [inputValue, setInputValue] = useState("");
  const [lastTradeCommand, setLastTradeCommand] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    streamingMessage,
    sendMessage,
    isStreaming,
    isWaitingForFirstToken,
  } = useChatStream({ conversationId, mode: chatMode });

  const handleModeChange = useCallback((newMode: ChatOverlayMode) => {
    setMode(newMode);
    onModeChange?.(newMode);
  }, [onModeChange]);

  // Promo-capture mode: auto-open the overlay so the seeded demo conversation is
  // visible for the /promo chat slide screenshot.
  useEffect(() => {
    if (isPromoCaptureMode()) {
      handleModeChange("fullscreen");
    }
  }, [handleModeChange]);

  const toggleMode = useCallback(() => {
    const nextMode = mode === "minimized" ? "expanded" : 
                     mode === "expanded" ? "fullscreen" : "minimized";
    handleModeChange(nextMode);
  }, [mode, handleModeChange]);

  // Helper to detect if a message is a trade command
  const isTradeCommand = useCallback((content: string) => {
    const lowerContent = content.toLowerCase();
    return (lowerContent.includes("buy") || lowerContent.includes("sell")) &&
           (lowerContent.includes("share") || /\d+\s*(shares?|of)/.test(lowerContent));
  }, []);

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isStreaming) return;
    
    // Track trade commands in Plan mode for "Initiate Trade?" feature
    if (isPlanMode && isTradeCommand(content)) {
      setLastTradeCommand(content);
    } else if (!isPlanMode) {
      // Clear when switching to Trade mode
      setLastTradeCommand(null);
    }
    
    setInputValue("");
    if (mode === "minimized") {
      handleModeChange("expanded");
    }
    await sendMessage(content);
  }, [inputValue, isStreaming, mode, handleModeChange, sendMessage, isPlanMode, isTradeCommand]);

  // Handler for "Initiate Trade?" button - switches to Trade mode and re-sends the command
  const handleInitiateTrade = useCallback(async () => {
    if (!lastTradeCommand) return;
    
    const commandToSend = lastTradeCommand;
    setLastTradeCommand(null);
    setChatMode("trade");
    
    // Small delay to ensure mode switch is applied
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (mode === "minimized") {
      handleModeChange("expanded");
    }
    await sendMessage(commandToSend);
  }, [lastTradeCommand, setChatMode, mode, handleModeChange, sendMessage]);

  const handleQuickAction = useCallback((action: string, label: string) => {
    if (mode === "minimized") {
      handleModeChange("expanded");
    }
    sendMessage(action);
  }, [mode, handleModeChange, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  useEffect(() => {
    if (mode !== "minimized") {
      inputRef.current?.focus();
    }
  }, [mode]);

  const getHeight = () => {
    switch (mode) {
      case "minimized": return "180px"; // Show full input line with quick actions on mobile
      case "expanded": return "50vh";
      // Subtract the keyboard inset too so the top stays fixed while the bottom
      // rises above the iOS keyboard (otherwise the top is pushed off-screen).
      case "fullscreen": return `calc(100vh - ${bottomOffset + 60}px - var(--keyboard-inset, 0px))`;
    }
  };

  const hasMessages = messages.length > 0 || streamingMessage;

  // Helper to detect plan_advisory responses (contain "Trade Recommendation" text)
  const isPlanAdvisoryMessage = useCallback((content: string) => {
    return content.includes("Trade Recommendation") && content.includes("Plan mode");
  }, []);

  // Check if the last message is a plan_advisory and we have a pending trade command
  const showInitiateTradeButton = useMemo(() => {
    if (!lastTradeCommand || isStreaming) return false;
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.role === "assistant" && isPlanAdvisoryMessage(lastMessage.content);
  }, [messages, lastTradeCommand, isStreaming, isPlanAdvisoryMessage]);

  // Memoize message list to prevent re-renders on each token
  const messageList = useMemo(() => 
    messages.map((msg, index) => {
      const isLastMessage = index === messages.length - 1;
      const showButton = isLastMessage && showInitiateTradeButton;
      
      return (
        <div key={msg.id}>
          <ChatMessageBubble
            role={msg.role}
            content={msg.content}
            status={msg.status === "streaming" ? "sending" : "sent"}
          />
          {showButton && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start mt-2 mb-1"
            >
              <button
                onClick={handleInitiateTrade}
                disabled={isStreaming}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium",
                  "bg-profit/20 text-profit border border-profit/30",
                  "hover:bg-profit/30 hover:border-profit/50 transition-all",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                data-testid="button-initiate-trade"
              >
                <TrendingUp className="w-4 h-4" />
                <span>Initiate Trade?</span>
              </button>
            </motion.div>
          )}
        </div>
      );
    }), [messages, showInitiateTradeButton, handleInitiateTrade, isStreaming]);

  return (
    <motion.div
      className={cn(
        "fixed left-0 right-0 z-20 glass-chat-translucent chat-overlay-transition",
        "rounded-t-3xl overflow-hidden flex flex-col",
        className
      )}
      style={{ bottom: `calc(${bottomOffset}px + var(--keyboard-inset, 0px))` }}
      animate={{ height: getHeight() }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      data-testid="transparent-chat-overlay"
    >
      <div 
        className="flex justify-center cursor-pointer pt-2 pb-1"
        onClick={toggleMode}
        role="button"
        tabIndex={0}
        aria-label={mode === "minimized" ? "Expand chat" : "Collapse chat"}
        data-testid="chat-drag-handle"
      >
        <div className="w-10 h-1 rounded-full bg-white/30 hover:bg-white/50 transition-colors" />
      </div>

      <AnimatePresence>
        {mode !== "minimized" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto px-4 hide-scrollbar"
          >
            <div className="flex flex-col gap-3 py-2">
              {messageList}
              
              {streamingMessage && (
                <ChatMessageBubble
                  role="assistant"
                  content={streamingMessage}
                  status="sending"
                />
              )}
              
              {isWaitingForFirstToken && (
                <TypingIndicator variant="glass" />
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 sm:px-4 pb-2 sm:pb-3 pt-2 border-t border-white/5 safe-area-bottom keyboard-aware">
        {mode === "minimized" && !hasMessages && (
          <QuickActionChips
            actions={QUICK_ACTIONS}
            onSelect={handleQuickAction}
            className="mb-2"
          />
        )}
        
        <div className="flex items-end gap-2 sm:gap-3">
          <div className="flex-1 glass-input rounded-2xl p-2.5 sm:p-3 flex flex-col gap-1.5 sm:gap-2">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about trading, stocks, or your portfolio..."
              className="flex-1 bg-transparent border-0 resize-none max-h-[100px] text-[16px] text-white placeholder:text-white/50 focus-visible:ring-0 p-0 mobile-input-no-zoom min-h-[24px]"
              rows={1}
              disabled={isStreaming}
              data-testid="chat-input"
            />
            
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {mode !== "minimized" && (
                  <button
                    onClick={() => handleModeChange(mode === "fullscreen" ? "expanded" : "fullscreen")}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium glass-key text-white/70 hover:text-white transition-all min-h-[44px] sm:min-h-[28px]"
                    data-testid="button-toggle-fullscreen"
                  >
                    {mode === "fullscreen" ? (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        <span>Collapse</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        <span>Fullscreen</span>
                      </>
                    )}
                  </button>
                )}
                
                {isAnonymous && onNavigateToAuth && messages.length >= 2 && (
                  <button
                    onClick={() => onNavigateToAuth('register')}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium glass-key text-profit hover:bg-profit/20 transition-all min-h-[44px] sm:min-h-[28px]"
                    data-testid="button-signup-prompt"
                  >
                    <UserPlus className="h-3 w-3" />
                    <span>Sign up</span>
                  </button>
                )}
              </div>
              
              <EmbeddedModeToggle />
            </div>
          </div>
          
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className={cn(
              "h-11 w-11 sm:h-9 sm:w-9 rounded-full transition-all glass-key flex-shrink-0",
              inputValue.trim() 
                ? "bg-white/20 hover:bg-white/30 text-white border-white/20" 
                : "bg-white/10 text-white/50 border-white/10"
            )}
            data-testid="button-send-message"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
