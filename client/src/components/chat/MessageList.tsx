import { useEffect, useRef, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Bot, TrendingUp, Wallet, BarChart3 } from "lucide-react";
import type { ChatMessage } from "@/hooks/use-chat-stream";

interface MessageListProps {
  messages: ChatMessage[];
  streamingMessage?: string;
  isLoading?: boolean;
}

export const MessageList = memo(function MessageList({ 
  messages, 
  streamingMessage, 
  isLoading,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const isEmpty = messages.length === 0 && !streamingMessage;

  return (
    <div
      data-testid="message-list"
      ref={containerRef}
      className="flex-1 overflow-y-auto mobile-compact-p space-y-3 sm:space-y-4"
    >
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
            <Bot className="mobile-icon-lg text-primary" />
          </div>
          <h2 className="mobile-heading-lg mb-1 sm:mb-2 text-foreground">AI Trading Assistant</h2>
          <p className="mobile-text-sm text-center max-w-md mb-4 sm:mb-6">
            I can help you analyze stocks, manage your portfolio, and make informed trading decisions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 mobile-compact-gap max-w-lg">
            <div className="flex items-center gap-1.5 sm:gap-2 mobile-card-p rounded-lg bg-muted/50 mobile-text-sm">
              <TrendingUp className="mobile-icon-sm text-primary" />
              <span>Analyze stocks</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 mobile-card-p rounded-lg bg-muted/50 mobile-text-sm">
              <Wallet className="mobile-icon-sm text-primary" />
              <span>Manage portfolio</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 mobile-card-p rounded-lg bg-muted/50 mobile-text-sm">
              <BarChart3 className="mobile-icon-sm text-primary" />
              <span>Market insights</span>
            </div>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
            />
          ))}
          {streamingMessage && (
            <MessageBubble
              key="streaming"
              role="assistant"
              content={streamingMessage}
              isStreaming={true}
            />
          )}
          {isLoading && !streamingMessage && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <TypingIndicator />
            </motion.div>
          )}
          <div ref={bottomRef} />
        </AnimatePresence>
      )}
    </div>
  );
});
