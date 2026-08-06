import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Eye, Trash2 } from "lucide-react";
import type { Strategy } from "@shared/schema";

interface StrategyCardProps {
  strategy: Strategy;
  onView?: () => void;
  onDelete?: () => void;
}

export function StrategyCard({ strategy, onView, onDelete }: StrategyCardProps) {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "conservative":
        return "bg-chart-2 text-white";
      case "moderate":
        return "bg-chart-3 text-white";
      case "aggressive":
        return "bg-chart-5 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStrategyTypeLabel = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Card className="hover-elevate" data-testid={`card-strategy-${strategy.id}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{strategy.name}</CardTitle>
        <Badge className={getRiskColor(strategy.riskProfile)}>
          {strategy.riskProfile}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono font-medium">{strategy.underlyingSymbol}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">
            {getStrategyTypeLabel(strategy.strategyType)}
          </span>
        </div>
        {strategy.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {strategy.description}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onView}
          data-testid={`button-view-strategy-${strategy.id}`}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            data-testid={`button-delete-strategy-${strategy.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
