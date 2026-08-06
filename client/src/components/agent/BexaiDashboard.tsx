import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, Cpu, Activity, AlertTriangle, Wrench, CheckCircle2, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentActivityEntry {
  id: string;
  ts: number;
  kind: "system" | "tool_call" | "tool_result" | "error" | "thought";
  title: string;
  detail?: string;
  confidence?: number;
}

const SIM_THOUGHTS: { title: string; detail: string; confidence: number }[] = [
  { title: "Scanning AI supply-chain tickers", detail: "Cross-referencing news flow against held positions", confidence: 0.82 },
  { title: "Evaluating NVDA momentum", detail: "RSI 61, above 20-day MA; bias constructive", confidence: 0.74 },
  { title: "Arbitrage sweep: SPY vs basket", detail: "Spread within 4bps — no actionable edge", confidence: 0.58 },
  { title: "Risk check on portfolio beta", detail: "Aggregate beta 1.12, within tolerance", confidence: 0.9 },
  { title: "Monitoring buying power", detail: "Reserve maintained for opportunistic entries", confidence: 0.95 },
  { title: "Sentiment delta on TSLA", detail: "Social sentiment cooling; trimming conviction", confidence: 0.49 },
];

function kindMeta(kind: AgentActivityEntry["kind"]) {
  switch (kind) {
    case "tool_call":
      return { icon: Wrench, color: "text-primary", bg: "bg-primary/10" };
    case "tool_result":
      return { icon: CheckCircle2, color: "text-profit", bg: "bg-profit/10" };
    case "error":
      return { icon: AlertTriangle, color: "text-loss", bg: "bg-loss/10" };
    case "thought":
      return { icon: Brain, color: "text-primary", bg: "bg-primary/10" };
    default:
      return { icon: Cpu, color: "text-muted-foreground", bg: "bg-muted" };
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function BexaiDashboard({
  connected,
  activity,
  demo = false,
}: {
  connected: boolean;
  activity: AgentActivityEntry[];
  demo?: boolean;
}) {
  const [simFeed, setSimFeed] = useState<AgentActivityEntry[]>([]);

  // On the marketing landing preview only (demo=true), animate a simulated
  // thought stream to demonstrate the live agentic experience. On the real
  // terminal we never fabricate activity — an unconnected agent shows an empty
  // "standing by" state instead.
  useEffect(() => {
    if (connected || !demo) {
      setSimFeed([]);
      return;
    }
    const push = () => {
      const t = SIM_THOUGHTS[Math.floor(Math.random() * SIM_THOUGHTS.length)];
      setSimFeed((prev) =>
        [{ id: `${Date.now()}-${Math.random()}`, ts: Date.now(), kind: "thought" as const, ...t }, ...prev].slice(0, 30),
      );
    };
    push();
    const interval = setInterval(push, 3500);
    return () => clearInterval(interval);
  }, [connected, demo]);

  const feed = connected ? activity : demo ? simFeed : activity;

  const confidences = feed.map((f) => f.confidence).filter((c): c is number => typeof c === "number");
  const avgConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
    : 0;
  const toolCalls = feed.filter((f) => f.kind === "tool_call").length;
  const arbScans = feed.filter((f) => /arb/i.test(f.title)).length + (connected || !demo ? 0 : Math.max(1, toolCalls));

  return (
    <Card className="glass-panel flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                connected ? "bg-profit" : "bg-amber-400",
              )}
            />
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                connected ? "bg-profit" : "bg-amber-400",
              )}
            />
          </span>
          <Brain className="h-4 w-4 text-primary" />
          Live Agent Activity
        </CardTitle>
        <Badge variant={connected ? "default" : "secondary"} data-testid="badge-agent-mode">
          {connected ? "Live Agent" : demo ? "Demo Preview" : "Not Connected"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-card/40 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Confidence</div>
            <div className="text-lg font-semibold text-primary" data-testid="text-confidence">{avgConfidence}%</div>
          </div>
          <div className="rounded-md bg-card/40 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Tool Calls</div>
            <div className="text-lg font-semibold" data-testid="text-tool-calls">{toolCalls}</div>
          </div>
          <div className="rounded-md bg-card/40 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Arb Scans</div>
            <div className="text-lg font-semibold" data-testid="text-arb-scans">{arbScans}</div>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Aggregate conviction</span>
            <span>{avgConfidence}%</span>
          </div>
          <Progress value={avgConfidence} />
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1 min-h-[320px] max-h-[560px]" data-testid="list-agent-feed">
          {feed.length === 0 && (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
              data-testid="empty-agent-feed"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Brain className="h-6 w-6 text-primary" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Your agent is standing by</p>
                <p className="text-xs text-muted-foreground">
                  Connect your Robinhood agent to watch it analyze and trade in real time.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                data-testid="button-empty-connect"
                onClick={() => {
                  const el = document.querySelector<HTMLElement>(
                    '[data-testid="button-connect-agent"]',
                  );
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.focus();
                }}
              >
                <Link2 className="h-4 w-4" />
                Connect your agent
              </Button>
            </div>
          )}
          {feed.map((entry) => {
            const meta = kindMeta(entry.kind);
            const Icon = meta.icon;
            return (
              <div
                key={entry.id}
                className="rounded-md border border-border/60 bg-card/30 p-3"
                data-testid={`feed-entry-${entry.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", meta.bg)}>
                      <Icon className={cn("h-4 w-4", meta.color)} />
                    </span>
                    <div>
                      <div className="text-sm font-medium leading-tight">{entry.title}</div>
                      {entry.detail && (
                        <div className="mt-0.5 text-xs text-muted-foreground break-words">{entry.detail}</div>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(entry.ts)}</span>
                </div>
                {typeof entry.confidence === "number" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={Math.round(entry.confidence * 100)} className="h-1" />
                    <span className="text-[10px] text-muted-foreground">{Math.round(entry.confidence * 100)}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
