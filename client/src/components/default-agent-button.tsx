import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { getStrategyTemplate } from "@shared/strategy-templates";
import type { StrategyRun } from "@shared/schema";
import { Rocket, ShieldAlert } from "lucide-react";

// The "default agent" arms one template across a curated basket in a single
// click. Basket = MANGO (Microsoft, Apple, Nvidia, Google, Oracle) + FANG
// (Meta, Amazon, Netflix, Google), with GOOGL deduped — 8 unique tickers.
const DEFAULT_AGENT_TEMPLATE_ID = "momentum-breakout-rider";
const DEFAULT_AGENT_SYMBOLS = [
  "MSFT",
  "AAPL",
  "NVDA",
  "GOOGL",
  "ORCL",
  "META",
  "AMZN",
  "NFLX",
] as const;
const DEFAULT_SHARES = 2;

interface BatchResult {
  created: StrategyRun[];
  skipped: { symbol: string; reason: string }[];
}

interface Props {
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function DefaultAgentButton({ variant = "default", size = "default", className }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [shares, setShares] = useState<number>(DEFAULT_SHARES);

  const template = getStrategyTemplate(DEFAULT_AGENT_TEMPLATE_ID);

  const { data: agentStatus } = useQuery<{ status: string }>({
    queryKey: ["/api/agent/status"],
  });
  const connected = agentStatus?.status === "connected";
  const useLive = live && connected;

  const launchMutation = useMutation({
    mutationFn: async (mode: "paper" | "live") => {
      const res = await apiRequest("POST", "/api/strategy-runs/batch", {
        templateId: DEFAULT_AGENT_TEMPLATE_ID,
        symbols: DEFAULT_AGENT_SYMBOLS,
        quantity: shares,
        mode,
      });
      return (await res.json()) as BatchResult;
    },
    onSuccess: (data) => {
      const startedCount = data.created.length;
      const skippedCount = data.skipped.length;
      if (startedCount === 0) {
        toast({
          title: "Couldn't start the default agent",
          description: data.skipped[0]?.reason ?? "No runs could be started.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `Default agent launched — ${startedCount} run${startedCount === 1 ? "" : "s"} armed`,
          description:
            skippedCount > 0
              ? `Skipped ${skippedCount} (${data.skipped.map((s) => s.symbol).join(", ")}). Now watching ${data.created
                  .map((r) => r.symbol)
                  .join(", ")}.`
              : `Now watching ${data.created.map((r) => r.symbol).join(", ")} for entry.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-runs"] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't start the default agent",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const sharesValid = shares > 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className} data-testid="button-default-agent">
          <Rocket className="h-4 w-4 mr-2" />
          New Default Agent
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Launch the default agent</AlertDialogTitle>
          <AlertDialogDescription>
            This arms <span className="font-medium text-foreground">{template?.name ?? "the default strategy"}</span>{" "}
            across {DEFAULT_AGENT_SYMBOLS.length} popular stocks (MANGO + FANG). The engine watches live
            prices and applies the strategy's entry, stop, target, and trailing rules for you — one run
            per stock.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" data-testid="list-default-agent-symbols">
            {DEFAULT_AGENT_SYMBOLS.map((s) => (
              <Badge key={s} variant="secondary" className="font-mono">
                {s}
              </Badge>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-agent-shares">Shares per stock</Label>
            <Input
              id="default-agent-shares"
              type="number"
              min={1}
              value={shares}
              onChange={(e) => setShares(parseInt(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-default-agent-shares"
            />
            <p className="text-xs text-muted-foreground">
              {DEFAULT_AGENT_SYMBOLS.length} runs total. Each run is capped at $10,000 — any stock above
              that cap is skipped.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="default-agent-live" className="text-sm font-medium">
                Live trading
              </Label>
              <p className="text-xs text-muted-foreground">
                {useLive ? "Real money via Robinhood" : "Paper (simulated) — no real orders"}
              </p>
            </div>
            <Switch
              id="default-agent-live"
              checked={useLive}
              disabled={!connected}
              onCheckedChange={setLive}
              data-testid="switch-default-agent-live"
            />
          </div>

          {!connected && (
            <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Live trading needs a connected Robinhood agent — this will launch in paper mode.
                </p>
                <Button asChild size="sm" variant="outline" data-testid="link-default-agent-connect">
                  <Link href="/agent">Connect Robinhood</Link>
                </Button>
              </div>
            </div>
          )}

          {useLive && (
            <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Live mode lets the engine buy and sell these stocks in your real Robinhood account
                automatically (long-only), with no further confirmation per trade. You can stop any run
                at any time.
              </span>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-default-agent-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!sharesValid || launchMutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              launchMutation.mutate(useLive ? "live" : "paper");
            }}
            data-testid="button-default-agent-confirm"
          >
            {launchMutation.isPending
              ? "Launching…"
              : useLive
                ? "Launch live agent"
                : "Launch paper agent"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
