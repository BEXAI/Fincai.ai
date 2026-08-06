import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  isVisible?: boolean;
  className?: string;
  variant?: "default" | "glass";
}

export function TypingIndicator({ 
  isVisible = true, 
  className,
  variant = "default"
}: TypingIndicatorProps) {
  if (!isVisible) return null;

  const isGlass = variant === "glass";

  return (
    <div className={cn("flex justify-start", className)}>
      <div
        className={cn(
          "px-4 py-3 rounded-[18px] rounded-bl-[4px] flex gap-1.5",
          isGlass ? "glass-message-assistant" : "bg-muted"
        )}
        data-testid="typing-indicator"
        role="status"
        aria-label="Assistant is typing"
      >
        <div className={cn(
          "w-2 h-2 rounded-full typing-dot",
          isGlass ? "bg-white/60" : "bg-muted-foreground"
        )} />
        <div className={cn(
          "w-2 h-2 rounded-full typing-dot",
          isGlass ? "bg-white/60" : "bg-muted-foreground"
        )} />
        <div className={cn(
          "w-2 h-2 rounded-full typing-dot",
          isGlass ? "bg-white/60" : "bg-muted-foreground"
        )} />
      </div>
    </div>
  );
}
