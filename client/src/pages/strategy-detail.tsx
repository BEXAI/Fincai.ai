import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { StrategyStatusBadge } from "@/components/strategy-status-badge";
import { PayoffDiagram } from "@/components/payoff-diagram";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Target,
  ShieldAlert,
  Save,
} from "lucide-react";
import type { Strategy, OptionsLeg, StrategyStatus } from "@shared/schema";

interface StrategyDetailResponse {
  strategy: Strategy;
  legs: OptionsLeg[];
}

interface PortfolioHolding {
  symbol: string;
  name: string;
  quantity: number;
  marketValue: number;
  costBasis: number;
  gain: number;
  gainPct: number;
}

interface Portfolio {
  source: "robinhood" | "demo";
  holdings: PortfolioHolding[];
}

interface StrategyPnl {
  strategyId: string;
  status: string;
  source: "robinhood" | "demo";
  linkedSymbols: string[];
  currentValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  profitTargetPercent: number | null;
  stopLossPercent: number | null;
  progressToTarget: number | null;
  progressToStop: number | null;
  positions: PortfolioHolding[];
}

interface PayoffResponse {
  currentPrice: number;
  payoffDiagram: { underlyingPrice: number; profitLoss: number }[];
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
}

const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function StrategyDetail() {
  const [, params] = useRoute("/strategies/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id ?? "";

  const { data, isLoading } = useQuery<StrategyDetailResponse>({
    queryKey: ["/api/strategies", id],
    enabled: !!id,
  });

  const { data: pnl } = useQuery<StrategyPnl>({
    queryKey: ["/api/strategies", id, "pnl"],
    enabled: !!id,
    refetchInterval: 60000,
  });

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["/api/agent/portfolio"],
  });

  const strategy = data?.strategy;
  const legs = data?.legs ?? [];

  // Local selection state for linking holdings, seeded from the saved strategy.
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (strategy?.linkedPositions) {
      setSelected(strategy.linkedPositions);
    }
  }, [strategy?.linkedPositions]);

  const { data: payoff } = useQuery<PayoffResponse>({
    queryKey: ["/api/strategies/analyze", id, legs.length],
    enabled: !!strategy && legs.length > 0,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/strategies/analyze", {
        underlyingSymbol: strategy!.underlyingSymbol,
        legs: legs.map((l) => ({
          optionType: l.optionType,
          action: l.action,
          strike: l.strike,
          quantity: l.quantity,
          premium: l.premium,
          expirationDate: l.expirationDate,
        })),
      });
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: StrategyStatus) => {
      const res = await apiRequest("PATCH", `/api/strategies/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_d, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", id, "pnl"] });
      toast({ title: "Strategy updated", description: `Status changed to ${status}.` });
    },
    onError: (error: any) =>
      toast({
        title: "Could not update strategy",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const positionsMutation = useMutation({
    mutationFn: async (linkedPositions: string[]) => {
      const res = await apiRequest("PATCH", `/api/strategies/${id}/positions`, {
        linkedPositions,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", id, "pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({ title: "Linked positions saved" });
    },
    onError: (error: any) =>
      toast({
        title: "Could not save positions",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const toggleSymbol = (symbol: string) => {
    setSelected((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4" data-testid="page-strategy-detail-loading">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16 space-y-4" data-testid="strategy-not-found">
        <p className="text-muted-foreground">This strategy could not be found.</p>
        <Button variant="outline" onClick={() => navigate("/strategies")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Strategies
        </Button>
      </div>
    );
  }

  const status = strategy.status as StrategyStatus;
  const pnlValue = pnl?.unrealizedPnl ?? 0;
  const pnlPositive = pnlValue >= 0;
  const hasLinked = (pnl?.linkedSymbols.length ?? 0) > 0;
  const dirty =
    selected.slice().sort().join(",") !==
    (strategy.linkedPositions ?? []).slice().sort().join(",");

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="page-strategy-detail">
      <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/strategies")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Strategies
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {(status === "draft" || status === "paused") && (
            <Button
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("active")}
              data-testid="button-activate"
            >
              <Play className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {status === "active" && (
            <Button
              variant="outline"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("paused")}
              data-testid="button-pause"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {(status === "active" || status === "paused") && (
            <Button
              variant="ghost"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("closed")}
              data-testid="button-close"
            >
              <Square className="h-4 w-4 mr-2" />
              Close
            </Button>
          )}
          {status === "closed" && (
            <Button
              variant="outline"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("draft")}
              data-testid="button-reopen"
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-row items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold" data-testid="text-strategy-name">
          {strategy.name}
        </h1>
        <StrategyStatusBadge status={strategy.status} />
        <span className="font-mono text-muted-foreground" data-testid="text-symbol">
          {strategy.underlyingSymbol}
        </span>
      </div>
      {strategy.description && (
        <p className="text-sm text-muted-foreground" data-testid="text-description">
          {strategy.description}
        </p>
      )}

      {/* Live P&L summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card data-testid="card-current-value">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-semibold" data-testid="text-current-value">
              {money(pnl?.currentValue ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cost basis {money(pnl?.costBasis ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="card-unrealized-pnl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unrealized P&amp;L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-mono font-semibold",
                pnlPositive ? "text-profit" : "text-loss"
              )}
              data-testid="text-unrealized-pnl"
            >
              {pnlPositive ? "+" : ""}
              {money(pnlValue)}
            </p>
            <p
              className={cn("text-xs mt-1", pnlPositive ? "text-profit" : "text-loss")}
              data-testid="text-unrealized-pnl-percent"
            >
              {pnlPositive ? "+" : ""}
              {(pnl?.unrealizedPnlPercent ?? 0).toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card data-testid="card-data-source">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Data Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold capitalize" data-testid="text-data-source">
              {pnl?.source ?? portfolio?.source ?? "demo"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pnl?.source === "robinhood" ? "Live holdings" : "Demo holdings"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Threshold gauges */}
      <Card data-testid="card-thresholds">
        <CardHeader>
          <CardTitle className="text-lg">Targets &amp; Risk Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasLinked && (
            <p className="text-sm text-muted-foreground" data-testid="text-no-linked-warning">
              Link one or more holdings below to track live progress toward your targets.
            </p>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4 text-chart-2" />
                Profit Target
              </span>
              <span className="text-muted-foreground" data-testid="text-target-threshold">
                {strategy.profitTargetPercent
                  ? `+${strategy.profitTargetPercent}%`
                  : "Not set"}
              </span>
            </div>
            <Progress
              value={pnl?.progressToTarget ?? 0}
              className="h-2"
              data-testid="progress-target"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                Stop Loss
              </span>
              <span className="text-muted-foreground" data-testid="text-stop-threshold">
                {strategy.stopLossPercent ? `-${strategy.stopLossPercent}%` : "Not set"}
              </span>
            </div>
            <Progress
              value={pnl?.progressToStop ?? 0}
              className="h-2"
              data-testid="progress-stop"
            />
          </div>
        </CardContent>
      </Card>

      {/* Linked positions */}
      <Card data-testid="card-linked-positions">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
          <CardTitle className="text-lg">Linked Holdings</CardTitle>
          <Button
            size="sm"
            disabled={!dirty || positionsMutation.isPending}
            onClick={() => positionsMutation.mutate(selected)}
            data-testid="button-save-positions"
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!portfolio || portfolio.holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No holdings available to link.</p>
          ) : (
            portfolio.holdings.map((h) => (
              <label
                key={h.symbol}
                className="flex items-center justify-between gap-3 p-3 rounded-md hover-elevate cursor-pointer"
                data-testid={`row-holding-${h.symbol}`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selected.includes(h.symbol)}
                    onCheckedChange={() => toggleSymbol(h.symbol)}
                    data-testid={`checkbox-holding-${h.symbol}`}
                  />
                  <div>
                    <p className="font-mono font-medium text-sm">{h.symbol}</p>
                    <p className="text-xs text-muted-foreground">{h.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{money(h.marketValue)}</p>
                  <p
                    className={cn(
                      "text-xs font-mono",
                      h.gain >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    {h.gain >= 0 ? "+" : ""}
                    {h.gainPct.toFixed(2)}%
                  </p>
                </div>
              </label>
            ))
          )}
        </CardContent>
      </Card>

      {/* Payoff diagram (reused) */}
      {payoff && payoff.payoffDiagram.length > 0 && (
        <PayoffDiagram
          data={payoff.payoffDiagram}
          currentPrice={payoff.currentPrice}
          breakeven={payoff.breakeven}
          maxProfit={payoff.maxProfit}
          maxLoss={payoff.maxLoss}
          stopLossPercent={strategy.stopLossPercent ?? undefined}
          profitTargetPercent={strategy.profitTargetPercent ?? undefined}
        />
      )}
    </div>
  );
}
