import { useMemo, useState } from "react";
import { Link } from "wouter";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Trophy,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Gauge,
  Zap,
} from "lucide-react";
import type { StrategyRun } from "@shared/schema";

interface StrategyRunSummary {
  totalRuns: number;
  activeRuns: number;
  closedRuns: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  averagePnlPercent: number;
  bestPnlPercent: number | null;
  worstPnlPercent: number | null;
  cumulativePnlPercent: number;
  paperRuns: number;
  liveRuns: number;
  paperClosedRuns: number;
  liveClosedRuns: number;
}

interface HistoryResponse {
  runs: StrategyRun[];
  summary: StrategyRunSummary;
}

const ACTIVE_STATUSES = ["watching", "entering", "in_position", "exiting", "paused"];

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "in_position") return "default";
  if (status === "error" || status === "paused") return "destructive";
  if (status === "closed") return "outline";
  return "secondary";
}

function exitReasonLabel(reason: string | null): string {
  if (!reason) return "—";
  const map: Record<string, string> = {
    target: "Profit target",
    stop: "Stop loss",
    trailing: "Trailing stop",
    time: "Time stop",
    manual: "Manual",
    error: "Error",
  };
  return map[reason] ?? reason;
}

function pnlClass(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

function formatPnl(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-md" />
        ))}
      </div>
      <Skeleton className="h-[320px] w-full rounded-md" />
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  valueClass?: string;
  testId: string;
}

