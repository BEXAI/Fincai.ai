import { memo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatMode, type ChatMode } from "@/contexts/ChatModeContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatModeToggleProps {
  className?: string;
  size?: "sm" | "default";
}

export const ChatModeToggle = memo(function ChatModeToggle({ 
  className,
  size = "default",
}: ChatModeToggleProps) {
  const { mode, setMode } = useChatMode();

  const isSmall = size === "sm";
  const buttonHeight = isSmall ? "min-h-[44px] sm:min-h-[28px]" : "min-h-[48px] sm:min-h-[36px]";
  const buttonPadding = isSmall ? "px-2.5 py-2 sm:py-1" : "px-3 py-2.5 sm:py-1.5";
  const iconSize = isSmall ? "w-3.5 h-3.5" : "w-4 h-4";
  const textSize = isSmall ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm";

  return (
    <div 
      className={cn(
        "relative inline-flex rounded-full p-0.5 glass-key",
        className
      )}
      role="radiogroup"
      aria-label="Chat mode"
      data-testid="chat-mode-toggle"
    >
      <ModeButton
        mode="trade"
        currentMode={mode}
        onClick={() => setMode("trade")}
        icon={TrendingUp}
        label="Trade"
        tooltip="Turn buy/sell requests into actionable trade plans (place live orders in the Agent terminal)"
        buttonHeight={buttonHeight}
        buttonPadding={buttonPadding}
        iconSize={iconSize}
        textSize={textSize}
      />
      <ModeButton
        mode="plan"
        currentMode={mode}
        onClick={() => setMode("plan")}
        icon={Lightbulb}
        label="Plan"
        tooltip="Get recommendations without executing trades"
        buttonHeight={buttonHeight}
        buttonPadding={buttonPadding}
        iconSize={iconSize}
        textSize={textSize}
      />
    </div>
  );
});

interface ModeButtonProps {
  mode: ChatMode;
  currentMode: ChatMode;
  onClick: () => void;
  icon: typeof TrendingUp;
  label: string;
  tooltip: string;
  buttonHeight: string;
  buttonPadding: string;
  iconSize: string;
  textSize: string;
}

function ModeButton({ 
  mode, 
  currentMode, 
  onClick, 
  icon: Icon, 
  label, 
  tooltip,
  buttonHeight,
  buttonPadding,
  iconSize,
  textSize,
}: ModeButtonProps) {
  const isActive = mode === currentMode;
  const isTradeMode = mode === "trade";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          role="radio"
          aria-checked={isActive}
          onClick={onClick}
          className={cn(
            "relative flex items-center gap-1.5 rounded-full transition-colors z-10",
            buttonHeight,
            buttonPadding,
            isActive 
              ? "text-white" 
              : "text-white/60 hover:text-white"
          )}
          data-testid={`button-mode-${mode}`}
        >
          {isActive && (
            <motion.div
              layoutId="chat-mode-indicator"
              className={cn(
                "absolute inset-0 rounded-full",
                isTradeMode 
                  ? "bg-emerald-500/30 border border-emerald-400/40" 
                  : "bg-purple-500/30 border border-purple-400/40"
              )}
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          <Icon className={cn(iconSize, "relative z-10", isActive && (isTradeMode ? "text-emerald-300" : "text-purple-300"))} />
          <span className={cn(textSize, "font-medium relative z-10")}>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export const ChatModeBadge = memo(function ChatModeBadge({ className }: { className?: string }) {
  const { mode, isPlanMode } = useChatMode();
  
  if (!isPlanMode) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium glass-key",
        "bg-purple-500/25 text-white border-purple-400/30",
        className
      )}
      data-testid="chat-mode-badge"
    >
      <Lightbulb className="w-3 h-3 text-purple-300" />
      <span>Plan Mode</span>
    </div>
  );
});
