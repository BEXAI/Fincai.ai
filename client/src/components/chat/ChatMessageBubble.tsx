import { memo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ChatMessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  status?: "sending" | "sent" | "error";
  className?: string;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  role,
  content,
  timestamp,
  status = "sent",
  className,
}: ChatMessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      <div
        className={cn(
          "px-4 py-3 rounded-[18px] max-w-[85%]",
          isUser
            ? "glass-message-user rounded-br-[4px]"
            : "glass-message-assistant rounded-bl-[4px]",
          "text-white",
          status === "sending" && "opacity-80",
          status === "error" && "border-loss"
        )}
        data-testid={`message-bubble-${role}`}
      >
        <div className="text-[15px] leading-[1.45] whitespace-pre-wrap break-words text-white">
          {content}
        </div>
        
        {timestamp && (
          <div className="text-xs text-white/50 mt-1.5 flex items-center gap-1">
            {format(timestamp, "h:mm a")}
            {status === "sending" && (
              <span className="animate-pulse text-white/40">Sending...</span>
            )}
            {status === "error" && (
              <span className="text-loss">Failed</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
