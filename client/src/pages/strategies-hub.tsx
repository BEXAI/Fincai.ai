import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StrategyStatusBadge } from "@/components/strategy-status-badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  Play,
  Pause,
  Square,
  Eye,
  Target,
  Link2,
  PlusCircle,
  Activity,
} from "lucide-react";
import type { Strategy, StrategyStatus } from "@shared/schema";

function getStrategyTypeLabel(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

import { useSeo } from "@/components/seo";

export default function StrategiesHub() {
  useSeo({ path: "/strategies" });
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StrategyStatus }) => {
      const res = await apiRequest("PATCH", `/api/strategies/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", variables.id, "pnl"] });
      toast({ title: "Strategy updated", description: `Status changed to ${variables.status}.` });
    },
    onError: (error: any) => {
      toast({
        title: "Could not update strategy",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const setStatus = (id: string, status: StrategyStatus) =>
    statusMutation.mutate({ id, status });

  const renderControls = (strategy: Strategy) => {
    const status = strategy.status as StrategyStatus;
    const pending = statusMutation.isPending;
    if (status === "closed") {
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setStatus(strategy.id, "draft")}
          data-testid={`button-reopen-${strategy.id}`}
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          Reopen
        </Button>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {(status === "draft" || status === "paused") && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setStatus(strategy.id, "active")}
            data-testid={`button-activate-${strategy.id}`}
          >
            <Play className="h-4 w-4 mr-2" />
            Activate
          </Button>
        )}
        {status === "active" && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setStatus(strategy.id, "paused")}
            data-testid={`button-pause-${strategy.id}`}
          >
            <Pause className="h-4 w-4 mr-2" />
            Pause
          </Button>
        )}
        {(status === "active" || status === "paused") && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setStatus(strategy.id, "closed")}
            data-testid={`button-close-${strategy.id}`}
          >
            <Square className="h-4 w-4 mr-2" />
            Close
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="page-strategies-hub">
      <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Strategy Command Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your strategies through their lifecycle and track live P&amp;L.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/strategy-performance")}
            data-testid="button-runner-performance"
          >
            <Activity className="h-4 w-4 mr-2" />
            Runner Performance
          </Button>
          <Button onClick={() => navigate("/builder")} data-testid="button-new-strategy">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Strategy
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-md" />
          ))}
        </div>
      ) : !strategies || strategies.length === 0 ? (
        <Card data-testid="empty-strategies">
          <CardContent className="flex flex-col items-center justify-center text-center py-16 space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-medium">No strategies yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Build a strategy first, then activate it here to track it as a live position.
              </p>
            </div>
            <Button onClick={() => navigate("/builder")} data-testid="button-empty-new-strategy">
              <PlusCircle className="h-4 w-4 mr-2" />
              Build a Strategy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {strategies.map((strategy) => (
            <Card
              key={strategy.id}
              className="flex flex-col"
              data-testid={`card-strategy-${strategy.id}`}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base font-medium">{strategy.name}</CardTitle>
                <StrategyStatusBadge status={strategy.status} />
              </CardHeader>
              <CardContent className="space-y-2 flex-1">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{strategy.underlyingSymbol}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    {getStrategyTypeLabel(strategy.strategyType)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  {strategy.linkedPositions && strategy.linkedPositions.length > 0 ? (
                    <span data-testid={`text-linked-${strategy.id}`}>
                      Linked: {strategy.linkedPositions.join(", ")}
                    </span>
                  ) : (
                    <span data-testid={`text-linked-${strategy.id}`}>No linked positions</span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-row items-center justify-between gap-2 flex-wrap">
                {renderControls(strategy)}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/strategies/${strategy.id}`)}
                  data-testid={`button-view-strategy-${strategy.id}`}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
