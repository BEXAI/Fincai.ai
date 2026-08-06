import { useState, useCallback, KeyboardEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatModeToggle } from "./ChatModeToggle";
import { Send, TrendingUp, Wallet, BarChart3, HelpCircle, Loader2 } from "lucide-react";

interface ChatComposerProps {
  onSend: (message: string) => void | Promise<void>;
  isDisabled?: boolean;
}

const quickActions = [
  { icon: TrendingUp, label: "Analyze SPY", message: "What's the current market outlook for SPY?" },
  { icon: Wallet, label: "Portfolio", message: "Show my current portfolio and positions" },
  { icon: BarChart3, label: "Market", message: "Give me a quick market summary" },
  { icon: HelpCircle, label: "Help", message: "What can you help me with?" },
];

export function ChatComposer({ onSend, isDisabled = false }: ChatComposerProps) {
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ref for sync re-entry guard (state updates are async)
  const lockRef = useRef(false);

  // Combine parent's disabled state with local pending state
  const isBusy = isDisabled || isPending;

  const handleSend = useCallback(async () => {
    // Sync ref check prevents rapid re-entry before state updates
    if (!message.trim() || isBusy || lockRef.current) return;
    
    // Set both sync lock and state immediately
    lockRef.current = true;
    setIsPending(true);
    
    const trimmedMessage = message.trim();
    setMessage("");
    
    try {
      // Await the onSend if it returns a Promise
      await Promise.resolve(onSend(trimmedMessage));
    } finally {
      // Reset both lock and state when done
      lockRef.current = false;
      setIsPending(false);
    }
    
    // Keep focus on textarea for continuous typing
    textareaRef.current?.focus();
  }, [message, onSend, isBusy]);

  const handleQuickAction = useCallback(async (actionMessage: string) => {
    // Sync ref check prevents rapid re-entry
    if (isBusy || lockRef.current) return;
    
    lockRef.current = true;
    setIsPending(true);
    
    try {
      await Promise.resolve(onSend(actionMessage));
    } finally {
      lockRef.current = false;
      setIsPending(false);
    }
  }, [onSend, isBusy]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div
      data-testid="chat-composer"
      className="border-t border-border mobile-compact-p bg-background/80 backdrop-blur-sm safe-area-bottom keyboard-aware"
    >
      <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-3 flex-wrap">
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction(action.message)}
            disabled={isBusy}
            className="mobile-text-xs gap-1 sm:gap-1.5 mobile-btn-sm"
            data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <action.icon className="w-3 h-3" />
            {action.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-1.5 sm:gap-2 items-end">
        <Textarea
          ref={textareaRef}
          data-testid="input-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about stocks, trading strategies, or manage your portfolio..."
          disabled={isBusy}
          className="resize-none min-h-[44px] max-h-[200px] mobile-text-sm mobile-input-no-zoom"
          rows={1}
        />
        <div className="flex flex-col items-center gap-1 sm:gap-1.5">
          <ChatModeToggle size="sm" />
          <Button
            data-testid="button-send"
            size="icon"
            onClick={handleSend}
            disabled={isBusy || !message.trim()}
            className="motion-safe:transition-transform active:scale-95 mobile-btn-icon-sm"
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 motion-safe:animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2 text-center">
        Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
