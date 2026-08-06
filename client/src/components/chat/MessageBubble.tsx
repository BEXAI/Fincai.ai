import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { User, Bot, Lightbulb, Zap, Eye, CheckCircle } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

function formatReActContent(content: string) {
  const patterns = [
    { prefix: "**THINK:**", icon: Lightbulb, color: "text-yellow-500", bg: "bg-yellow-500/10" },
    { prefix: "**ACTION:**", icon: Zap, color: "text-blue-500", bg: "bg-blue-500/10" },
    { prefix: "**OBSERVE:**", icon: Eye, color: "text-green-500", bg: "bg-green-500/10" },
    { prefix: "**CONCLUDE:**", icon: CheckCircle, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const segments: Array<{ type: 'text' | 'react'; content: string; pattern?: typeof patterns[0] }> = [];
  let remaining = content;
  
  while (remaining.length > 0) {
    let earliestIndex = remaining.length;
    let matchedPattern: typeof patterns[0] | null = null;
    
    for (const pattern of patterns) {
      const index = remaining.indexOf(pattern.prefix);
      if (index !== -1 && index < earliestIndex) {
        earliestIndex = index;
        matchedPattern = pattern;
      }
    }
    
    if (matchedPattern && earliestIndex < remaining.length) {
      if (earliestIndex > 0) {
        segments.push({ type: 'text', content: remaining.slice(0, earliestIndex) });
      }
      
      const afterPrefix = remaining.slice(earliestIndex + matchedPattern.prefix.length);
      let endIndex = afterPrefix.length;
      
      for (const pattern of patterns) {
        const nextIndex = afterPrefix.indexOf(pattern.prefix);
        if (nextIndex !== -1 && nextIndex < endIndex) {
          endIndex = nextIndex;
        }
      }
      
      segments.push({ 
        type: 'react', 
        content: afterPrefix.slice(0, endIndex).trim(),
        pattern: matchedPattern 
      });
      
      remaining = afterPrefix.slice(endIndex);
    } else {
      if (remaining.length > 0) {
        segments.push({ type: 'text', content: remaining });
      }
      break;
    }
  }
  
  return segments;
}

const messageVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { 
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1]
    }
  }
};

export const MessageBubble = memo(function MessageBubble({ role, content, isStreaming = false }: MessageBubbleProps) {
  const isUser = role === "user";
  
  const formattedContent = useMemo(() => {
    if (isUser) return null;
    return formatReActContent(content);
  }, [content, isUser]);

  const hasReActFormatting = formattedContent?.some(s => s.type === 'react');

  return (
    <motion.div
      data-testid={`message-bubble-${role}`}
      className={cn(
        "flex gap-2 sm:gap-3 mobile-chat-max-width",
        isUser ? "ml-auto flex-row-reverse" : "mr-auto"
      )}
      variants={messageVariants}
      initial="hidden"
      animate="visible"
      layout
    >
      <div
        className={cn(
          "flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-md flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="w-3 h-3 sm:w-4 sm:h-4" /> : <Bot className="w-3 h-3 sm:w-4 sm:h-4" />}
      </div>
      <div
        className={cn(
          "rounded-md mobile-chat-message mobile-text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        ) : hasReActFormatting ? (
          <div className="space-y-2">
            {formattedContent?.map((segment, i) => {
              if (segment.type === 'text') {
                return (
                  <div key={i} className="whitespace-pre-wrap break-words">
                    {segment.content}
                  </div>
                );
              }
              const Icon = segment.pattern!.icon;
              return (
                <div key={i} className={cn("rounded-md p-2 text-xs", segment.pattern!.bg)}>
                  <div className={cn("flex items-center gap-1.5 font-semibold mb-1", segment.pattern!.color)}>
                    <Icon className="w-3 h-3" />
                    {segment.pattern!.prefix.replace(/\*\*/g, '').replace(':', '')}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-foreground/80">
                    {segment.content}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        )}
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse rounded-sm" />
        )}
      </div>
    </motion.div>
  );
});
