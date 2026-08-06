import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  Cpu,
  Wrench,
  CheckCircle2,
  Activity,
  ShieldCheck,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StepKind = "system" | "thought" | "tool_call" | "confirm" | "tool_result" | "result";

interface DemoStep {
  kind: StepKind;
  title: string;
  detail?: string;
  confidence?: number;
  /** ms to wait before revealing the NEXT step */
  delay: number;
}

// A deterministic, scripted "watch it trade" replay. Unlike the random demo
// feed, this tells one complete story end-to-end: scan → conviction →
// proposal → your confirmation → fill → result.
const SCRIPT: DemoStep[] = [
  {
    kind: "system",
    title: "Agent online — scanning your watchlist",
    detail: "NVDA · SPY · TSLA · AAPL",
    delay: 1400,
  },
  {
    kind: "thought",
    title: "NVDA setup forming",
    detail: "Breaking 20-day high on +38% relative volume",
    confidence: 0.71,
    delay: 1600,
  },
  {
    kind: "tool_call",
    title: "get_quote(NVDA)",
    detail: "Pulling live bid/ask and microstructure",
    delay: 1200,
  },
  {
    kind: "tool_result",
    title: "NVDA $124.30 · spread 2bps",
    detail: "Liquidity healthy — clean entry available",
    delay: 1500,
  },
  {
    kind: "thought",
    title: "Conviction confirmed — sizing the entry",
    detail: "25 shares keeps risk inside today's budget",
    confidence: 0.86,
    delay: 1600,
  },
  {
    kind: "tool_call",
    title: "place_order · BUY 25 NVDA @ market",
    detail: "Proposing order — waiting for your approval",
    delay: 1700,
  },
  {
    kind: "confirm",
    title: "You confirmed the order",
    detail: "Nothing executes until you say so",
    delay: 1500,
  },
  {
    kind: "tool_result",
    title: "Filled · 25 NVDA @ $124.32",
    detail: "Order routed and confirmed by Robinhood",
    delay: 1600,
  },
  {
    kind: "result",
    title: "Position opened — +$48.50 unrealized",
    detail: "Agent now monitoring the trade in real time",
    confidence: 0.91,
    delay: 2600,
  },
];

const TOTAL_MS = SCRIPT.reduce((a, s) => a + s.delay, 0);

function kindMeta(kind: StepKind) {
  switch (kind) {
    case "tool_call":
      return { icon: Wrench, color: "text-primary", bg: "bg-primary/10", label: "Tool call" };
    case "tool_result":
      return { icon: CheckCircle2, color: "text-profit", bg: "bg-profit/10", label: "Result" };
    case "confirm":
      return { icon: ShieldCheck, color: "text-primary", bg: "bg-primary/10", label: "Your approval" };
    case "thought":
      return { icon: Brain, color: "text-primary", bg: "bg-primary/10", label: "Reasoning" };
    case "result":
      return { icon: TrendingUp, color: "text-profit", bg: "bg-profit/10", label: "Outcome" };
    default:
      return { icon: Cpu, color: "text-muted-foreground", bg: "bg-muted", label: "System" };
  }
}

export default function AgentTradeDemo() {
  // Number of steps currently revealed (0..SCRIPT.length).
  const [revealed, setRevealed] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Drive the scripted reveal on a timer.
  useEffect(() => {
    setRevealed(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    SCRIPT.forEach((step, i) => {
      timers.push(setTimeout(() => setRevealed(i + 1), elapsed));
      elapsed += step.delay;
    });
    return () => timers.forEach(clearTimeout);
  }, [runKey]);

  // Smooth progress bar tied to the same total duration.
  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / TOTAL_MS) * 100));
      setProgress(pct);
      if (pct >= 100) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [runKey]);

  // Keep the latest step in view as the story plays.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealed]);

  const finished = revealed >= SCRIPT.length;
  const steps = SCRIPT.slice(0, revealed);

  return (
    <Card className="glass-panel flex h-full flex-col" data-testid="agent-trade-demo">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <Activity className="h-4 w-4 text-primary" />
          Watch it trade
        </CardTitle>
        <Badge variant="secondary" data-testid="badge-demo-replay">
          Scripted replay
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Trade walkthrough</span>
            <span data-testid="text-demo-progress">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-2 overflow-y-auto pr-1 min-h-[320px] max-h-[480px] scroll-smooth"
          data-testid="list-demo-feed"
        >
          {steps.map((step, i) => {
            const meta = kindMeta(step.kind);
            const Icon = meta.icon;
            return (
              <div
                key={`${runKey}-${i}`}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-1 rounded-md border p-3 duration-500",
                  step.kind === "confirm" || step.kind === "result"
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-card/30",
                )}
                data-testid={`demo-step-${i}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        meta.bg,
                      )}
                    >
                      <Icon className={cn("h-4 w-4", meta.color)} />
                    </span>
                    <div>
                      <div className="text-sm font-medium leading-tight">{step.title}</div>
                      {step.detail && (
                        <div className="mt-0.5 text-xs text-muted-foreground break-words">
                          {step.detail}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </span>
                </div>
                {typeof step.confidence === "number" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={Math.round(step.confidence * 100)} className="h-1" />
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(step.confidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-center"
          onClick={() => setRunKey((k) => k + 1)}
          data-testid="button-replay-demo"
        >
          <RotateCcw className="h-4 w-4" />
          {finished ? "Replay the trade" : "Restart"}
        </Button>
      </CardContent>
    </Card>
  );
}
