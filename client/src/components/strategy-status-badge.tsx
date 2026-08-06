import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StrategyStatus } from "@shared/schema";

const STATUS_STYLES: Record<StrategyStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  active: { label: "Active", className: "bg-profit text-white" },
  paused: { label: "Paused", className: "bg-chart-3 text-white" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

export function StrategyStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const style = STATUS_STYLES[status as StrategyStatus] ?? STATUS_STYLES.draft;
  return (
    <Badge
      className={cn(style.className, className)}
      data-testid={`badge-status-${status}`}
    >
      {style.label}
    </Badge>
  );
}
