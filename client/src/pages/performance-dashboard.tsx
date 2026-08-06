import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Trophy, AlertTriangle, RefreshCw } from "lucide-react";
import type { Trade } from "@shared/schema";

function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-5 w-28 mb-2" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  );
}

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
      <ChartSkeleton />
      <TableSkeleton />
    </div>
  );
}

interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  averageWin: number;
  averageLoss: number;
  totalPL: number;
  totalPLPercent: number;
}

interface StrategyPerformance {
  strategyId: string | null;
  strategyName: string;
  trades: number;
  winRate: number;
  totalPL: number;
}

interface EquityPoint {
  date: string;
  cumulativePL: number;
}

export default function PerformanceDashboard() {
  const { data: trades = [], isLoading, isError, error, refetch } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const closedTrades = trades.filter(
    (trade) => trade.profitLoss !== null && trade.profitLoss !== undefined
  );

  const metrics: PerformanceMetrics = {
    totalTrades: closedTrades.length,
    winningTrades: closedTrades.filter((t) => (t.profitLoss || 0) > 0).length,
    losingTrades: closedTrades.filter((t) => (t.profitLoss || 0) < 0).length,
    winRate: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    averageWin: 0,
    averageLoss: 0,
    totalPL: 0,
    totalPLPercent: 0,
  };

  if (closedTrades.length > 0) {
    const wins = closedTrades.filter((t) => (t.profitLoss || 0) > 0);
    const losses = closedTrades.filter((t) => (t.profitLoss || 0) < 0);

    metrics.winRate = (wins.length / closedTrades.length) * 100;
    
    const grossProfit = wins.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.profitLoss || 0), 0));
    
    metrics.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    metrics.averageWin = wins.length > 0 ? grossProfit / wins.length : 0;
    metrics.averageLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    metrics.totalPL = closedTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);

    const totalInvested = closedTrades.reduce(
      (sum, t) => sum + t.entryPrice * t.quantity,
      0
    );
    metrics.totalPLPercent = totalInvested > 0 ? (metrics.totalPL / totalInvested) * 100 : 0;

    let peak = 0;
    let cumulative = 0;
    let maxDD = 0;
    
    const sortedTrades = [...closedTrades].sort(
      (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
    );

    sortedTrades.forEach((trade) => {
      cumulative += trade.profitLoss || 0;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = peak - cumulative;
      if (drawdown > maxDD) {
        maxDD = drawdown;
      }
    });

    metrics.maxDrawdown = peak > 0 ? (maxDD / peak) * 100 : 0;
  }

  const equityCurve: EquityPoint[] = [];
  let cumulative = 0;
  
  const sortedTrades = [...closedTrades].sort(
    (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
  );

  sortedTrades.forEach((trade) => {
    cumulative += trade.profitLoss || 0;
    equityCurve.push({
      date: new Date(trade.entryDate).toLocaleDateString(),
      cumulativePL: cumulative,
    });
  });

  const strategyPerformance: Map<string | null, StrategyPerformance> = new Map();
  
  closedTrades.forEach((trade) => {
    const key = trade.strategyId || null;
    const existing = strategyPerformance.get(key);
    
    if (existing) {
      existing.trades++;
      existing.totalPL += trade.profitLoss || 0;
      if ((trade.profitLoss || 0) > 0) {
        existing.winRate = ((existing.winRate * (existing.trades - 1)) + 100) / existing.trades;
      } else {
        existing.winRate = (existing.winRate * (existing.trades - 1)) / existing.trades;
      }
    } else {
      strategyPerformance.set(key, {
        strategyId: key,
        strategyName: key || "No Strategy",
        trades: 1,
        winRate: (trade.profitLoss || 0) > 0 ? 100 : 0,
        totalPL: trade.profitLoss || 0,
      });
    }
  });

  const strategyBreakdown = Array.from(strategyPerformance.values());

  const TARGET_WIN_RATE_MIN = 60;
  const TARGET_WIN_RATE_MAX = 80;
  const TARGET_PROFIT_FACTOR = 1.5;
  const TARGET_MAX_DRAWDOWN_MIN = 10;
  const TARGET_MAX_DRAWDOWN_MAX = 20;

  const isWinRateMet = metrics.winRate >= TARGET_WIN_RATE_MIN && metrics.winRate <= TARGET_WIN_RATE_MAX;
  const isProfitFactorMet = metrics.profitFactor >= TARGET_PROFIT_FACTOR;
  const isDrawdownMet = metrics.maxDrawdown >= TARGET_MAX_DRAWDOWN_MIN && metrics.maxDrawdown <= TARGET_MAX_DRAWDOWN_MAX;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Performance Dashboard</h1>
        <p className="text-muted-foreground">
          Track your trading performance and metrics
        </p>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <Alert variant="destructive" data-testid="alert-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to Load Performance Data</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              {error instanceof Error 
                ? error.message 
                : "We couldn't load your trading performance data. This might be due to a network issue or server problem."}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              data-testid="button-retry"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      ) : closedTrades.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No closed trades yet. Complete some trades to see your performance metrics.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="card-win-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-mono font-semibold" data-testid="text-win-rate">
                  {metrics.winRate.toFixed(1)}%
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={isWinRateMet ? "default" : "destructive"} className="text-xs">
                    Target: {TARGET_WIN_RATE_MIN}-{TARGET_WIN_RATE_MAX}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.winningTrades}W / {metrics.losingTrades}L
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-profit-factor">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-mono font-semibold" data-testid="text-profit-factor">
                  {metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={isProfitFactorMet ? "default" : "destructive"} className="text-xs">
                    Target: &gt;{TARGET_PROFIT_FACTOR}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Gross P/L Ratio
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-max-drawdown">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-mono font-semibold" data-testid="text-max-drawdown">
                  {metrics.maxDrawdown.toFixed(1)}%
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={isDrawdownMet ? "default" : "destructive"} className="text-xs">
                    Target: {TARGET_MAX_DRAWDOWN_MIN}-{TARGET_MAX_DRAWDOWN_MAX}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Peak-to-Trough Decline
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-total-pl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-mono font-semibold ${
                    metrics.totalPL >= 0 ? "text-profit" : "text-loss"
                  }`}
                  data-testid="text-total-pl"
                >
                  ${Math.abs(metrics.totalPL).toFixed(2)}
                  {metrics.totalPL >= 0 ? (
                    <TrendingUp className="h-4 w-4 inline ml-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 inline ml-1" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.totalPLPercent >= 0 ? "+" : ""}
                  {metrics.totalPLPercent.toFixed(2)}% ROI
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card data-testid="card-avg-win-loss">
              <CardHeader>
                <CardTitle>Average Win vs Average Loss</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Average Win</span>
                  <span className="font-mono font-medium text-profit" data-testid="text-avg-win">
                    ${metrics.averageWin.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Average Loss</span>
                  <span className="font-mono font-medium text-loss" data-testid="text-avg-loss">
                    ${metrics.averageLoss.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Win/Loss Ratio</span>
                  <span className="font-mono font-semibold" data-testid="text-win-loss-ratio">
                    {metrics.averageLoss > 0
                      ? (metrics.averageWin / metrics.averageLoss).toFixed(2)
                      : "∞"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-trade-stats">
              <CardHeader>
                <CardTitle>Trade Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Trades</span>
                  <span className="font-mono font-medium" data-testid="text-total-trades">
                    {metrics.totalTrades}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Winning Trades</span>
                  <span className="font-mono font-medium text-profit" data-testid="text-winning-trades">
                    {metrics.winningTrades}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Losing Trades</span>
                  <span className="font-mono font-medium text-loss" data-testid="text-losing-trades">
                    {metrics.losingTrades}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {equityCurve.length > 0 && (
            <Card data-testid="card-equity-curve">
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
                <CardDescription>Cumulative P&L over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={equityCurve} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--popover-border))",
                        borderRadius: "6px",
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
                    />
                    <Legend />
                    <ReferenceLine
                      y={0}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="3 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativePL"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={false}
                      name="Cumulative P&L"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {strategyBreakdown.length > 0 && (
            <Card data-testid="card-strategy-breakdown">
              <CardHeader>
                <CardTitle>Strategy Breakdown</CardTitle>
                <CardDescription>Performance grouped by strategy</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strategy</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Total P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {strategyBreakdown.map((strategy) => (
                      <TableRow key={strategy.strategyId || "none"} data-testid={`row-strategy-${strategy.strategyId || "none"}`}>
                        <TableCell className="font-medium">
                          {strategy.strategyName}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {strategy.trades}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {strategy.winRate.toFixed(1)}%
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            strategy.totalPL >= 0 ? "text-profit" : "text-loss"
                          }`}
                        >
                          ${Math.abs(strategy.totalPL).toFixed(2)}
                          {strategy.totalPL >= 0 ? (
                            <TrendingUp className="h-3 w-3 inline ml-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 inline ml-1" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
