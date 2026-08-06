import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  action: string;
}

interface QuickActionChipsProps {
  actions?: QuickAction[];
  onSelect: (action: string, label: string) => void;
  className?: string;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "Buy SPY", action: "Buy 10 shares of SPY" },
  { label: "Check portfolio", action: "Show me my portfolio" },
  { label: "What's trending?", action: "What stocks are trending today?" },
  { label: "Analyze AAPL", action: "Analyze AAPL stock for me" },
  { label: "Options help", action: "Explain options trading basics" },
];

export function QuickActionChips({
  actions = DEFAULT_ACTIONS,
  onSelect,
  className,
}: QuickActionChipsProps) {
  return (
    <div
      className={cn("quick-chips-scroll flex gap-1.5 sm:gap-2 py-1.5 sm:py-2 overflow-x-auto hide-scrollbar", className)}
      data-testid="quick-action-chips"
      role="group"
      aria-label="Quick actions"
    >
      {actions.map((action, index) => (
        <button
          key={action.action}
          onClick={() => onSelect(action.action, action.label)}
          className={cn(
            "whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium",
            "glass-key text-white",
            "hover:scale-[1.02] active:scale-[0.98]",
            "transition-all duration-200",
            "min-h-[44px] sm:min-h-[36px]",
            index < 2 && "bg-purple-500/20 border-purple-400/20",
            index >= 2 && index < 4 && "bg-white/10 border-white/15",
            index >= 4 && "bg-orange-500/20 border-orange-400/20"
          )}
          data-testid={`chip-${action.action}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
