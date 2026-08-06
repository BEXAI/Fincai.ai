import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Terminal, Wrench, Send, Bot } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AgentConnect } from "@/components/agent/AgentConnect";
import { AgentLanding } from "@/components/agent/AgentLanding";
import { AgentTradeForm } from "@/components/agent/AgentTradeForm";
import { AgentOrdersProvider, AgentRecentOrders } from "@/components/agent/agent-orders";
import { BexaiDashboard, type AgentActivityEntry } from "@/components/agent/BexaiDashboard";
import { PortfolioView } from "@/components/agent/PortfolioView";
import { DefaultAgentButton } from "@/components/default-agent-button";
import { Seo } from "@/components/seo";

interface AgentStatus {
  status: "disconnected" | "authorizing" | "connected" | "error";
  endpoint: string;
  authorizationUrl?: string;
  lastError?: string;
  tools: { name: string; description?: string }[];
  activity: AgentActivityEntry[];
  connectedAt?: number;
}

function ToolConsole({ status }: { status: AgentStatus }) {
  const { toast } = useToast();
  const connected = status.status === "connected";
  const [toolName, setToolName] = useState("");
  const [args, setArgs] = useState("{}");
  const [output, setOutput] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (connected && status.tools.length && !toolName) {
      setToolName(status.tools[0].name);
    }
  }, [connected, status.tools, toolName]);

  const run = async () => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = args.trim() ? JSON.parse(args) : {};
    } catch {
      toast({ title: "Invalid JSON arguments", variant: "destructive" });
      return;
    }
    setBusy(true);
    setOutput("");
    try {
      const res = await apiRequest("POST", "/api/agent/tools/call", { name: toolName, arguments: parsedArgs });
      const data = await res.json();
      setOutput(JSON.stringify(data.result ?? data, null, 2));
    } catch (err: any) {
      setOutput(`Error: ${err?.message ?? "Tool call failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4 text-primary" />
          MCP Tool Console
        </CardTitle>
        <Badge variant="secondary">{status.tools.length} tools</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {!connected ? (
          <p className="text-sm text-muted-foreground">
            Connect the Robinhood Trading agent to discover and invoke its MCP tools
            (e.g. <code className="text-xs">get_quote</code>, <code className="text-xs">get_holdings</code>,{" "}
            <code className="text-xs">place_order</code>).
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {status.tools.map((t) => (
                <Button
                  key={t.name}
                  variant={toolName === t.name ? "default" : "outline"}
                  size="sm"
                  onClick={() => setToolName(t.name)}
                  className="gap-1"
                  data-testid={`button-tool-${t.name}`}
                >
                  <Wrench className="h-3 w-3" />
                  {t.name}
                </Button>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Arguments (JSON)</label>
              <Textarea
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                rows={3}
                className="font-mono text-base md:text-xs"
                placeholder='{"symbol": "NVDA"}'
                data-testid="input-tool-args"
              />
            </div>
            <Button onClick={run} disabled={busy || !toolName} className="gap-2" data-testid="button-run-tool">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Invoke {toolName || "tool"}
            </Button>
            {output && (
              <pre className="max-h-64 overflow-auto rounded-md bg-card/60 p-3 text-xs" data-testid="text-tool-output">
                {output}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AgentTerminalProps {
  isAuthenticated?: boolean;
  onNavigateToAuth?: (mode: "login" | "register") => void;
}

export default function AgentTerminal({ isAuthenticated = true, onNavigateToAuth }: AgentTerminalProps = {}) {
  const { toast } = useToast();

  const { data: status } = useQuery<AgentStatus>({
    queryKey: ["/api/agent/status"],
    refetchInterval: 4000,
  });

  // Surface OAuth callback results passed back as query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("agent_connected")) {
      toast({ title: "Agent connected", description: "Robinhood Trading MCP is live." });
      window.history.replaceState({}, "", "/");
    } else if (params.get("agent_error")) {
      toast({ title: "Authorization failed", description: params.get("agent_error") || "", variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, [toast]);

  const current: AgentStatus =
    status ?? { status: "disconnected", endpoint: "https://agent.robinhood.com/mcp/trading", tools: [], activity: [] };
  const connected = current.status === "connected";

  // Pre-connection: show the flagship marketing-grade landing. Once an agent is
  // connected, show the working dashboard. AgentOrdersProvider wraps both so the
  // order-tracking context is available the instant a connection comes alive.
  return (
    <AgentOrdersProvider status={current}>
      <Seo path="/" />
      {!connected ? (
        <AgentLanding
          status={current}
          isAuthenticated={isAuthenticated}
          onNavigateToAuth={onNavigateToAuth}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-semibold">Your Trading Agent</h1>
              </div>
              <p className="text-muted-foreground">
                Your AI trading agent is live. Watch it analyze the market in real time and place manual trades on your confirmation.
              </p>
            </div>
            <DefaultAgentButton />
          </div>

          {/* Compact connected status bar */}
          <AgentConnect status={current} />

          {/* Hero: the live agent activity feed alongside the live portfolio */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <BexaiDashboard connected={connected} activity={current.activity} />
            </div>
            <div className="lg:col-span-1">
              <PortfolioView connected={connected} />
            </div>
          </div>

          {/* Supporting tools: trading, order history, and the raw MCP console */}
          <div className="grid gap-6 lg:grid-cols-2">
            <AgentTradeForm status={current} />
            <div className="space-y-6">
              <AgentRecentOrders />
              <ToolConsole status={current} />
            </div>
          </div>
        </div>
      )}
    </AgentOrdersProvider>
  );
}