function KpiCard({ title, value, icon: Icon, sub, valueClass, testId }: KpiCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-mono font-semibold ${valueClass ?? ""}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function StrategyPerformance() {
  const { data, isLoading, isError, error, refetch } = useQuery<HistoryResponse>({
    queryKey: ["/api/strategy-runs/history"],
    refetchInterval: 10000,
  });

  const [modeFilter, setModeFilter] = useState<"all" | "paper" | "live">("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");

  const runs = data?.runs ?? [];
  const summary = data?.summary;

  const templateOptions = useMemo(() => {
    const map = new Map<string, string>();
    runs.forEach((r) => map.set(r.templateId, r.templateName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [runs]);

  const symbolOptions = useMemo(() => {
    return Array.from(new Set(runs.map((r) => r.symbol))).sort();
  }, [runs]);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (modeFilter !== "all" && r.mode !== modeFilter) return false;
      if (templateFilter !== "all" && r.templateId !== templateFilter) return false;
      if (symbolFilter !== "all" && r.symbol !== symbolFilter) return false;
      return true;
    });
  }, [runs, modeFilter, templateFilter, symbolFilter]);

  // Cumulative P&L curve from closed runs in the filtered set, ordered by close
  // time. pnlPercent is server-computed; we only sum it here for the visual.
  const equityCurve = useMemo(() => {
    const closed = filteredRuns
      .filter((r) => r.status === "closed" && r.pnlPercent !== null && r.pnlPercent !== undefined)
      .sort((a, b) => {
        const at = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const bt = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return at - bt;
      });
    let cumulative = 0;
    return closed.map((r, idx) => {
      cumulative += r.pnlPercent ?? 0;
      return {
        label: `${r.symbol} #${idx + 1}`,
        cumulativePnl: Number(cumulative.toFixed(2)),
        runPnl: r.pnlPercent ?? 0,
      };
    });
  }, [filteredRuns]);

  const hasFilters = modeFilter !== "all" || templateFilter !== "all" || symbolFilter !== "all";

  return (
    <div className="space-y-6 max-w-6xl mx-auto" data-testid="page-strategy-performance">
      <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Runner Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Every auto-run you&apos;ve armed — paper and live — with realized P&amp;L and exit reasons.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" data-testid="link-arm-strategy">
          <Link href="/builder">
            <Zap className="h-4 w-4 mr-2" />
            Arm a strategy
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <Alert variant="destructive" data-testid="alert-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load run history</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              {error instanceof Error
                ? error.message
                : "We couldn't load your strategy run history. This might be a network or server issue."}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : runs.length === 0 ? (
        <Card data-testid="empty-runs">
          <CardContent className="flex flex-col items-center justify-center text-center py-16 space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Activity className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-medium">No runs yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Arm a strategy template and the engine will watch live prices and trade it for you
                (paper by default). Once a run opens and closes, it shows up here with its result.
              </p>
            </div>
            <Button asChild data-testid="button-empty-arm-strategy">
              <Link href="/builder">
                <Zap className="h-4 w-4 mr-2" />
                Arm your first strategy
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI header — overall, from the server summary. */}
          {summary && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Total Runs"
                value={String(summary.totalRuns)}
                icon={BarChart3}
                sub={`${summary.activeRuns} active · ${summary.closedRuns} closed`}
                testId="card-total-runs"
              />
              <KpiCard
                title="Win Rate"
                value={summary.closedRuns > 0 ? `${summary.winRate.toFixed(1)}%` : "—"}
                icon={Trophy}
                sub={`${summary.wins}W / ${summary.losses}L${
                  summary.breakeven > 0 ? ` / ${summary.breakeven}BE` : ""
                }`}
                testId="card-win-rate"
              />
              <KpiCard
                title="Average P&L"
                value={summary.closedRuns > 0 ? formatPnl(summary.averagePnlPercent) : "—"}
                icon={Gauge}
                valueClass={summary.closedRuns > 0 ? pnlClass(summary.averagePnlPercent) : ""}
                sub={`Total realized ${formatPnl(summary.cumulativePnlPercent)}`}
                testId="card-avg-pnl"
              />
              <KpiCard
                title="Paper vs Live"
                value={`${summary.paperRuns} / ${summary.liveRuns}`}
                icon={Zap}
                sub={`${summary.paperClosedRuns} / ${summary.liveClosedRuns} closed`}
                testId="card-paper-live"
              />
            </div>
          )}

          {summary && summary.closedRuns > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card data-testid="card-best-run">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Best Run</CardTitle>
                  <TrendingUp className="h-4 w-4 text-profit" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-mono font-semibold ${pnlClass(summary.bestPnlPercent ?? 0)}`}
                    data-testid="text-best-run"
                  >
                    {formatPnl(summary.bestPnlPercent)}
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-worst-run">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Worst Run</CardTitle>
                  <TrendingDown className="h-4 w-4 text-loss" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-mono font-semibold ${pnlClass(summary.worstPnlPercent ?? 0)}`}
                    data-testid="text-worst-run"
                  >
                    {formatPnl(summary.worstPnlPercent)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 py-4">
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Mode</span>
                <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as typeof modeFilter)}>
                  <SelectTrigger className="w-36" data-testid="select-filter-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modes</SelectItem>
                    <SelectItem value="paper">Paper</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Template</span>
                <Select value={templateFilter} onValueChange={setTemplateFilter}>
                  <SelectTrigger className="w-56" data-testid="select-filter-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All templates</SelectItem>
                    {templateOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Symbol</span>
                <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                  <SelectTrigger className="w-36" data-testid="select-filter-symbol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All symbols</SelectItem>
                    {symbolOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setModeFilter("all");
                    setTemplateFilter("all");
                    setSymbolFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Cumulative P&L chart */}
          <Card data-testid="card-equity-curve">
            <CardHeader>
              <CardTitle>Cumulative P&L</CardTitle>
              <CardDescription>
                Running total of realized return across closed runs{hasFilters ? " (filtered)" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {equityCurve.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No closed runs to chart yet. Let a run open and close to build the curve.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={equityCurve} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="label"
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--popover-border))",
                        borderRadius: "6px",
                      }}
                      formatter={(value: number, name: string) => [
                        `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
                        name === "cumulativePnl" ? "Cumulative" : "Run",
                      ]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="cumulativePnl"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="cumulativePnl"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Runs table */}
          <Card data-testid="card-runs-table">
            <CardHeader>
              <CardTitle>Run History</CardTitle>
              <CardDescription>
                {filteredRuns.length} run{filteredRuns.length === 1 ? "" : "s"}
                {hasFilters ? ` (of ${runs.length})` : ""}, most recent first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredRuns.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No runs match the current filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Strategy</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Exit</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead>Exit reason</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Ended</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRuns.map((run) => {
                        const isClosed = run.status === "closed";
                        const isActive = ACTIVE_STATUSES.includes(run.status);
                        const pnl = run.pnlPercent ?? 0;
                        const showPnl = isClosed || run.status === "in_position";
                        return (
                          <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                            <TableCell className="font-medium" data-testid={`text-run-template-${run.id}`}>
                              {run.templateName}
                            </TableCell>
                            <TableCell className="font-mono" data-testid={`text-run-symbol-${run.id}`}>
                              {run.symbol}
                            </TableCell>
                            <TableCell>
                              <Badge variant={run.mode === "live" ? "default" : "secondary"}>
                                {run.mode === "live" ? "LIVE" : "Paper"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={statusBadgeVariant(run.status)}
                                data-testid={`badge-run-status-${run.id}`}
                              >
                                {run.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {run.entryPrice != null ? `$${run.entryPrice.toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {isClosed && run.currentPrice != null
                                ? `$${run.currentPrice.toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-medium ${
                                showPnl ? pnlClass(pnl) : "text-muted-foreground"
                              }`}
                              data-testid={`text-run-pnl-${run.id}`}
                            >
                              {showPnl ? formatPnl(pnl) : "—"}
                              {isActive && !isClosed ? "" : ""}
                            </TableCell>
                            <TableCell data-testid={`text-run-exit-reason-${run.id}`}>
                              {isClosed ? exitReasonLabel(run.exitReason) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatDateTime(run.createdAt)}
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatDateTime(run.closedAt)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
