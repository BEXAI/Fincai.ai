import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  STRATEGY_TEMPLATES,
  getStrategyTemplate,
  getEquityRunDefaults,
} from "@shared/strategy-templates";
import type { StrategyRun } from "@shared/schema";
import { Activity, ShieldAlert, Square, Zap, TrendingUp, TrendingDown, History } from "lucide-react";

const ACTIVE_STATUSES = ["watching", "entering", "in_position", "exiting", "paused"];

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "in_position") return "default";
  if (status === "error" || status === "paused") return "destructive";
  if (status === "closed") return "outline";
  return "secondary";
}

function triggerLabel(type: string, threshold: number, direction: string): string {
  if (type === "immediate") return "Enters immediately when started";
  if (type === "momentum") {
    return direction === "short"
      ? `Enters after a ${threshold}% drop (momentum)`
      : `Enters after a ${threshold}% rise (momentum)`;
  }
  // reversion
  return direction === "short"
    ? `Enters after a ${threshold}% spike, fading it (reversion)`
    : `Enters after a ${threshold}% dip, buying it (reversion)`;
}

interface Props {
  initialTemplateId?: string;
}

export function StrategyRunnerPanel({ initialTemplateId }: Props) {
  const { toast } = useToast();

  const firstTemplate = STRATEGY_TEMPLATES[0];
  const initial = getStrategyTemplate(initialTemplateId ?? "") ?? firstTemplate;
  const initialDefaults = getEquityRunDefaults(initial);

  const [templateId, setTemplateId] = useState(initial.id);
  const [symbol, setSymbol] = useState(initial.preset.defaultSymbol);
  const [quantity, setQuantity] = useState<number>(1);
  const [live, setLive] = useState(false);
  const [stopLossPercent, setStopLossPercent] = useState<number>(initialDefaults.stopLossPercent);
  const [profitTargetPercent, setProfitTargetPercent] = useState<number>(
    initialDefaults.profitTargetPercent,
  );
  const [useTrailingStop, setUseTrailingStop] = useState<boolean>(initialDefaults.useTrailingStop);
  const [trailingStopPercent, setTrailingStopPercent] = useState<number>(
    initialDefaults.trailingStopPercent,
  );
  const [timeStopMinutes, setTimeStopMinutes] = useState<number | "">(
    initialDefaults.timeStopMinutes ?? "",
  );
  const [entryThresholdPct, setEntryThresholdPct] = useState<number>(
    initialDefaults.entryThresholdPct,
  );

  const template = getStrategyTemplate(templateId) ?? initial;
  const defaults = useMemo(() => getEquityRunDefaults(template), [template]);
  const direction = defaults.direction;
  const isShort = direction === "short";

  const { data: agentStatus } = useQuery<{ status: string }>({
    queryKey: ["/api/agent/status"],
  });
  const connected = agentStatus?.status === "connected";

  const { data: runs = [] } = useQuery<StrategyRun[]>({
    queryKey: ["/api/strategy-runs"],
    // Poll fast only while a run is live; idle panels back off to 30s.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((r) => ACTIVE_STATUSES.includes(r.status)) ? 5000 : 30000;
    },
  });

  function applyTemplate(id: string) {
    const t = getStrategyTemplate(id);
    if (!t) return;
    const d = getEquityRunDefaults(t);
    setTemplateId(id);
    setSymbol(t.preset.defaultSymbol);
    setStopLossPercent(d.stopLossPercent);
    setProfitTargetPercent(d.profitTargetPercent);
    setUseTrailingStop(d.useTrailingStop);
    setTrailingStopPercent(d.trailingStopPercent);
    setTimeStopMinutes(d.timeStopMinutes ?? "");
    setEntryThresholdPct(d.entryThresholdPct);
    // Live is long-only; if the new template is short, fall back to paper.
    if (d.direction === "short") setLive(false);
  }

  const createMutation = useMutation({
    mutationFn: async (mode: "paper" | "live") => {
      const payload = {
        templateId,
        symbol: symbol.trim().toUpperCase(),
        quantity,
        mode,
        stopLossPercent,
        profitTargetPercent,
        useTrailingStop,
        trailingStopPercent: useTrailingStop ? trailingStopPercent : undefined,
        timeStopMinutes: timeStopMinutes === "" ? undefined : timeStopMinutes,
        entryThresholdPct: defaults.entryTriggerType === "immediate" ? undefined : entryThresholdPct,
      };
      const res = await apiRequest("POST", "/api/strategy-runs", payload);
      return await res.json();
    },
    onSuccess: (_data, mode) => {
      toast({
        title: mode === "live" ? "Live run started" : "Paper run started",
        description: `${template.name} is now watching ${symbol.toUpperCase()} for entry.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-runs"] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't start run",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/strategy-runs/${id}/stop`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't stop run", description: err?.message, variant: "destructive" });
    },
  });

  const killSwitchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/strategy-runs/kill-switch", {});
      return await res.json();
    },
    onSuccess: (data: { count: number }) => {
      toast({
        title: "All runs stopped",
        description: `Stopped ${data.count} active run${data.count === 1 ? "" : "s"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-runs"] });
    },
  });

  const validQuantity = quantity > 0;
  const validRules = stopLossPercent > 0 && profitTargetPercent > 0;
  const canSubmit = validQuantity && validRules && symbol.trim().length > 0;

  const activeRuns = runs.filter((r) => ACTIVE_STATUSES.includes(r.status));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Configure */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto-Run a Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Arm a template and the engine watches live prices, then applies its entry, stop, target,
            and trailing rules for you — on stocks (equity).
          </p>

          <div className="space-y-2">
            <Label htmlFor="runner-template">Strategy template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger id="runner-template" data-testid="select-runner-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id} data-testid={`option-template-${t.id}`}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isShort ? (
                <TrendingDown className="h-3.5 w-3.5" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5" />
              )}
              <span data-testid="text-trigger-label">
                {triggerLabel(defaults.entryTriggerType, entryThresholdPct, direction)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="runner-symbol">Symbol</Label>
              <Input
                id="runner-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="uppercase font-mono"
                data-testid="input-runner-symbol"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runner-qty">Shares</Label>
              <Input
                id="runner-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="font-mono"
                data-testid="input-runner-quantity"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="runner-stop" className="text-xs">
                Stop loss %
              </Label>
              <Input
                id="runner-stop"
                type="number"
                step="0.1"
                value={stopLossPercent}
                onChange={(e) => setStopLossPercent(parseFloat(e.target.value) || 0)}
                className="h-8 font-mono"
                data-testid="input-runner-stop"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runner-target" className="text-xs">
                Profit target %
              </Label>
              <Input
                id="runner-target"
                type="number"
                step="0.1"
                value={profitTargetPercent}
                onChange={(e) => setProfitTargetPercent(parseFloat(e.target.value) || 0)}
                className="h-8 font-mono"
                data-testid="input-runner-target"
              />
            </div>
          </div>

          {defaults.entryTriggerType !== "immediate" && (
            <div className="space-y-2">
              <Label htmlFor="runner-threshold" className="text-xs">
                Entry trigger %
              </Label>
              <Input
                id="runner-threshold"
                type="number"
                step="0.1"
                value={entryThresholdPct}
                onChange={(e) => setEntryThresholdPct(parseFloat(e.target.value) || 0)}
                className="h-8 font-mono"
                data-testid="input-runner-threshold"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="runner-time" className="text-xs">
              Time stop (minutes, optional)
            </Label>
            <Input
              id="runner-time"
              type="number"
              value={timeStopMinutes}
              onChange={(e) =>
                setTimeStopMinutes(e.target.value === "" ? "" : parseInt(e.target.value) || 0)
              }
              className="h-8 font-mono"
              data-testid="input-runner-time"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="runner-trailing"
              checked={useTrailingStop}
              onCheckedChange={(c) => setUseTrailingStop(!!c)}
              data-testid="checkbox-runner-trailing"
            />
            <Label htmlFor="runner-trailing" className="text-xs cursor-pointer">
              Use trailing stop
            </Label>
            {useTrailingStop && (
              <Input
                type="number"
                step="0.1"
                value={trailingStopPercent}
                onChange={(e) => setTrailingStopPercent(parseFloat(e.target.value) || 0)}
                className="h-8 w-20 font-mono ml-auto"
                data-testid="input-runner-trailing-pct"
              />
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="runner-live" className="text-sm font-medium">
                Live trading
              </Label>
              <p className="text-xs text-muted-foreground">
                {live ? "Real money via Robinhood" : "Paper (simulated) — no real orders"}
              </p>
            </div>
            <Switch
              id="runner-live"
              checked={live}
              disabled={isShort}
              onCheckedChange={setLive}
              data-testid="switch-runner-live"
            />
          </div>

          {isShort && (
            <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This is a short strategy. Live trading is long-only for now, so it runs in paper
                mode.
              </span>
            </div>
          )}

          {live && !connected && (
            <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Live trading needs a connected Robinhood agent.
                </p>
                <Button asChild size="sm" variant="outline" data-testid="link-connect-agent">
                  <Link href="/agent">Connect Robinhood</Link>
                </Button>
              </div>
            </div>
          )}

          {/* Start button */}
          {live ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="w-full"
                  disabled={!canSubmit || !connected || createMutation.isPending}
                  data-testid="button-start-live"
                >
                  Start live run
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Start a live run with real money?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will let the engine automatically buy and sell{" "}
                    <span className="font-medium text-foreground">
                      {quantity} share{quantity === 1 ? "" : "s"} of {symbol.toUpperCase()}
                    </span>{" "}
                    in your real Robinhood account, with no further confirmation. It exits on your
                    stop loss ({stopLossPercent}%), profit target ({profitTargetPercent}%)
                    {useTrailingStop ? `, trailing stop (${trailingStopPercent}%)` : ""}
                    {timeStopMinutes !== "" ? `, or after ${timeStopMinutes} minutes` : ""}. You can
                    stop it any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-live">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => createMutation.mutate("live")}
                    data-testid="button-confirm-live"
                  >
                    Yes, trade live
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              className="w-full"
              variant="outline"
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate("paper")}
              data-testid="button-start-paper"
            >
              Start paper run
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Active runs */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Your Runs
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline" data-testid="link-runner-performance">
              <Link href="/strategy-performance">
                <History className="h-4 w-4 mr-2" />
                History
              </Link>
            </Button>
            {activeRuns.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => killSwitchMutation.mutate()}
                disabled={killSwitchMutation.isPending}
                data-testid="button-kill-switch"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No runs yet. Arm a template on the left to start one.
              </p>
            </div>
          ) : (
            runs.map((run) => {
              const isActive = ACTIVE_STATUSES.includes(run.status);
              const pnl = run.pnlPercent ?? 0;
              return (
                <div
                  key={run.id}
                  className="rounded-md border p-3 space-y-2"
                  data-testid={`run-card-${run.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium" data-testid={`text-run-symbol-${run.id}`}>
                        {run.symbol}
                      </span>
                      <Badge variant={run.mode === "live" ? "default" : "secondary"}>
                        {run.mode === "live" ? "LIVE" : "Paper"}
                      </Badge>
                      <Badge variant={statusBadgeVariant(run.status)} data-testid={`badge-run-status-${run.id}`}>
                        {run.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => stopMutation.mutate(run.id)}
                        disabled={stopMutation.isPending}
                        data-testid={`button-stop-run-${run.id}`}
                      >
                        Stop
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{run.templateName}</span>
                    {(run.status === "in_position" || run.status === "closed") && (
                      <span
                        className={`font-mono font-medium ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}
                        data-testid={`text-run-pnl-${run.id}`}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {pnl.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  {run.lastMessage && (
                    <p className="text-xs text-muted-foreground" data-testid={`text-run-message-${run.id}`}>
                      {run.lastMessage}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
